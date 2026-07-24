'use server';

import { createClient } from '@/app/lib/supabase/server';
import { fetchFukuesOgp } from './xOgp';

// 投稿のリンクプレビュー（OGPカード）をサーバー側で取得し、本人の投稿の link_* 列へ保存する。
// fukues.com のみ取得（xOgp 側でホスト固定）。対象外/失敗/リンク削除時は null 群でクリアする。
// service_role は使わず本人セッションで update＝RLS（own 投稿のみ）＋ author 一致で二重防御。
// 失敗しても投稿自体は成立済み＝ここは常に握りつぶす（例外を投げない）。
export async function refreshXPostLinkPreview(postId: number | string, rawUrl: string | null): Promise<void> {
  if (!postId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: me } = await supabase
    .from('x_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!me) return;

  // リンクがあれば OGP 取得（fukues.com 以外/失敗は null）。無ければ null 群でクリア（編集でリンクを消した場合など）。
  const ogp = rawUrl ? await fetchFukuesOgp(rawUrl) : null;

  await supabase
    .from('x_posts')
    .update({
      link_image: ogp?.image ?? null,
      link_title: ogp?.title ?? null,
      link_description: ogp?.description ?? null,
    })
    .eq('id', postId)
    .eq('author_profile_id', me.id as string);
}
