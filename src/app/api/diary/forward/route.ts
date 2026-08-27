import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { forwardDiary } from '@/app/lib/diary/forwardDiary';

// ── 写メ日記の他媒体転送・投稿画面から呼ぶ入口（第36便・第2弾）──────────
//   POST /api/diary/forward   body: { diaryId:string(uuid) }
//
// ★ 誰が呼べるか: その日記のセラピスト本人 / 所属サロンのオーナー / 運営。
//   転送先アドレスは秘密値なので、service_role でしか触らない（diaryMail.ts と同じ流儀）。
//
// ★★ 送るかどうかの判断は forwardDiary の中（salons.diary_source）。
//   ここは「呼んでよい人か」だけを見る。二重投稿の防止は diary_source の一本線に集約する。
//
// ★★ 呼び出し側は best-effort で扱うこと。
//   ここが失敗しても日記の投稿そのものは成立している（fukuX同時投稿と同じ考え方）。
//   結果は diary_forward_log に残るので、あとから再送できる。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { diaryId?: unknown };
  try { body = (await req.json()) as { diaryId?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  // ★ diary_posts.id は uuid。Number() で数値化すると必ず NaN になり、
  //   「投稿しても転送が静かに何も起きない」状態になる（第37便で判明）。
  const diaryId = typeof body.diaryId === 'string' ? body.diaryId.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(diaryId))
    return NextResponse.json({ ok: false, error: 'diaryId は日記のUUIDを指定してください' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'ログインが必要です' }, { status: 401 });

  const svc = createServiceClient();
  const { data: diary } = await svc
    .from('diary_posts').select('id, therapist_id, salon_id').eq('id', diaryId).maybeSingle();
  if (!diary) return NextResponse.json({ ok: false, error: '日記が見つかりません' }, { status: 404 });

  const { data: therapist } = await svc
    .from('therapists').select('user_id').eq('id', Number(diary.therapist_id)).maybeSingle();
  const { data: salon } = await svc
    .from('salons').select('owner_id').eq('id', Number(diary.salon_id)).maybeSingle();

  const isSelf = (therapist?.user_id as string | null) === user.id;
  const isOwner = (salon?.owner_id as string | null) === user.id;
  if (!isSelf && !isOwner && user.id !== ADMIN_UUID)
    return NextResponse.json({ ok: false, error: 'この日記の操作権限がありません' }, { status: 403 });

  const result = await forwardDiary(diaryId, true);
  return NextResponse.json(result, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
