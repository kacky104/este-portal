import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow, diaryBackfillContext } from '@/app/lib/media/relayFlow';
import { importsDiaryFromEkichika, readDiarySource } from '@/lib/diarySource';
import { stampDiaryQueued } from '@/app/lib/media/diaryWatch';

// ── 写メ日記の取り込みを1回まわす（第95便）─────────────────────────────
//   POST /api/admin/diary-import  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId?: number, slot?: number, since?: 'YYYY-MM-DD', maxPages?: number, apply?: boolean }
//
// ★★★ この口がすること: 中継ジョブ（login）を1件積むだけ。
//   ★ 実際に駅ちかを読むのは毎分の relay.sh（VPS）。★ VPS側に新しい実装は要らない。
//
// ★★★★ 動くのは【入口が 'ekichika' の店】だけ（第99便）。
//   ★ salons.diary_source が 'ekichika' の店だけ回す。★ 'benry'（メールで受け取る）の店を
//     ここで回すと、同じ日記がメールと取り込みで2件並ぶ。
//   ★ 判定は src/lib/diarySource.ts の一本線。★ ここに条件を書き足さないこと。
//   ★ 鍵があっても入口が違えば回さない。★ 切り替えるまでは 0件（＝安全側に止まる）。
//
// ★★★ 動くのは【鍵を預けていただいた店】だけ（設計メモ §6-1）。
//   ★ 出勤は公開ページなので鍵が要らないが、写メ日記は管理画面なので鍵が要る。
//   ★ 2026-09-01 時点で鍵があるのは THE LABYRINTH 様の1店だけ。
//
// ★★ apply 既定 false（試し打ち）。★ 何店ぶん積むつもりかだけ返す。
//   ★ media-auto-push・relay-purge と同じ作法。★ 最初は apply なしで数を見ること。
//
// ★ since を渡すと【初回の遡り】になる（それより古い投稿は開かない・ページを遡る）。
//   ★ 渡さなければ通常運転＝一覧の1ページ目だけを見て、新着だけ開く（§371）。
//
// crontab（VPS・15分ごと。★ ③④が済んでから足すこと）:
//   2,17,32,47 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/diary-import -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Body = {
  salonId?: unknown;
  slot?: unknown;
  since?: unknown;
  maxPages?: unknown;
  apply?: unknown;
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const onlySalon = Number(body.salonId);
  const onlySlot = Number(body.slot);
  const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since)
    ? body.since + 'T00:00:00+09:00'
    : null;

  const svc = createServiceClient();

  // ★★ 鍵が登録されていて、止められていない枠だけ。★ 同意も要る（写メ日記は管理画面を読むため）
  let q = svc
    .from('salon_media_credentials')
    .select('salon_id, provider, slot, is_enabled, consent_version')
    .eq('provider', 'ekichika')
    .eq('is_enabled', true);
  if (Number.isFinite(onlySalon) && onlySalon > 0) q = q.eq('salon_id', onlySalon);
  if (Number.isFinite(onlySlot) && onlySlot > 0) q = q.eq('slot', onlySlot);

  const { data: creds, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // ★ 同意していない枠は動かさない（第89便の作法）
  const consented = (creds ?? []).filter(
    (c) => typeof (c as { consent_version?: string | null }).consent_version === 'string'
  );
  const noConsent = (creds ?? []).length - consented.length;

  // ★★★ 入口が 'ekichika' の店だけに絞る（第99便）
  //   ★ 鍵の有無ではなく【店舗が選んだ入口】で決める。
  //   ★ 引けなかったときは回さない。★「分からない」を「回してよい」と読まない（作法 3-5）。
  const salonIds = Array.from(new Set(consented.map((c) => Number((c as { salon_id: number }).salon_id))));
  const sourceOf = new Map<number, string>();
  if (salonIds.length > 0) {
    const { data: salonRows, error: salonErr } = await svc
      .from('salons').select('id, diary_source').in('id', salonIds);
    if (salonErr) return NextResponse.json({ ok: false, error: salonErr.message }, { status: 500 });
    for (const r of salonRows ?? []) {
      sourceOf.set(Number((r as { id: number }).id), readDiarySource((r as { diary_source: unknown }).diary_source));
    }
  }

  const targets = consented.filter((c) =>
    importsDiaryFromEkichika(sourceOf.get(Number((c as { salon_id: number }).salon_id)))
  );

  // ★★ 「0件」の理由が読み取れる形で返す（第35便の反省6）。
  //   ★ 鍵はあるのに回らない店を、黙って数から消さない。
  const skipped = consented
    .filter((c) => !importsDiaryFromEkichika(sourceOf.get(Number((c as { salon_id: number }).salon_id))))
    .map((c) => ({
      salonId: Number((c as { salon_id: number }).salon_id),
      slot: Number((c as { slot: number }).slot),
      diarySource: sourceOf.get(Number((c as { salon_id: number }).salon_id)) ?? '★ 店舗が引けなかった',
      note: '★ 入口が ekichika ではないため回さない',
    }));

  if (!apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      targets: targets.length,
      skipped,
      noConsent,
      note: '試し打ち。★ apply:true で実際に積みます',
      since,
    });
  }

  const started: Array<{ salonId: number; slot: number; jobId?: string; note: string }> = [];
  for (const c of targets) {
    const salonId = Number((c as { salon_id: number }).salon_id);
    const slot = Number((c as { slot: number }).slot);
    try {
      const r = await startRelayFlow({
        salonId,
        provider: 'ekichika',
        slot,
        intent: 'diary_read',
        actor: 'cron:diary-import',
        // ★ since を渡したときだけ遡る。★ 通常運転は1ページ目だけ
        ...(since ? diaryBackfillContext({ since, maxPages: Number(body.maxPages) }) : {}),
      });
      started.push({ salonId, slot, jobId: r.ok ? r.jobId : undefined, note: r.note });
      // ★★ 積めた【後】に心拍を刻む（第100便）。★ 前に刻むと、積めていないのに新しくなる
      if (r.ok) await stampDiaryQueued({ salonId, provider: 'ekichika', slot });
    } catch (e) {
      // ★ 1店で転んでも、ほかの店を止めない
      started.push({ salonId, slot, note: '★ 始められなかった: ' + String((e as Error).message).slice(0, 120) });
    }
  }

  return NextResponse.json({ ok: true, applied: true, targets: targets.length, skipped, noConsent, since, started });
}
