import { createPublicClient } from '@/app/lib/supabase/public';

// 各ページに差し込む「細い広告バナー」枠（ad_banners）。
// 公開ページ専用のため anon（createPublicClient）で読む＝cookie を触らないので ISR（revalidate）が有効。
// RLS の公開SELECT（is_active=true）で守られるが、多重防御としてクエリ側でも .eq('is_active', true) を明示する。
// 表示側（AdBanner.tsx）は公開中からランダム1枚を抽選する（display_order の昇順で返す）。
export type AdBanner = {
  id: string;
  imageUrl: string;              // admin アップロード画像（PC用）
  mobileImageUrl: string | null; // スマホ用画像（任意）。未設定は imageUrl をスマホでも表示。
  altText: string;
  linkUrl: string | null;        // リンク先URL（相対 /... または https:// 絶対）。空はリンクなし。
};

export async function fetchActiveAdBanners(): Promise<AdBanner[]> {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from('ad_banners')
    .select('id, image_url, mobile_image_url, alt_text, link_url, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // image_url は NOT NULL 前提だが、防御的に空URLは除外（未設定行で表示が割れないように）。
  return (data ?? [])
    .map((r) => ({
      id: String(r.id),
      imageUrl: (r.image_url as string | null) ?? '',
      mobileImageUrl: ((r.mobile_image_url as string | null) ?? '').trim() || null,
      altText: (r.alt_text as string | null) ?? '',
      linkUrl: ((r.link_url as string | null) ?? '').trim() || null,
    }))
    .filter((b) => b.imageUrl !== '');
}
