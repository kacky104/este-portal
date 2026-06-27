import { createClient } from '@/app/lib/supabase/server';

// fukuX のアカウント種別。'user'=見る/フォロー専用・'therapist'=投稿/フォロワー・'shop'=全機能（即利用可・運営確認で認証バッジ）。
export type XKind = 'user' | 'therapist' | 'shop';
// 新設計：'approved'=通常 / 'rejected'=運営によるBAN(凍結)。'pending' は廃止（互換のため型には残すが未使用）。
export type XStatus = 'approved' | 'pending' | 'rejected';

export type XProfile = {
  id: string;
  auth_user_id: string;
  kind: XKind;
  status: XStatus;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  header_url: string | null;
  is_verified: boolean; // 運営確認済みバッジ（現状 shop のみ運用）。行動可否には無関係＝表示のみ。
};

const XPROFILE_COLUMNS =
  'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url, is_verified';

// ログインユーザーと、その x_profiles（未作成なら null）をサーバー側でまとめて取得する。
// /x・/x/onboarding の分岐に使う。RLS の select は公開だが、自分の行は auth_user_id で引く。
export async function getXContext(): Promise<{
  userId: string | null;
  email: string | null;
  profile: XProfile | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, email: null, profile: null };

  const { data } = await supabase
    .from('x_profiles')
    .select(XPROFILE_COLUMNS)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (data as XProfile | null) ?? null,
  };
}
