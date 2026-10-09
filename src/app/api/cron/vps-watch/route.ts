import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { planVpsWatch, VPS_HEARTBEAT_NAME, type VpsHeartbeatRow } from '@/lib/vpsWatch';

// ── VPS の見張り（第1339便・2026-10-09）──────────────────────────
//   GET /api/cron/vps-watch  (Authorization: Bearer <CRON_SECRET>)
//
// ★★★ この口だけは、VPS の crontab からではなく【Vercel の定期実行（vercel.json の crons・10分ごと）】から動く。
//   VPS を見張るものを VPS に置くと、一緒に止まるため。Vercel は環境変数 CRON_SECRET を Authorization に付けて GET で呼ぶ。
// ★ なぜ要るか・決まり（20分・24時間・80%）は lib/vpsWatch.ts。
// ★ ?dry=1 を付けると、決めた中身を返すだけ（メールを出さない・DB に書かない）。
// ★ 表が無い（追加SQL_第1339便がまだ）・まだ1回も連絡が無いときは、何も知らせない。
//
// ★ 順番: メールを出してから、印（down_alerted_at・disk_alerted_at）を書く。
//   印が書けなかったときは、次の10分でもう一度メールが出る（知らせが漏れるより、重なるほうを選ぶ）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('vps_heartbeat')
    .select('last_seen_at, disk_pct, mem_avail_mb, down_alerted_at, disk_alerted_at')
    .eq('name', VPS_HEARTBEAT_NAME)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json({ ok: true, state: 'never', note: '表 vps_heartbeat が無い（追加SQL_第1339便がまだ）。何も知らせていない' });
    }
    // ★ 読めないときは「止まっている」と決めつけない（DB の不調で、VPS が止まったというメールを出さない）
    console.error('[vps-watch] 読めなかった', error.message);
    return NextResponse.json({ ok: false, error: '読めなかった: ' + error.message }, { status: 500 });
  }

  const r = data as { last_seen_at: string | null; disk_pct: number | null; mem_avail_mb: number | null; down_alerted_at: string | null; disk_alerted_at: string | null } | null;
  const row: VpsHeartbeatRow | null = r
    ? { lastSeenAt: r.last_seen_at, diskPct: r.disk_pct, memAvailMb: r.mem_avail_mb, downAlertedAt: r.down_alerted_at, diskAlertedAt: r.disk_alerted_at }
    : null;
  const nowIso = new Date().toISOString();
  const plan = planVpsWatch(row, nowIso);
  const summary = { state: plan.state, silentMinutes: plan.silentMinutes, note: plan.note, mails: plan.mails.map((m) => m.kind) };
  if (dry) return NextResponse.json({ ok: true, dry: true, ...summary, patch: plan.patch });

  for (const m of plan.mails) await notifyAdmin(m.subject, m.lines);

  let patchError: string | null = null;
  if (Object.keys(plan.patch).length > 0) {
    const { error: upErr } = await supabase.from('vps_heartbeat').update(plan.patch).eq('name', VPS_HEARTBEAT_NAME);
    if (upErr) {
      patchError = upErr.message;
      console.error('[vps-watch] 知らせた印を書けなかった（次の周でもう一度メールが出る）', upErr.message);
    }
  }
  return NextResponse.json({ ok: patchError === null, ...summary, ...(patchError ? { error: '知らせた印を書けなかった: ' + patchError } : {}) });
}
