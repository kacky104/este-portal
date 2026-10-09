import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { parseHeartbeatBody, VPS_HEARTBEAT_NAME } from '@/lib/vpsWatch';

// ── VPS の「動いています」を受け取る口（第1339便・2026-10-09）──────────────
//   POST /api/relay/heartbeat  (Authorization: Bearer <CRON_SECRET>)
//   body: { diskPct?: number, memAvailMb?: number }
//
// ★ なぜ要るか・全体の流れは lib/vpsWatch.ts の頭。
// ★ やることは1つ: vps_heartbeat の1行に「いま来た」を書く。相手サイトへは行かない。メールも出さない
//   （知らせるのは /api/cron/vps-watch。★ VPS の外＝Vercel の定期実行から動く）。
// ★ 数字が読めなくても、連絡としては受け取る（届いたこと自体が「動いている」の印）。
// ★ 知らせた印（down_alerted_at・disk_alerted_at）には触らない（見張りの側だけが書く）。
//
// crontab（VPS・5分ごと。★ 行の中に % を書かない＝crontab では改行の意味になる）:
//   */5 * * * * set -a; . /root/import.env; /usr/bin/curl -s -m 20 -w '\n' -X POST https://fukues.com/api/relay/heartbeat -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d "{\"diskPct\":$(df --output=pcent / | tail -1 | tr -dc 0-9),\"memAvailMb\":$(free -m | awk '/^Mem:/{print $7}')}" >> /root/vps-heartbeat.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: unknown = {};
  try { body = await req.json(); }
  catch { /* body なし・壊れた JSON でも、連絡としては受け取る */ }
  const { diskPct, memAvailMb } = parseHeartbeatBody(body);

  const nowIso = new Date().toISOString();
  const { error } = await createServiceClient()
    .from('vps_heartbeat')
    .upsert(
      { name: VPS_HEARTBEAT_NAME, last_seen_at: nowIso, disk_pct: diskPct, mem_avail_mb: memAvailMb, updated_at: nowIso },
      { onConflict: 'name' },
    );
  if (error) {
    // ★ 表が無い（追加SQL_第1339便がまだ）ときも、ここに来る。VPS のログ（/root/vps-heartbeat.log）で分かるように返す
    return NextResponse.json({ ok: false, error: '書けなかった: ' + (error.message || error.code || '理由不明') }, { status: 500 });
  }
  return NextResponse.json({ ok: true, at: nowIso, diskPct, memAvailMb });
}
