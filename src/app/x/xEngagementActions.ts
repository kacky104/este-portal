'use server';

import { createClient } from '@/app/lib/supabase/server';

// ★★ 第985便（2026-09-29・カッキーさん）: fukuX の「いいね」「フォロー」「投稿の保存」を【サーバー側】で行う。
// ★ 第980〜984便と同じ、アプリ内ブラウザで送る前に止まる事故の対策。リポスト（xRepostActions.ts）と同じ作法。
// ★ 本人のログインのまま（service_role ではない）＝x_likes / x_follows / x_post_saves の RLS はそのまま効く。
// ★ 自分のプロフィール id はクライアントから受け取らず、サーバーで引く。

export type ToggleResult = { ok: true } | { ok: false; error: string };

async function myProfileId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, id: null as string | null, error: 'ログインが切れています。ページを開き直してください。' };
  const { data } = await supabase.from('x_profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!data) return { supabase, id: null, error: 'fukuX アカウントが見つかりません。' };
  return { supabase, id: data.id as string, error: '' };
}

export async function toggleXLike(postId: string, on: boolean): Promise<ToggleResult> {
  const { supabase, id, error: e } = await myProfileId();
  if (!id) return { ok: false, error: e };
  const { error } = on
    ? await supabase.from('x_likes').insert({ profile_id: id, post_id: postId })
    : await supabase.from('x_likes').delete().eq('profile_id', id).eq('post_id', postId);
  if (error && !(on && error.code === '23505')) { // ★ すでにいいね済みは成功扱い
    console.error('[x] いいねできなかった', id, error.message);
    return { ok: false, error: on ? 'いいねできませんでした' : 'いいねを取り消せませんでした' };
  }
  return { ok: true };
}

export async function toggleXFollow(targetProfileId: string, on: boolean): Promise<ToggleResult> {
  const { supabase, id, error: e } = await myProfileId();
  if (!id) return { ok: false, error: e };
  if (id === targetProfileId) return { ok: false, error: '自分はフォローできません' };
  const { error } = on
    ? await supabase.from('x_follows').insert({ follower_profile_id: id, followee_profile_id: targetProfileId })
    : await supabase.from('x_follows').delete().eq('follower_profile_id', id).eq('followee_profile_id', targetProfileId);
  if (error && !(on && error.code === '23505')) {
    console.error('[x] フォロー操作ができなかった', id, error.message);
    return { ok: false, error: on ? 'フォローできませんでした' : 'フォローを外せませんでした' };
  }
  return { ok: true };
}

export async function toggleXSave(postId: string, on: boolean): Promise<ToggleResult> {
  const { supabase, id, error: e } = await myProfileId();
  if (!id) return { ok: false, error: e };
  const { error } = on
    ? await supabase.from('x_post_saves').insert({ profile_id: id, post_id: postId })
    : await supabase.from('x_post_saves').delete().eq('profile_id', id).eq('post_id', postId);
  if (error && !(on && error.code === '23505')) {
    console.error('[x] 保存操作ができなかった', id, error.message);
    return { ok: false, error: on ? '保存できませんでした' : '保存を解除できませんでした' };
  }
  return { ok: true };
}
