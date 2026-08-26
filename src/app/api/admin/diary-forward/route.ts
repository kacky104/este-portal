import { NextResponse } from 'next/server';
import { forwardDiary } from '@/app/lib/diary/forwardDiary';

// ── 写メ日記の転送・運営用の単発実行（第36便・第2弾の試し打ち）──────────
//   POST /api/admin/diary-forward  (Authorization: Bearer <CRON_SECRET>)
//   body: { diaryId:number, apply?:boolean }
//
// ★ apply の既定は false。1通も送らずに「何を、どこへ、どんな形で送るつもりか」を返す。
//   本番の投稿の流れに組み込む前に、ここで体裁と宛先を目で確かめるためのもの。
//   第30便のAI紹介文一括生成・第36便の取り込みと同じ作法。
//
// ★ 宛先は伏字で返す。アドレスを知っている者は誰でもその媒体に投稿できるため、
//   ログやスクショに残っても危なくない形にしてある。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { diaryId?: unknown; apply?: unknown };
  try { body = (await req.json()) as { diaryId?: unknown; apply?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const diaryId = Number(body.diaryId);
  if (!Number.isFinite(diaryId)) return NextResponse.json({ ok: false, error: 'diaryId is required' }, { status: 400 });

  const result = await forwardDiary(diaryId, body.apply === true);
  return NextResponse.json(result, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
