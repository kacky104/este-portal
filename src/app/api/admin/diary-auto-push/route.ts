import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow, hasDiarySendCandidate } from '@/app/lib/media/relayFlow';

// ── 写メ日記の自動反映の周（第137便・2026-09-05）───────────────────────────
//   POST /api/admin/diary-auto-push  (Authorization: Bearer <CRON_SECRET>)
//   body(form): apply=true   ★ 既定は false（数えるだけ・1文字も書かない）
//
// ★★★ なぜ周にするか（引き金にしない）
//   日記を保存したその場でジョブを積むと、**枠が塞がっているとき静かに落ちる**
//   （中継の枠は 店舗×媒体×枠 に1本だけ）。★ 落ちた1件は誰も拾わない。
//   → 周にすれば、塞がっていても**次の周が拾う**。★ 取りこぼしが自然に消える。
//
// ★★★ 誰に送るかは【この周では決めない】。
//   ★ 相手を決めるには「相手側で魂セラピストを始めているか」が要り、それは
//     魂セラピスト一覧を読まないと分からない。★ 読むのはフローの中。
//   → 周は店舗ぶんの intent='diary_auto' を積むだけ。★ 1人選ぶのはフロー側（planEsutamaDiary）。
//   ★★ それでも **1回のフローで送るのは1件だけ**。★ 「全員に送る」は作らない。
//
// ★ 対象の条件（全部そろった店舗だけ）
//     ・日記の正本が fukues（★ 取り込んだ日記を送り返さない・第133-3便）
//     ・エステ魂の枠が is_enabled かつ link_mode が write / write_auto
//   ★ 了承・名簿の結び・利用状況・未送信 は【フロー側】で1人ずつ見る。
//
// ★ 送るのはこの周ではない。中継ジョブを積むだけで、実際に叩くのは毎分の relay.sh（VPS）。
//   ★ 1件あたり6段 ＝ おおよそ6分。★ 「すぐ」ではなく「数分後」と案内すること。
//
// crontab（VPS・5分ごと）:
//   */5 * * * * . /root/import.env; /usr/bin/curl -sS -X POST https://fukues.com/api/admin/diary-auto-push --oauth2-bearer $CRON_SECRET -d apply=true >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** ★ 1周で積む店舗の上限。★ 一度に走らせすぎない（中継役は毎分1件ずつ進む） */
const MAX_SALONS_PER_RUN = 5;

const PROVIDER = 'esutama';

async function readBody(req: Request): Promise<Record<string, string>> {
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  const o: Record<string, string> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      const v = JSON.parse(text) as unknown;
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) o[k] = String(x);
    } catch { /* 空のまま */ }
    return o;
  }
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  // ★ 既定は数えるだけ。★ 最初は apply なしで対象の数を見ること（第43便の作法）
  const apply = body.apply === 'true' || body.apply === '1';

  const svc = createServiceClient();

  // ① エステ魂へ「書く」向きの枠
  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('salon_id, slot, link_mode')
    .eq('provider', PROVIDER)
    .eq('is_enabled', true)
    .in('link_mode', ['write', 'write_auto']);
  if (srcErr) return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });

  const rows = (sources ?? []) as Array<{ salon_id: number; slot: number; link_mode: string }>;
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, apply, targets: 0, started: [], skipped: [], note: 'エステ魂へ書く向きの枠がありません' });
  }

  // ② ★★★ 日記の正本が fukues の店舗だけ（★ 取り込んだ日記を送り返さない）
  //   ★ フロー側（checkSalonDiarySource）でも見るが、**画面だけで守らない**と同じ作法で
  //     ここでも見る。★ 無駄なジョブを積まないためでもある。
  const salonIds = [...new Set(rows.map((r) => Number(r.salon_id)))];
  const { data: salons, error: sErr } = await svc
    .from('salons')
    .select('id, diary_source')
    .in('id', salonIds);
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  const sourceOf = new Map<number, string>();
  for (const s of (salons ?? []) as Array<{ id: number; diary_source: string | null }>) {
    sourceOf.set(Number(s.id), String(s.diary_source ?? ''));
  }

  const started: string[] = [];
  const skipped: Array<{ target: string; why: string }> = [];

  for (const r of rows) {
    const target = r.salon_id + '/' + PROVIDER + '#' + r.slot;
    if (started.length >= MAX_SALONS_PER_RUN) { skipped.push({ target, why: '今回の上限に達したので次の周へ' }); continue; }

    const src = sourceOf.get(Number(r.salon_id)) ?? '';
    if (src !== 'fukues') { skipped.push({ target, why: '日記の正本が fukues ではない（' + (src || '未設定') + '）' }); continue; }

    // ★★★ 送るものが無ければ、ジョブを積まない（第140便・2026-09-04）。
    //   ★ ここを入れる前は、5分ごとに必ずエステ魂へログインし、
    //     「送れる 0名」を記録に2行積んでいた（1日576行）。
    //     ★★ 店舗様の「連携の記録」が2時間で埋まり、
    //       駅ちかの取り込みや出勤の記録が押し流されて見えなくなっていた。
    //   ★ これは【絞り込み】。★ 送ってよいかの判断はフロー側のまま（2か所に置かない）。
    //   ★★ 読めなかったときは count=-1 で通す（★ 「無い」と決めつけない）。
    let candidate: Awaited<ReturnType<typeof hasDiarySendCandidate>>;
    try {
      candidate = await hasDiarySendCandidate({
        salonId: Number(r.salon_id), provider: PROVIDER, slot: Number(r.slot),
      });
    } catch (e) {
      // ★ 絞り込みで落ちたら、絞り込まない（★ 送れるものを取りこぼさない側へ倒す）
      candidate = { ok: true, count: -1 };
      console.warn('[diary-auto-push] 候補の下調べに失敗', target, e instanceof Error ? e.message : 'unknown');
    }
    if (!candidate.ok) { skipped.push({ target, why: candidate.why }); continue; }

    if (!apply) { started.push(target); continue; }   // ★ 数えるだけ

    try {
      const res = await startRelayFlow({
        salonId: Number(r.salon_id), provider: PROVIDER, slot: Number(r.slot),
        intent: 'diary_auto',
        actor: 'cron:diary-auto-push',
      });
      // ★ 枠が塞がっている（busy）のは【正常】。★ 次の周が拾う
      if (!res.ok) { skipped.push({ target, why: res.note }); continue; }
      started.push(target);
    } catch (e) {
      // ★ 1店舗で落ちても周を止めない。★ 他の店舗は進める
      skipped.push({ target, why: '開始できなかった: ' + (e instanceof Error ? e.message : 'unknown') });
    }
  }

  return NextResponse.json({
    ok: true, apply,
    targets: rows.length,
    started, skipped,
    // ★ 何件を「送るものが無い」で飛ばしたか。★ 黙って飛ばさない
    skippedNoCandidate: skipped.filter((x) => x.why.includes('ありません') || x.why.includes('お送りしています')).length,
    // ★ 「積んだ」までしか言わない。★ 送れたかは連携の記録で見る
    見かた: apply
      ? '中継ジョブを積みました。1件あたり6段（およそ6分）かかります。結果は各店舗の「連携の記録」に出ます'
      : '★ 数えただけです。1件も送っていません。送るには apply=true を付けてください',
  });
}
