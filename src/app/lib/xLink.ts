// フクエス本体 ⇔ fukuX のセラピスト双方向リンク用ヘルパー（公開読み取り）
//
// 連携キー：同一 Supabase プロジェクト＝同一 auth.users を共有しているため
//   public.therapists.user_id (uuid) === public.x_profiles.auth_user_id (uuid)
// が同一人物を表す。この突き合わせをライブで行うだけ（新規列・トリガー・FKは追加しない）。
//
// 公開読み取りなので必ず createPublicClient（Cookieなし）を使う＝ISR/匿名SELECTを壊さない。
// import 元は既存の公開読み取りモジュール（xFollows.ts / xPosts.ts 等）と同じ。
import { createPublicClient } from '@/app/lib/supabase/public';

// ポータルに露出してよい x_profiles.status（allowlist方式：approved のみ公開。
// pending/rejected/frozen 等は一切ポータルに露出しない）。
const PUBLIC_X_STATUSES = ['approved'];

export type LinkedXProfile = {
  profileId: string; // x_profiles.id（uuid）。日記→fukuX フォーク時の author_profile_id に使う
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
};

// 本体セラピスト(therapists.user_id) → 連携している fukuX プロフィール。
// 該当なし・非公開ステータス・handle欠落なら null。
export async function getLinkedXProfileForTherapist(
  userId: string | null | undefined
): Promise<LinkedXProfile | null> {
  if (!userId) return null;

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, is_verified, status, kind')
    .eq('auth_user_id', userId)
    .eq('kind', 'therapist')
    .limit(1); // 同一authに複数therapistプロフィールは想定しないが maybeSingle の例外を避けるため limit(1)

  if (error || !data || data.length === 0) return null;

  const p = data[0];
  if (!p.handle) return null;
  if (!p.status || !PUBLIC_X_STATUSES.includes(p.status as string)) return null;

  return {
    profileId: p.id as string,
    handle: p.handle as string,
    displayName: (p.display_name as string | null) ?? null,
    avatarUrl: (p.avatar_url as string | null) ?? null,
    isVerified: !!p.is_verified,
  };
}

// 本体サロン(salons.owner_id) → 連携している fukuX 店舗プロフィール（kind='shop'）。
// お知らせ→fukuX 同時投稿の author_profile_id に使う。突き合わせ条件は therapist 版と同型で、
// 連携キーは salons.owner_id (uuid) === x_profiles.auth_user_id (uuid) かつ kind='shop'。
// 1 auth = 1 x_profile 前提（getXContext が maybeSingle）だが limit(1) で防御。
// 該当なし・非公開ステータス・handle欠落なら null（＝未連携扱い→呼び出し側は同時投稿を出さない/無効化）。
export async function getLinkedXProfileForSalon(
  ownerUserId: string | null | undefined
): Promise<LinkedXProfile | null> {
  if (!ownerUserId) return null;

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, is_verified, status, kind')
    .eq('auth_user_id', ownerUserId)
    .eq('kind', 'shop')
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const p = data[0];
  if (!p.handle) return null;
  if (!p.status || !PUBLIC_X_STATUSES.includes(p.status as string)) return null;

  return {
    profileId: p.id as string,
    handle: p.handle as string,
    displayName: (p.display_name as string | null) ?? null,
    avatarUrl: (p.avatar_url as string | null) ?? null,
    isVerified: !!p.is_verified,
  };
}

export type LinkedTherapist = {
  id: number;
  name: string;
};

// fukuX プロフィール(x_profiles.auth_user_id) → 連携している本体セラピスト。
// 該当なし・非公開(is_active=false)なら null。
export async function getLinkedTherapistForXProfile(
  authUserId: string | null | undefined
): Promise<LinkedTherapist | null> {
  if (!authUserId) return null;

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('therapists')
    .select('id, name, is_active, user_id')
    .eq('user_id', authUserId)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const t = data[0];
  if (t.is_active === false) return null; // 非公開セラピストはリンクしない

  return { id: t.id as number, name: (t.name as string) ?? '' };
}
