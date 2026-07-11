import { cache } from 'react';
import { createClient } from '@/app/lib/supabase/server';

// fukuX のアカウント種別。'user'=見る/フォロー専用・'therapist'=投稿/フォロワー・'shop'=全機能（即利用可・運営確認で認証バッジ）・'official'=運営事務局（お知らせ投稿用・公式バッジ無条件表示・運営がSQLで直接作成）。
export type XKind = 'user' | 'therapist' | 'shop' | 'official';
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
  created_at: string | null; // プロフィール作成日時（= fukuX開始日）。表示のみ・変更不可。
  address: string | null; // 住所（お店アカウントのみ・任意）。
  dm_disabled: boolean; // DM受付オフ。どちらか一方がtrueなら相互に送信不可（過去メッセージの閲覧は可）。
  showcase_images: string[]; // お店カード画像（お店アカウントのみ）。上限は認証×バナー設置で0/4/8枚（xShowcase.ts参照）。
  banner_installed: boolean; // リンクバナー設置済み（運営が/x/adminで確認・トグル）。カード画像上限+4。読み取り専用。
  offer_enabled: boolean; // オファー受付（求人スカウト）。therapist専用・未所属時のみ意味を持つ。
  offer_comment: string | null; // オファー用PR文（最大300文字・任意）。therapist専用。
  offer_areas: string[]; // オファー希望エリア（X_OFFER_AREAS の値・最大8件）。therapist専用。
};

// オファー機能の希望エリア（固定8種・表示順）は client からも使うため別モジュールに定義し、ここから再export。
export { X_OFFER_AREAS } from './xOfferAreas';

const XPROFILE_COLUMNS =
  'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url, is_verified, affiliated_shop_id, link_url, age, height, bust, cup, waist, hip, created_at, address, dm_disabled, showcase_images, banner_installed, offer_enabled, offer_comment, offer_areas';

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
