import { createPublicClient } from '@/app/lib/supabase/public';

// トップページのサロン一覧中（15枚目直下）に挿入する画像バナー。公開ページ専用のため anon クライアント
// （createPublicClient）で読む＝cookie を触らないので ISR（revalidate）が有効。RLS の公開SELECT
// （is_active=true）で守られるが、多重防御としてクエリ側でも .eq('is_active', true) を明示する。
export type TopBanner = {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  altText: string;
  displayOrder: number;
};

// is_active=true を display_order 昇順で取得。image_url は NOT NULL 前提だが、防御的に空URLは除外
// （未設定行が公開スライダーで割れないように）。0件なら空配列＝呼び出し側でブロックごと非表示。
export async function fetchActiveTopBanners(): Promise<TopBanner[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('top_banners')
    .select('id, image_url, link_url, alt_text, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  return (data ?? [])
    .map((r) => ({
      id: String(r.id),
      imageUrl: (r.image_url as string | null) ?? '',
      linkUrl: (r.link_url as string | null) ?? null,
      altText: (r.alt_text as string | null) ?? '',
      displayOrder: Number(r.display_order ?? 0),
    }))
    .filter((b) => b.imageUrl !== '');
}
