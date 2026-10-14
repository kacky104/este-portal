import { NextResponse } from 'next/server';
import { refreshDiaryAddressesDaily } from '@/app/lib/diary/addressRefresh';
import { sendWaitingForwards } from '@/app/lib/diary/forwardDiary';

// ── 駅ちかの投稿用アドレスの読み直し＋アドレス待ちの写メ日記を送る（第1478便・2026-10-14・カッキーさん）──────────
//   GET /api/cron/diary-address  (Authorization: Bearer <CRON_SECRET>)  ?dry=1 で1通も送らず・読みにもいかない
// ★ Vercel の定期実行（vercel.json・10分ごと）。
//   ① アドレス待ち（diary_forward_log.status='waiting_address'）の日記を、アドレスが入っていれば送る。
//   ② 「フクエスで書く」店の駅ちかの投稿用アドレスを、前に読めてから20時間たっていれば読み直す（＝毎日1回）。
//      ★ 駅ちかへは読むだけ。読めなかったら60分あけてもう一度。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const waiting = await sendWaitingForwards({ apply: !dry });
  const refreshed = dry ? [] : await refreshDiaryAddressesDaily();
  return NextResponse.json({ ok: waiting.ok, dry, waiting, refreshed }, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
