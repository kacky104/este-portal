import { createPublicClient } from '@/app/lib/supabase/public';
import { seededWeightedShuffle, thirtyMinSeed } from '@/lib/shuffle';

export type ShopShowcase = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  address: string | null;
  images: string[]; // 最大8枚
};

// お店タブ用: 承認済み・認証済み・画像1枚以上のお店を30分シードでシャッフルして返す（未ログイン閲覧可＝anon）。
export async function fetchShopShowcases(): Promise<ShopShowcase[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, showcase_images, is_verified, address')
    .eq('kind', 'shop')
    .eq('status', 'approved')
    .eq('is_verified', true); // 未認証店舗は表示対象外（トリガ済みだが二重防御・表示条件の明文化）
  const shops = (data ?? [])
    .filter((r) => Array.isArray(r.showcase_images) && r.showcase_images.length > 0)
    .map((r) => ({
      id: String(r.id),
      handle: r.handle as string,
      displayName: r.display_name as string,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      isVerified: Boolean(r.is_verified),
      address: (r.address as string | null) ?? null,
      images: (r.showcase_images as string[]).slice(0, 8),
    }));
  return seededWeightedShuffle(shops, thirtyMinSeed(), () => 1.0);
}
