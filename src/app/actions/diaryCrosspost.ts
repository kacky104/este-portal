'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// ★ 第1760便（カッキーさん 11/7「B」）: 写メ日記を消したら、同時投稿した fukuX の投稿もいっしょに消す。
//   理由：消すのは見られたくない事情があるから。日記だけ消えて fukuX に残ると、
//   画像も消えて「まゆゆ-1」の文字だけの投稿が残る（オイルクエスト様 まゆゆさん 11/6）。
//
// 同時投稿の見つけ方（diary_posts と x_posts をつなぐ列は無い）：
//   ① 画像あり：日記の画像URL（diary-images の公開URL・時刻入りで一意）を images に含む投稿
//   ② 画像なし：本文が「タイトル＋空行＋本文」と同じで、日記の投稿から10分以内の投稿
//   どちらも、そのセラピスト本人の fukuX アカウントのトップレベル投稿（リプライは除く）に限る。
//
// ★ 日記を消す「前」に呼ぶ（日記の行が要るため）。失敗しても日記の削除は続けてよい（呼ぶ側で握る）。
// ★ 権限：セラピスト本人・その店のオーナー・運営だけ。service_role はこのファイルの中だけで使う。
// ★ fukuX 側の削除は deleteMyXPost と同じく行を消すだけ（いいね・リプライ等は DB 側で一緒に消える）。

type Result = { ok: true; deleted: number } | { ok: false; error: string };

const WINDOW_MS = 10 * 60 * 1000;

export async function deleteDiaryCrossposts(diaryId: string): Promise<Result> {
  const id = String(diaryId ?? '').trim();
  if (!id) return { ok: false, error: '対象の日記が不正です' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: diary } = await svc
    .from('diary_posts')
    .select('id, therapist_id, salon_id, images, title, content, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!diary) return { ok: true, deleted: 0 };

  const { data: therapist } = await svc
    .from('therapists').select('id, salon_id, user_id').eq('id', diary.therapist_id).maybeSingle();
  const therapistUserId = (therapist?.user_id as string | null) ?? null;

  // 権限の確認
  let allowed = user.id === ADMIN_UUID || (!!therapistUserId && therapistUserId === user.id);
  if (!allowed) {
    const salonId = Number(diary.salon_id ?? therapist?.salon_id);
    if (Number.isFinite(salonId)) {
      const { data: salon } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
      allowed = (salon?.owner_id as string | null) === user.id;
    }
  }
  if (!allowed) return { ok: false, error: 'この日記の操作権限がありません' };
  if (!therapistUserId) return { ok: true, deleted: 0 }; // fukuX とつながっていない

  const { data: profiles } = await svc
    .from('x_profiles').select('id').eq('auth_user_id', therapistUserId).eq('kind', 'therapist');
  const profileIds = (profiles ?? []).map((p) => p.id as string);
  if (profileIds.length === 0) return { ok: true, deleted: 0 };

  const images = (Array.isArray(diary.images) ? diary.images : []).filter(
    (u: unknown): u is string => typeof u === 'string' && u.includes('/diary-images/'),
  );
  const targetIds = new Set<string>();

  if (images.length > 0) {
    const { data: hits } = await svc
      .from('x_posts').select('id')
      .in('author_profile_id', profileIds)
      .is('parent_post_id', null)
      .overlaps('images', images);
    for (const h of hits ?? []) targetIds.add(String(h.id));
  } else {
    const title = ((diary.title as string | null) ?? '').trim();
    const content = ((diary.content as string | null) ?? '').trim();
    const body = title && content ? `${title}\n\n${content}` : (title || content);
    const t = Date.parse(String(diary.created_at));
    if (body && Number.isFinite(t)) {
      const { data: hits } = await svc
        .from('x_posts').select('id, body')
        .in('author_profile_id', profileIds)
        .is('parent_post_id', null)
        .gte('created_at', new Date(t - 60 * 1000).toISOString())
        .lte('created_at', new Date(t + WINDOW_MS).toISOString());
      for (const h of hits ?? []) if (((h.body as string | null) ?? '').trim() === body) targetIds.add(String(h.id));
    }
  }

  if (targetIds.size === 0) return { ok: true, deleted: 0 };
  const { error } = await svc.from('x_posts').delete().in('id', [...targetIds]);
  if (error) {
    console.error('[diary] 同時投稿した fukuX の投稿を消せなかった', id, error.message);
    return { ok: false, error: 'fukuX の投稿を消せませんでした' };
  }
  return { ok: true, deleted: targetIds.size };
}
