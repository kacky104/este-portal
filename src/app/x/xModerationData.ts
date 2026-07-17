import { createClient } from '@/app/lib/supabase/server';

// 自分がミュート/ブロック中の相手 profile id 一覧（サーバー専用・Cookieセッション＋RLSで自分の行のみ）。
// タイムライン（/x）のサーバーコンポーネントで取得し、クライアント側のフィード絞り込みに使う。
// フィード自体は共有キャッシュ（公開クエリ）のまま、非表示は閲覧者ごとにクライアントで適用する方針。
export async function fetchMyHiddenProfileIds(myProfileId: string): Promise<string[]> {
  const supabase = await createClient();
  const [mutes, blocks] = await Promise.all([
    supabase.from('x_mutes').select('muted_profile_id').eq('muter_profile_id', myProfileId),
    supabase.from('x_blocks').select('blocked_profile_id').eq('blocker_profile_id', myProfileId),
  ]);
  return [...new Set([
    ...(mutes.data ?? []).map(r => String(r.muted_profile_id)),
    ...(blocks.data ?? []).map(r => String(r.blocked_profile_id)),
  ])];
}

// ミュート/ブロック中アカウントの一覧（本人専用ページ用・新しい順）。
// 行の詳細（表示名・アバター等）は x_profiles をまとめ取り（N+1回避）。
export type ModeratedUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  kind: string;
  isVerified: boolean;
};

export async function fetchMyModeratedUsers(
  myProfileId: string,
  mode: 'mute' | 'block',
): Promise<ModeratedUser[]> {
  const supabase = await createClient();
  const table = mode === 'mute' ? 'x_mutes' : 'x_blocks';
  const ownCol = mode === 'mute' ? 'muter_profile_id' : 'blocker_profile_id';
  const targetCol = mode === 'mute' ? 'muted_profile_id' : 'blocked_profile_id';
  const { data: rows } = await supabase
    .from(table)
    .select(`${targetCol}, created_at`)
    .eq(ownCol, myProfileId)
    .order('created_at', { ascending: false });
  const ids = (rows ?? []).map(r => String((r as Record<string, unknown>)[targetCol]));
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, kind, is_verified')
    .in('id', ids);
  const map = new Map((profiles ?? []).map(p => [String(p.id), p]));
  // 登録順（新しい順）を維持。取得できなかったプロフィール（削除済み等）は除外。
  return ids
    .map(id => map.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map(p => ({
      id: String(p.id),
      handle: String(p.handle),
      displayName: String(p.display_name),
      avatarUrl: (p.avatar_url as string | null) ?? null,
      kind: String(p.kind),
      isVerified: Boolean(p.is_verified),
    }));
}
