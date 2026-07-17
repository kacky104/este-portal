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
