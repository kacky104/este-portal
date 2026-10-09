import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { collectDiaryStall } from '@/app/lib/media/diaryStallCollect';

// ── 写メ日記の巡回が止まっていないか見る（第100便）───────────────────────
//   POST /api/admin/diary-stall  (Authorization: Bearer <CRON_SECRET>)
//   body: なし
//
// ★★★ なぜ要るか —— 2026-09-01 深夜に「最後の取り込みが19:03。いま22:51」を見て、
//   ・新着が無かっただけ  ・巡回そのものが止まっている
//   の【どちらなのか言えなかった】。★ その日のうちに作った口（引き継ぎメモ 第99便 §9①）。
//
// ★★ 見せる相手は【運営だけ】（2026-09-01・カッキーさんの判断）。
//   ★ 原因（crontab・relay.sh・ログイン）はすべてこちら側で、店舗様には直せない。
//   ★ 店舗様の画面には出さない。★ 直せないことを知らせても不安になるだけ。
//
// ★★★ 判定そのものは src/lib/diaryStall.ts の純粋関数。★ 値を集めるのは app/lib/media/diaryStallCollect.ts（第1340便で切り出した）。
//   ★ now も向こうへ渡す。★ 判定の中で時刻を取らない＝点検で「4時間止まった状態」を作れる。
//
// ★★ 「0件」の理由が読める形で返す（作法 3-5）。★ 見張っていない枠を黙って消さない:
//   stalled … 止まっている（★ ここが空でも、見張れているとは限らない）
//   healthy … 見張っていて、正常
//   quiet   … 見張っていない枠と、その理由
//
// crontab（VPS・1日4回で十分。★ 15分ごとに見ても、しきい値は4時間なので意味がない）:
//   50 */6 * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/diary-stall -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const got = await collectDiaryStall(createServiceClient(), new Date());
  if (!got.ok) return NextResponse.json({ ok: false, error: got.error }, { status: 500 });
  // ★ 鍵が1つも無いときの返し方は、前と同じ（note を付けない）
  if (got.checked === 0) return NextResponse.json({ ok: true, checked: 0, stalled: [], healthy: [], quiet: [] });
  const { stalled, healthy, quiet } = got;

  // ★ 止まっているものがあれば、VPS のログ（/root/import.log）でも目に入るように1行足す
  if (stalled.length > 0) {
    console.error('[diary-stall] 止まっている枠が ' + stalled.length + ' 件', stalled.map((s) => s.salonId + '#' + s.slot + ' ' + s.clock).join(' / '));
  }

  return NextResponse.json({
    ok: true,
    checked: got.checked,
    stalled,
    healthy,
    quiet,
    note: stalled.length === 0
      ? '止まっている枠はありません（★ quiet に、見張っていない枠と理由が出ます）'
      : '★ 止まっている枠があります。hint の場所を見てください',
  });
}
