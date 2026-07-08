import { createPublicClient } from '@/app/lib/supabase/public';

// トップ＋全エリアページのサロン一覧中（20枚目直下）に表示する「セラピストピックアップ枠」。
// 公開ページ専用のため anon（createPublicClient）で読む＝cookie を触らないので ISR（revalidate）が有効。
// RLS の公開SELECT（is_active=true）で守られるが、多重防御としてクエリ側でも .eq('is_active', true) を明示する。
//
// 各枠は therapist_id 必須（DBの NOT NULL）。クリックで /therapist/{id} に飛ぶが、非公開（anon の RLS で
// therapists が返らない）セラピストはリンクを張らず画像のみにフォールバックする（おすすめサロンバナーと同じ思想）。
// ※ therapists.id は integer。
export type TherapistPickupBanner = {
  id: string;
  imageUrl: string;   // admin アップロード画像
  altText: string;
  therapistId: number;
  linkable: boolean;  // 紐づくセラピストが anon 取得可（公開中）＝リンクを張れる
};

export async function fetchActiveTherapistPickupBanners(): Promise<TherapistPickupBanner[]> {
  const supabase = createPublicClient();

  const { data: bannerRows } = await supabase
    .from('therapist_pickup_banners')
    .select('id, image_url, alt_text, therapist_id, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // image_url は NOT NULL 前提だが、防御的に空URLは除外（未設定行で表示が割れないように）。
  const banners = (bannerRows ?? [])
    .map((r) => ({
      id: String(r.id),
      imageUrl: (r.image_url as string | null) ?? '',
      altText: (r.alt_text as string | null) ?? '',
      therapistId: Number(r.therapist_id),
    }))
    .filter((b) => b.imageUrl !== '');

  if (banners.length === 0) return [];

  // 紐づくセラピストが anon で取得できるものだけリンク有効にする（非公開はリンクなし画像のみ）。
  const therapistIds = [...new Set(banners.map((b) => b.therapistId))];
  const { data: therapistData } = await supabase
    .from('therapists')
    .select('id')
    .in('id', therapistIds);
  const linkableSet = new Set((therapistData ?? []).map((t) => Number(t.id)));

  // display_order の順を維持（表示側でランダム1枚を抽選する）。
  return banners.map((b) => ({
    id: b.id,
    imageUrl: b.imageUrl,
    altText: b.altText,
    therapistId: b.therapistId,
    linkable: linkableSet.has(b.therapistId),
  }));
}
