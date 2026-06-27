import { createClient } from '@/app/lib/supabase/server';

// fukuX のアカウント種別。'user'=見る/フォロー専用・'therapist'=投稿/フォロワー・'shop'=全機能（承認後）。
export type XKind = 'user' | 'therapist' | 'shop';
// 'approved'=利用可・'pending'=運営承認待ち（shop の初期値・DBトリガが自動設定）・'rejected'=却下。
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
};

const XPROFILE_COLUMNS =
  'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url';

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
