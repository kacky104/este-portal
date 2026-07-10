import { createPublicClient } from '@/app/lib/supabase/public';

// タイムラインのバナースライダー1枚分。type はクライアントからも import される（type-only ならビルドに影響しない）。
export type XBanner = {
  slot: number; // 1〜5
  imageUrl: string; // 16:9（1280×720）
  linkUrl: string | null; // タップ時の遷移先（任意）。/ 始まりはサイト内、それ以外は新規タブ。
};

// タイムライン用: 設定済みバナーを slot 順に返す（未ログイン閲覧可＝anon）。
export async function fetchXBanners(): Promise<XBanner[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_banners')
    .select('slot, image_url, link_url')
    .order('slot', { ascending: true });
  return (data ?? []).map((r) => ({
    slot: Number(r.slot),
    imageUrl: r.image_url as string,
    linkUrl: (r.link_url as string | null) ?? null,
  }));
}
