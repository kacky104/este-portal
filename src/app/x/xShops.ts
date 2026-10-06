import { createPublicClient } from '@/app/lib/supabase/public';
import { seededShuffle, seededWeightedShuffle, thirtyMinSeed } from '@/lib/shuffle';
import { shopShowcaseLimit } from './xShowcase';

export type ShopShowcase = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  address: string | null;
  images: string[]; // 最初に出す並び。表示上限適用済み（認証×バナー設置で 0/4/8 枚）
  // ★ 第1238便: 自動（認証店）のときだけ入る「開くたびにここから選ぶ」候補。手で入れた画像の店は空。
  pool: string[];
};

type PublicClient = ReturnType<typeof createPublicClient>;

// ★★ 第1238便（2026-10-06・カッキーさん）: 認証店のお店カードは、フクエスのランキングと同じく
//   【フクエスに登録している公開中のセラピストの写真】から、開くたびにランダムで規定枚数（4／8）を出す。
//   ・自動になる店＝認証（is_verified）かつ、フクエスに掲載中（is_hidden=false）の店舗を持っている店。
//     つなぎ方は今までと同じ salons.owner_id === x_profiles.auth_user_id（xLink.ts・おすすめランキング）。
//   ・自動の店は、手で入れた showcase_images を【出さない】（DB の中身は触らない＝消していない）。
//   ・未認証でリンクバナー設置（4枚）の店は今までどおり手で入れた画像。認証になると自動に切り替わる。
//   ・認証でもフクエスに掲載中の店舗が無い店（運営が手で認証した店）は、入れる写真が無いので今までどおり手で入れた画像。
//   ・読めなかったとき（error）は「空」にせず、今までどおり手で入れた画像に戻す。
// 1店あたりクライアントへ渡す候補の上限（8枚の3倍）。30分シードで入れ替わるので、在籍が多い店も順に全員が出る。
export const SHOWCASE_POOL_MAX = 24;
const PAGE = 1000; // PostgREST の既定 max-rows。超えても黙って切られないようページングする

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * オーナー（auth_user_id）ごとの、公開中セラピストの写真一覧。
 * ・キーがある＝フクエスに掲載中の店舗を持っている（写真0枚でもキーはある＝自動の対象）。
 * ・null＝読めなかった（呼ぶ側は今までの表示に戻す）。
 */
