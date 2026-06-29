import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchShopMiniByIds } from './xAffiliation';
import type { XKind } from './xProfile';

// ── fukuX フォロー一覧（フォロワー／フォロー中）の公開読み取り（サーバー専用） ──────────
// x_follows(follower_profile_id, followee_profile_id, created_at) の SELECT は公開（anon可）。
// 閲覧者依存がないため createPublicClient（Cookieなし）で取得＝未ログインでも閲覧可。

export type FollowDirection = 'followers' | 'following';

// 一覧の各行に出すユーザーの最小情報（検索結果の行と同じ作法：種別/認証/所属バッジ用）。
export type FollowUser = {
  id: string;
  handle: string;
  displayName: string;
  kind: XKind;
  avatarUrl: string | null;
  isVerified: boolean;
  affiliatedShop: { handle: string; displayName: string } | null;
};

// LIKE のワイルドカード（% _ \）をエスケープし、ilike で大文字小文字無視の一致にする。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

// handle から対象プロフィールの最小情報を公開クライアントで解決。
// 該当なし／rejected（RLSでanonには出ない）は null。呼び出し側で notFound 判定。
export async function resolveProfileMini(
  decodedHandle: string
): Promise<{ id: string; handle: string; displayName: string } | null> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_profiles')
    .select('id, handle, display_name')
    .ilike('handle', escapeLike(decodedHandle))
    .maybeSingle();
  if (!data) return null;
  if (((data.handle as string) ?? '').toLowerCase() !== decodedHandle.toLowerCase()) return null;
  return {
    id: data.id as string,
    handle: data.handle as string,
    displayName: (data.display_name as string) ?? '',
  };
}

// フォロワー or フォロー中のユーザー一覧。
//  followers：その人を followee に持つ follower 群（followee_profile_id = target）。
//  following：その人が follower として持つ followee 群（follower_profile_id = target）。
// x_follows を新しい順に引き、対象 profile を IN でまとめ取り（N+1回避）、所属店舗名を解決して付与。
// 並びは x_follows の created_at desc を保つ（profile の IN 取得は順不同なので並べ直す）。
export async function fetchFollowUsers(targetId: string, direction: FollowDirection): Promise<FollowUser[]> {
  const client = createPublicClient();
  const selectCol = direction === 'followers' ? 'follower_profile_id' : 'followee_profile_id';
  const matchCol = direction === 'followers' ? 'followee_profile_id' : 'follower_profile_id';

  const { data: edges } = await client
    .from('x_follows')
    .select(`${selectCol}, created_at`)
    .eq(matchCol, targetId)
    .order('created_at', { ascending: false })
    .limit(500);

  const orderedIds = ((edges ?? []) as Array<Record<string, unknown>>)
    .map((e) => e[selectCol] as string)
    .filter(Boolean);
  if (orderedIds.length === 0) return [];

  const { data: profs } = await client
    .from('x_profiles')
    .select('id, handle, display_name, kind, avatar_url, is_verified, affiliated_shop_id, status')
    .in('id', orderedIds);

  // rejected（凍結）は一覧に出さない（RLSでanonには元々出ないが二重防御）。
  const rows = ((profs ?? []) as Array<Record<string, unknown>>).filter((p) => (p.status as string) !== 'rejected');

  // 所属店舗名（therapist の affiliated_shop_id 群）を1クエリでまとめ解決。
  const shopDict = await fetchShopMiniByIds(
    client,
    rows.map((p) => (p.affiliated_shop_id as string | null) ?? null)
  );

  const byId = new Map<string, FollowUser>();
  rows.forEach((p) => {
    const kind = (p.kind as XKind) ?? 'user';
    const shop = kind === 'therapist' ? shopDict.get((p.affiliated_shop_id as string) ?? '') : undefined;
    byId.set(p.id as string, {
      id: p.id as string,
      handle: (p.handle as string) ?? '',
      displayName: (p.display_name as string) ?? '',
      kind,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      isVerified: Boolean(p.is_verified),
      affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
    });
  });

  // x_follows の新しい順を保って並べ直す（取得できなかった/除外したidは飛ばす）。
  return orderedIds.map((id) => byId.get(id)).filter((u): u is FollowUser => !!u);
}
