'use server';

import { createClient } from '@/app/lib/supabase/server';

// fukuX リポスト（シンプル・コメント無し・トグル）。全種別が可能・自分の投稿は不可。通知なし。
// x_reposts への insert / delete。RLS（insert/delete は x_my_profile_id() で本人のみ）が担保し、
// ここでは self ガード（自分の投稿はリポスト不可）を二重防御で行う。service_role は使わない。

export type ToggleRepostResult = { ok: true } | { ok: false; error: string };

// on=true でリポスト作成、on=false で解除。postId は x_posts.id（bigint）。
export async function toggleRepost(postId: number, on: boolean): Promise<ToggleRepostResult> {
  if (!postId) return { ok: false, error: '対象が不正です。' };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です。' };

  const { data: me } = await supabase
    .from('x_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!me) return { ok: false, error: 'fukuX アカウントが見つかりません。' };

  if (on) {
    // self ガード：対象投稿の投稿者が自分なら拒否（UIでも非表示だが二重防御）。
    const { data: post } = await supabase
      .from('x_posts')
      .select('author_profile_id')
      .eq('id', postId)
      .maybeSingle();
    if (!post) return { ok: false, error: '投稿が見つかりません。' };
    if ((post.author_profile_id as string) === (me.id as string)) {
      return { ok: false, error: '自分の投稿はリポストできません。' };
    }

    const { error } = await supabase
      .from('x_reposts')
      .insert({ reposter_profile_id: me.id as string, post_id: postId });
    if (error) {
      // unique 違反（既にリポスト済み）は成功扱いで握りつぶす。
      if (error.code === '23505') return { ok: true };
      return { ok: false, error: 'リポストに失敗しました。' };
    }
  } else {
    const { error } = await supabase
      .from('x_reposts')
      .delete()
      .eq('reposter_profile_id', me.id as string)
      .eq('post_id', postId);
    if (error) return { ok: false, error: 'リポストの解除に失敗しました。' };
  }

  return { ok: true };
}
