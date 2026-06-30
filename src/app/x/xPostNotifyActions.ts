'use server';

import { createClient } from '@/app/lib/supabase/server';

// fukuX フォロー投稿通知（ベル）のON/OFF：自分のフォロー行の notify_posts を更新する。
// 既定 false（オプトイン）。投稿時の通知発火は x_posts の AFTER INSERT トリガーに委譲（ここでは通知を挿入しない）。
// RLS（x_follows_update_notify）が「フォロワー本人の行のみ更新可」を担保。service_role は使わない。

export type SetPostNotifyResult = { ok: true } | { ok: false; error: string };

export async function setPostNotify(
  followeeProfileId: string,
  on: boolean
): Promise<SetPostNotifyResult> {
  if (!followeeProfileId) return { ok: false, error: '対象が不正です。' };

  const supabase = await createClient();

  // 認証 → 自分の x_profiles.id。
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

  // 自分のフォロー行（follower=自分, followee=相手）の notify_posts を更新。
  // .select() で対象行が当たったかを確認（無い＝フォローしていない → 失敗扱い）。
  const { data: updated, error } = await supabase
    .from('x_follows')
    .update({ notify_posts: on })
    .eq('follower_profile_id', me.id as string)
    .eq('followee_profile_id', followeeProfileId)
    .select('follower_profile_id');

  if (error) return { ok: false, error: '投稿通知の設定に失敗しました。' };
  if (!updated || updated.length === 0) return { ok: false, error: 'フォロー中のみ設定できます。' };

  return { ok: true };
}
