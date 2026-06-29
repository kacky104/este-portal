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
    .select('handle, display_name, avatar_url, is_verified, status, kind')
    .eq('auth_user_id', userId)
    .eq('kind', 'therapist')
    .limit(1); // 同一authに複数therapistプロフィールは想定しないが maybeSingle の例外を避けるため limit(1)

  if (error || !data || data.length === 0) return null;

  const p = data[0];
  if (!p.handle) return null;
  if (!p.status || !PUBLIC_X_STATUSES.includes(p.status as string)) return null;

  return {
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
