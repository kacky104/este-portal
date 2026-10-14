import { NextResponse } from 'next/server';
import { refreshDiaryAddressesDaily, rekickWaitingAddresses } from '@/app/lib/diary/addressRefresh';
import { sendWaitingForwards, sweepUnforwardedDiaries } from '@/app/lib/diary/forwardDiary';

// ── 駅ちかの投稿用アドレスの読み直し＋アドレス待ちの写メ日記を送る（第1478便・2026-10-14・カッキーさん）──────────
//   GET /api/cron/diary-address  (Authorization: Bearer <CRON_SECRET>)  ?dry=1 で1通も送らず・読みにもいかない
// ★ Vercel の定期実行（vercel.json・10分ごと）。
//   ⓪ 第1495便: 転送の記録が無い日記（投稿のあとブラウザが転送の口を呼べなかった）を拾って送る（sweepUnforwardedDiaries）。
//   ① アドレス待ち（diary_forward_log.status='waiting_address'）の日記を、アドレスが入っていれば送る。
//   ①' 第1495便: アドレス待ちが残っている店・枠は、読み直しをもう一度試す（前の読みにいきが busy で断られたとき用）。
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
  // ★ 順番に意味がある: 拾った日記は forwardDiary で 'waiting_address' になりうる → そのあと①で送れるものは送る → ①' で読み直し
  // ★ 1回の周で拾うのは5件まで（画像の変換に数秒ずつかかる。maxDuration 60秒に収める。残りは次の周）
  const swept = await sweepUnforwardedDiaries({ apply: !dry, limit: 5 });
  const waiting = await sendWaitingForwards({ apply: !dry });
  const rekicked = dry ? [] : await rekickWaitingAddresses();
  const refreshed = dry ? [] : await refreshDiaryAddressesDaily();
  return NextResponse.json(
    { ok: swept.ok && waiting.ok, dry, swept, waiting, rekicked, refreshed },
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
