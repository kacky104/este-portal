import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow, hasSokuseraSendCandidate } from '@/app/lib/media/relayFlow';
import { staggerNotBefore } from '@/lib/relayStagger';

// ── 即セラの周（第143便・2026-09-04）───────────────────────────────────
//   POST /api/admin/sokusera-push  (Authorization: Bearer <CRON_SECRET>)
//   body(form): apply=true                 … ★ 自動（周から）
//   body(form): salonId=6 therapistId=14   … ★ 運営が1人だけ試す
//
// ★★★ フクエスの「今すぐ」がONの人の、エステ魂の即セラをONにする。
//   ★★ OFFは打たない（★ 60分で相手が勝手に切る）。
//     ★ 業界の風習として、誰も手動でOFFを打たない（★ 流しっぱなしが好まれる）。
//
// ★★★ **1回のフローでONにするのは1人だけ。** ★ 「全員にまとめて」は作らない。
//   ★ 相手のアカウントを触る操作なので、1人ずつ・確かめながら進む。
//
// ★ 「今すぐ」は45分で切れる（★ 第326便で30分から延ばした）。★ 周は10分ごと（第1244便まで5分）。★ 取りこぼしは次の周が拾う。
// ★★ 第1244便: 周は回るが、ONにする相手がいない店へはログインしない（hasSokuseraSendCandidate・DB だけで下調べ）。
//
// crontab（VPS・10分ごと。★ 第1244便で 5分→10分（2026-10-06・カッキーさん・相手サイトへの負荷を抑える）。★ 日記の周・即ヒメの周と1分ずらす）:
//   1-59/10 * * * * . /root/import.env; /usr/bin/curl -sS -X POST https://fukues.com/api/admin/sokusera-push --oauth2-bearer $CRON_SECRET -d apply=true >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROVIDER = 'esutama';
/** ★ 1周で積む店舗の上限。★ 一度に走らせすぎない */
const MAX_SALONS_PER_RUN = 5;

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
  const apply = body.apply === 'true' || body.apply === '1';
  const oneSalon = Number(body.salonId);
  const oneTherapist = Number(body.therapistId);

  // ★★ 運営が1人だけ試す道（★ 相手を名指しする）
  if (Number.isFinite(oneSalon) && oneSalon > 0 && Number.isFinite(oneTherapist) && oneTherapist > 0) {
    const r = await startRelayFlow({
      salonId: oneSalon, provider: PROVIDER, slot: 1,
      intent: 'sokusera_push',
      sokusera: { therapistId: oneTherapist },
      actor: 'admin:sokusera-push',
    });
    return NextResponse.json({ ...r, salonId: oneSalon, therapistId: oneTherapist, intent: 'sokusera_push' });
  }

  const svc = createServiceClient();
  // ★ エステ魂へ「書く」向きの枠だけ
  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('salon_id, slot, salons!inner(conecf_enabled_at)')
    .eq('provider', PROVIDER).eq('is_enabled', true)
    .in('link_mode', ['write', 'write_auto'])
    // ★★ 第781便（カッキーさん）: コネックエフに切り替えている店だけ（★ 運営が SQL で conecf_enabled_at を null に戻した店へは送らない）
    .not('salons.conecf_enabled_at', 'is', null);
  if (srcErr) return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });

  const rows = (sources ?? []) as Array<{ salon_id: number; slot: number }>;
  const started: string[] = [];
  const skipped: Array<{ target: string; why: string }> = [];

  for (const r of rows) {
    const target = r.salon_id + '/' + PROVIDER + '#' + r.slot;
    if (started.length >= MAX_SALONS_PER_RUN) { skipped.push({ target, why: '今回の上限に達したので次の周へ' }); continue; }

    // ★★★ ONにする相手がいなければ、ジョブを積まない（第1244便・2026-10-06・カッキーさん）。
    //   ★ ここを入れる前は、誰も「今すぐ」でなくても5分ごとに必ずエステ魂へログインし、名簿を読んでいた
    //     （10/6 の実測: 17時間50分でログイン216回・実際に ON にしたのは6回）。
    //   ★ 相手サイトへの負荷と目立ち方を抑える。写メ日記の周（第140便）と同じ作法。
    //   ★ これは【絞り込み】。★ 誰をONにするかの判断はフロー側のまま（2か所に置かない）。
    //   ★★ 読めなかったときは count=-1 で通す（★ 「いない」と決めつけない）。
    let candidate: Awaited<ReturnType<typeof hasSokuseraSendCandidate>>;
    try {
      candidate = await hasSokuseraSendCandidate({ salonId: Number(r.salon_id), provider: PROVIDER, slot: Number(r.slot) });
    } catch (e) {
      // ★ 絞り込みで落ちたら、絞り込まない（★ ONにできる方を取りこぼさない側へ倒す）
      candidate = { ok: true, count: -1 };
      console.warn('[sokusera-push] 候補の下調べに失敗', target, e instanceof Error ? e.message : 'unknown');
    }
    if (!candidate.ok) { skipped.push({ target, why: candidate.why }); continue; }

    if (!apply) { started.push(target); continue; }
    try {
      const res = await startRelayFlow({
        salonId: Number(r.salon_id), provider: PROVIDER, slot: Number(r.slot),
        intent: 'sokusera_auto', actor: 'cron:sokusera-push',
        // ★ 第1247便: 店舗ごとに 0〜3分ずらす
        notBefore: staggerNotBefore(started.length, new Date()),
      });
      // ★ 枠が塞がっている（busy）のは【正常】。★ 次の周が拾う
      if (!res.ok) { skipped.push({ target, why: res.note }); continue; }
      started.push(target);
    } catch (e) {
      skipped.push({ target, why: '開始できなかった: ' + (e instanceof Error ? e.message : 'unknown') });
    }
  }

  return NextResponse.json({
    ok: true, apply, targets: rows.length, started, skipped,
    見かた: apply
      ? '中継ジョブを積みました。結果は各店舗の「連携の記録」に出ます（★ 即セラは読み返して確かめます）'
      : '★ 数えただけです。1件もONにしていません',
  });
}
