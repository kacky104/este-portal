import { createPublicClient } from '@/app/lib/supabase/public';
import { seededWeightedShuffle, thirtyMinSeed } from '@/lib/shuffle';
import { shopShowcaseLimit } from './xShowcase';

export type ShopShowcase = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  address: string | null;
  images: string[]; // 表示上限適用済み（認証×バナー設置で 0/4/8 枚）
};

// お店タブ用: 承認済み（status=approved）のお店を30分シードでシャッフルして返す（未ログイン閲覧可＝anon）。
// 2026-07-10 ルール変更: 認証（is_verified）と画像1枚以上の条件を撤廃し、未認証店・画像0枚の店も表示する。
// 2026-07-11 ルール変更: 画像の表示枚数を「認証＋リンクバナー設置」連動に（shopShowcaseLimit＝0/4/8）。
//   上限超過分は温存したまま先頭N枚のみ表示（凍結店は非表示のまま）。
export async function fetchShopShowcases(): Promise<ShopShowcase[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, showcase_images, is_verified, banner_installed, address')
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
      // 画像未設定（null含む）は空配列＝カード側でグリッドごと非表示。上限（0/4/8）で先頭からカット。
      images: (Array.isArray(r.showcase_images) ? (r.showcase_images as string[]) : []).slice(
        0,
        shopShowcaseLimit({ is_verified: Boolean(r.is_verified), banner_installed: Boolean(r.banner_installed) }),
      ),
    }));
  return seededWeightedShuffle(shops, thirtyMinSeed(), () => 1.0);
}

// ★★ 第941便（2026-09-28・カッキーさん）: /x-shops の「認証セラピスト」タブ用。
//   ★ fukuX の赤バッジ（kind='therapist' かつ is_verified）が付いた承認済み（status=approved）の人だけ。
//   ★ 読むだけ（anon・ISR）。★ 所属店舗名は affiliated_shop_id の承認済み店舗から引く（無ければ出さない）。
//   ★ 並びは店舗タブと同じ30分シードのシャッフル。
export type VerifiedTherapistCard = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  age: number | null;
  shopName: string | null;
};

export async function fetchVerifiedTherapists(): Promise<VerifiedTherapistCard[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, age, affiliated_shop_id')
    .eq('kind', 'therapist')
    .eq('status', 'approved')
    .eq('is_verified', true)
    .limit(500);
  const rows = (data ?? []).filter((r) => typeof r.handle === 'string' && r.handle);
  const shopIds = [...new Set(rows.map((r) => r.affiliated_shop_id).filter((v): v is string => typeof v === 'string' && !!v))];
  const shopName = new Map<string, string>();
  if (shopIds.length > 0) {
    const { data: shops } = await client
      .from('x_profiles')
      .select('id, display_name')
      .in('id', shopIds)
      .eq('kind', 'shop')
      .eq('status', 'approved');
    for (const s of shops ?? []) shopName.set(String(s.id), String(s.display_name ?? ''));
  }
  const list = rows.map((r) => ({
    id: String(r.id),
    handle: r.handle as string,
    displayName: (r.display_name as string | null) || (r.handle as string),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    age: typeof r.age === 'number' ? r.age : null,
    shopName: (r.affiliated_shop_id && shopName.get(String(r.affiliated_shop_id))) || null,
  }));
  return seededWeightedShuffle(list, thirtyMinSeed(), () => 1.0);
}
