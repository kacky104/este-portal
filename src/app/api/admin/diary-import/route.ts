import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow, diaryBackfillContext } from '@/app/lib/media/relayFlow';

// ── 写メ日記の取り込みを1回まわす（第95便）─────────────────────────────
//   POST /api/admin/diary-import  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId?: number, slot?: number, since?: 'YYYY-MM-DD', maxPages?: number, apply?: boolean }
//
// ★★★ この口がすること: 中継ジョブ（login）を1件積むだけ。
//   ★ 実際に駅ちかを読むのは毎分の relay.sh（VPS）。★ VPS側に新しい実装は要らない。
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

  const targets = (creds ?? []).filter((c) => {
    // ★ 同意していない枠は動かさない（第89便の作法）
    return typeof (c as { consent_version?: string | null }).consent_version === 'string';
  });

  if (!apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      targets: targets.length,
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
    } catch (e) {
      // ★ 1店で転んでも、ほかの店を止めない
      started.push({ salonId, slot, note: '★ 始められなかった: ' + String((e as Error).message).slice(0, 120) });
    }
  }

  return NextResponse.json({ ok: true, applied: true, targets: targets.length, since, started });
}
