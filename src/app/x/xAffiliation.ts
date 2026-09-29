import { createPublicClient } from '@/app/lib/supabase/public';

// ── fukuX 所属（店舗⇄セラピスト紐づけ）の共通読み取り（サーバー専用） ──────────
// 書き込みは全て security definer の RPC 経由（x_affiliation_*）。ここは読み取りのみ。
//   x_profiles.affiliated_shop_id(uuid|null) = セラピストの確定所属先（1店舗）。読み取り可・直接UPDATE不可。
//   x_affiliation_requests(id, shop_profile_id, therapist_profile_id, status, created_at, responded_at)
// サーバーの createClient(cookie) でも createPublicClient でも渡せるよう、型は publicClient に合わせる。

type AnyClient = ReturnType<typeof createPublicClient>;

// 所属バッジ・店舗カードに出す店舗の最小情報。
export type ShopMini = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

// 店舗プロフィールの「所属セラピスト一覧」に出すセラピストの最小情報。
export type TherapistMini = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

// shopId 群 → 店舗最小情報の辞書を1クエリでまとめて引く（投稿一覧の所属バッジ用・N+1回避）。
// rejected(凍結)店舗は所属先として表示しない（辞書に入れない＝バッジ非表示）。
export async function fetchShopMiniByIds(
  client: AnyClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, ShopMini>> {
  const dict = new Map<string, ShopMini>();
  const uniq = [...new Set(ids.filter((v): v is string => !!v))];
  if (uniq.length === 0) return dict;
  const { data } = await client
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, status')
    .in('id', uniq)
    .eq('kind', 'shop');
  (data ?? []).forEach((s) => {
    if ((s.status as string) === 'rejected') return;
    dict.set(s.id as string, {
      id: s.id as string,
      handle: (s.handle as string) ?? '',
      displayName: (s.display_name as string) ?? '',
      avatarUrl: (s.avatar_url as string | null) ?? null,
    });
  });
  return dict;
}

// 単一店舗の最小情報（セラピストプロフィールの所属バッジ用）。見つからない/凍結店舗なら null。
export async function fetchShopMini(client: AnyClient, shopId: string | null): Promise<ShopMini | null> {
  if (!shopId) return null;
  const dict = await fetchShopMiniByIds(client, [shopId]);
  return dict.get(shopId) ?? null;
}

// 指定店舗に所属（affiliated_shop_id 一致）する承認済みセラピスト一覧。店舗プロフィールの所属一覧用。
export async function fetchAffiliatedTherapists(
  client: AnyClient,
  shopId: string
): Promise<TherapistMini[]> {
  const { data } = await client
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, status')
    .eq('affiliated_shop_id', shopId)
    .eq('kind', 'therapist')
    .neq('status', 'rejected')
    .order('display_name', { ascending: true });
  return (data ?? []).map((t) => ({
    id: t.id as string,
    handle: (t.handle as string) ?? '',
    displayName: (t.display_name as string) ?? '',
    avatarUrl: (t.avatar_url as string | null) ?? null,
  }));
}

// ★★ 第994便（2026-09-30・カッキーさん）: セラピストページ連携済みのセラピストを、そのお店の fukuX（認証済み）に【自動で所属】させる。
//   ★ 中身は DB の関数 x_affiliation_auto_link（supabase/migrations/20260930_x_affiliation_auto_link.sql）。
//   ★ 本人のログイン（cookie の createClient）で呼ぶ。service_role は使わない。
//   ★ 戻り値: 所属先の x_profiles.id（条件に合わなければ null）。失敗しても画面は止めない（null）。
export async function autoLinkMyAffiliation(client: AnyClient): Promise<string | null> {
  const { data, error } = await client.rpc('x_affiliation_auto_link');
  if (error) {
    console.error('[x] 自動所属に失敗', error.message);
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}
