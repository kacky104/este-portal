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

// お店タブ用: 承認済み（status=approved）のお店を30分シードでシャッフルして返す（未ログイン閲覧可＝anon）。
// 2026-07-10 ルール変更: 認証（is_verified）と画像1枚以上の条件を撤廃し、未認証店・画像0枚の店も表示する。
// （お店カード画像の設定自体は従来どおり認証店限定＝未認証店は名前カードのみになる。凍結店は非表示のまま）
export async function fetchShopShowcases(): Promise<ShopShowcase[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, showcase_images, is_verified, address')
    .eq('kind', 'shop')
    .eq('status', 'approved');
  const shops = (data ?? [])
    .map((r) => ({
      id: String(r.id),
      handle: r.handle as string,
      displayName: r.display_name as string,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      isVerified: Boolean(r.is_verified),
      address: (r.address as string | null) ?? null,
      // 画像未設定（null含む）は空配列＝カード側でグリッドごと非表示。
      images: (Array.isArray(r.showcase_images) ? (r.showcase_images as string[]) : []).slice(0, 8),
    }));
  return seededWeightedShuffle(shops, thirtyMinSeed(), () => 1.0);
}
