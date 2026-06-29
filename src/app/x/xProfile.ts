import { cache } from 'react';
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
  affiliated_shop_id: string | null; // 確定所属先（therapist のみ持ち得る）。読み取り専用＝書き換えは RPC 経由。
  link_url: string | null; // プロフィールの外部リンク（http/https のみ・任意）
  // 年齢・スリーサイズ（すべて任意・本人が編集）。fukuX プロフィール自体が持つ（therapists 非依存）。
  age: number | null;
  height: number | null; // T（身長cm）
  bust: number | null; // B（バストcm）
  cup: string | null; // カップ（例: F）
  waist: number | null; // W（ウエストcm）
  hip: number | null; // H（ヒップcm）
};

const XPROFILE_COLUMNS =
  'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url, is_verified, affiliated_shop_id, link_url, age, height, bust, cup, waist, hip';

// ログインユーザーと、その x_profiles（未作成なら null）をサーバー側でまとめて取得する。
// /x・/x/onboarding の分岐に使う。RLS の select は公開だが、自分の行は auth_user_id で引く。
//
// React cache() でラップ＝同一リクエスト内で何度呼んでも getUser＋x_profiles は1回だけ実行される。
// これにより /x レイアウト（me を Provider に seed）とページが両方呼んでも getUser が二重にならない。
// 戻り値・引数・取得内容は不変（呼び出し側の変更不要）。
export const getXContext = cache(
  async (): Promise<{
    userId: string | null;
    email: string | null;
    profile: XProfile | null;
  }> => {
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
);
