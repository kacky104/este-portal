import { createPublicClient } from '@/app/lib/supabase/public';

// タイムラインのバナースライダー1枚分。type はクライアントからも import される（type-only ならビルドに影響しない）。
export type XBanner = {
  slot: number; // 1〜5
  imageUrl: string; // 16:9（1280×720）
  linkUrl: string | null; // タップ時の遷移先（任意）。/ 始まりはサイト内、それ以外は新規タブ。
};

// タイムライン用: 設定済みバナーをページ表示ごとにランダム順で返す（未ログイン閲覧可＝anon）。
// /x は force-dynamic のためリクエスト毎に実行され、リロード・遷移のたびに掲載順が変わる。
export async function fetchXBanners(): Promise<XBanner[]> {
  const client = createPublicClient();
  const { data } = await client.from('x_banners').select('slot, image_url, link_url');
  const banners = (data ?? []).map((r) => ({
    slot: Number(r.slot),
    imageUrl: r.image_url as string,
    linkUrl: (r.link_url as string | null) ?? null,
  }));
  // Fisher–Yates（お店タブの30分シードと違い、毎リクエストで完全ランダム）。
  for (let i = banners.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [banners[i], banners[j]] = [banners[j], banners[i]];
  }
  return banners;
}
