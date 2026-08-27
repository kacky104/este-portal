import { NextResponse } from 'next/server';
import { retryFailedForwards } from '@/app/lib/diary/forwardDiary';

// ── 写メ日記の転送・失敗分の再送（第37便）──────────────────────────
//   POST /api/admin/diary-forward-retry  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?:boolean, limit?:number }
//
// ★ VPS の cron から叩く想定（駅ちか取り込みの毎時の周に相乗りできる）。
//   投稿時の送信は同期で行っている（即時反映が売りなので）。ここはその取りこぼしの受け皿。
//
// ★★ apply の既定は false（試し打ち）。1通も送らずに
//   「何を、どの宛先へ、何件送るつもりか」を返す。第36便の取り込み・
//   /api/admin/diary-forward と同じ作法。
//
// ★★★ 駅ちかの5分ルール（同じ女性・同じ件名で5分以内の投稿は反映されない）があるため、
//   失敗から10分以上あいたものだけを拾う。詳しくは forwardDiary.ts のコメントを参照。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown; limit?: unknown } = {};
  try { body = (await req.json()) as { apply?: unknown; limit?: unknown }; }
  catch { /* body なしでも動く（既定＝試し打ち） */ }

  const limit = Number(body.limit);
  const result = await retryFailedForwards({
    apply: body.apply === true,
    ...(Number.isFinite(limit) ? { limit } : {}),
  });

  return NextResponse.json(result, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