async function loadAutoPhotos(client: PublicClient, ownerIds: string[]): Promise<Map<string, string[]> | null> {
  const byOwner = new Map<string, string[]>();
  if (ownerIds.length === 0) return byOwner;
  const want = new Set(ownerIds);
  const ownerBySalon = new Map<number, string>();
  // ★ 掲載中でオーナーのいる店舗を全部読んで、こちらで突き合わせる（uuid を URL に並べると店が増えたとき長くなりすぎる）
  for (let from = 0; ; from += PAGE) {
    const res = await client
      .from('salons')
      .select('id, owner_id')
      .eq('is_hidden', false)
      .not('owner_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (res.error) {
      console.error('[x] お店カード: salons を読めなかった', res.error.code, res.error.message);
      return null;
    }
    const rows = (res.data ?? []) as Array<{ id: number; owner_id: string | null }>;
    for (const s of rows) {
      const owner = s.owner_id ? String(s.owner_id) : '';
      if (!owner || !want.has(owner)) continue;
      ownerBySalon.set(Number(s.id), owner);
      if (!byOwner.has(owner)) byOwner.set(owner, []);
    }
    if (rows.length < PAGE) break;
  }
  const salonIds = [...ownerBySalon.keys()];
  if (salonIds.length === 0) return byOwner;
  // ★ 非公開（is_active=false）は出さない（ランキングと同じ）。写真のある子だけ（既定画像は使わない）。
  for (let from = 0; ; from += PAGE) {
    const res = await client
      .from('therapists')
      .select('id, salon_id, profile_image_url')
      .in('salon_id', salonIds)
      .eq('is_active', true)
      .not('profile_image_url', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (res.error) {
      console.error('[x] お店カード: therapists を読めなかった', res.error.code, res.error.message);
      return null;
    }
    const rows = (res.data ?? []) as Array<{ id: number; salon_id: number | null; profile_image_url: string | null }>;
    for (const t of rows) {
      const owner = t.salon_id != null ? ownerBySalon.get(Number(t.salon_id)) : undefined;
      const url = (t.profile_image_url ?? '').trim();
      if (!owner || !url) continue;
      byOwner.get(owner)?.push(url);
    }
    if (rows.length < PAGE) break;
  }
  return byOwner;
}

/** ★ 第1238便: 設定画面用。「お店カードが自動になる店か」＝フクエスに掲載中の店舗を持っているか（認証かどうかは呼ぶ側で見る）。読めなければ false＝今までの手動の画面。 */
export async function hasListedSalonForShowcase(authUserId: string | null | undefined): Promise<boolean> {
  if (!authUserId) return false;
  const client = createPublicClient();
  const res = await client.from('salons').select('id').eq('owner_id', authUserId).eq('is_hidden', false).limit(1);
  if (res.error) {
    console.error('[x] お店カード（設定）: salons を読めなかった', res.error.code, res.error.message);
    return false;
  }
  return (res.data ?? []).length > 0;
}

// お店タブ用: 承認済み（status=approved）のお店を30分シードでシャッフルして返す（未ログイン閲覧可＝anon）。
// 2026-07-10 ルール変更: 認証（is_verified）と画像1枚以上の条件を撤廃し、未認証店・画像0枚の店も表示する。
// 2026-07-11 ルール変更: 画像の表示枚数を「認証＋リンクバナー設置」連動に（shopShowcaseLimit＝0/4/8）。
//   上限超過分は温存したまま先頭N枚のみ表示（凍結店は非表示のまま）。
// 2026-10-06 第1238便: 認証店はセラピスト写真から自動（上の説明）。枚数の決まり（0/4/8）は変えていない。
export async function fetchShopShowcases(): Promise<ShopShowcase[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_profiles')
    .select('id, auth_user_id, handle, display_name, avatar_url, showcase_images, is_verified, banner_installed, address')
    .eq('kind', 'shop')
    .eq('status', 'approved');
  const rows = data ?? [];
  const ownerIds = [
    ...new Set(
      rows
        .filter((r) => Boolean(r.is_verified) && typeof r.auth_user_id === 'string' && r.auth_user_id)
        .map((r) => String(r.auth_user_id)),
    ),
  ];
  const auto = await loadAutoPhotos(client, ownerIds).catch((e) => {
    console.error('[x] お店カード: セラピスト写真の読み取りで例外', e);
    return null;
  });
  const seed = thirtyMinSeed();
  const shops = rows.map((r) => {
    const isVerified = Boolean(r.is_verified);
    const limit = shopShowcaseLimit({ is_verified: isVerified, banner_installed: Boolean(r.banner_installed) });
    // 画像未設定（null含む）は空配列＝カード側でグリッドごと非表示。上限（0/4/8）で先頭からカット。
    const manual = (Array.isArray(r.showcase_images) ? (r.showcase_images as string[]) : []).slice(0, limit);
    // photos が undefined＝自動の対象でない（未認証／掲載中の店舗が無い／読めなかった）→ 手で入れた画像のまま
    const owner = typeof r.auth_user_id === 'string' ? r.auth_user_id : '';
    const photos = isVerified && owner && auto ? auto.get(owner) : undefined;
    const pool = photos && limit > 0
      ? seededShuffle(photos, (seed + hashStr(String(r.id))) >>> 0).slice(0, SHOWCASE_POOL_MAX)
      : [];
    return {
      id: String(r.id),
      handle: r.handle as string,
      displayName: r.display_name as string,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      isVerified,
      address: (r.address as string | null) ?? null,
      images: photos ? pool.slice(0, limit) : manual,
      pool,
    };
  });
  return seededWeightedShuffle(shops, seed, () => 1.0);
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
