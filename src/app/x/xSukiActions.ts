'use server';

import { createClient } from '@/app/lib/supabase/server';

// fukuX「スキ」：セラピスト本人が、自分をフォローしているフォロワーへ送る片方向リアクション。
// 1回きり・非トグル（x_suki の unique(from,to) が二重送信を弾く）。
// 通知は x_suki への AFTER INSERT トリガーが作成する（フォロー通知と同方式＝コードでは通知を挿入しない）。
// service_role は使わず、Cookie セッション（authenticated）＋RLS で完結させる。

export type SukiResult = { ok: true } | { ok: false; error: string };

export async function sukiProfile(targetProfileId: string): Promise<SukiResult> {
  if (!targetProfileId) return { ok: false, error: '対象が不正です。' };

  const supabase = await createClient();

  // 1. 認証 → 自分の x_profiles（id / kind）。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です。' };

  const { data: me } = await supabase
    .from('x_profiles')
    .select('id, kind')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!me) return { ok: false, error: 'fukuX アカウントが見つかりません。' };

  // セラピストのみ送信可（RLS でも担保するが、ここで明示拒否してUI文言を返す）。
  if ((me.kind as string) !== 'therapist') return { ok: false, error: 'スキはセラピストのみ利用できます。' };
  if ((me.id as string) === targetProfileId) return { ok: false, error: '自分にはスキできません。' };

  // 2. 相手が「自分をフォローしているフォロワー」かを検証（非フォロワーへの誤スキを防ぐ）。
  //    follower=相手 / followee=自分 のエッジが存在するか。
  const { data: edge } = await supabase
    .from('x_follows')
    .select('follower_profile_id')
    .eq('follower_profile_id', targetProfileId)
    .eq('followee_profile_id', me.id as string)
    .maybeSingle();
  if (!edge) return { ok: false, error: 'フォロワーにのみスキできます。' };

  // 3. x_suki に insert（RLS が本人＆セラピストを担保）。
  const { error } = await supabase
    .from('x_suki')
    .insert({ from_profile_id: me.id as string, to_profile_id: targetProfileId });

  if (error) {
    // unique 違反（既にスキ済み）は成功扱いで握りつぶす＝再通知しない（トリガーも発火しない）。
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: 'スキに失敗しました。' };
  }

  // 新規 insert 成功 → 通知は x_suki の AFTER INSERT トリガーが作成。
  return { ok: true };
}
