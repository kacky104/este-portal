import { cache } from 'react';
import { createPublicClient } from '@/app/lib/supabase/public';
import { createClient } from '@/app/lib/supabase/server';
import { seededWeightedShuffle, thirtyMinSeed } from '@/lib/shuffle';
import { fetchShopMiniByIds } from './xAffiliation';
import type { XKind } from './xProfile';

// ── fukuX 投稿の取得・整形（サーバー専用） ──────────────────────────────
// おすすめ（公開・ログイン不要）は cookieless の createPublicClient で読む（ISR/匿名SELECT）。
// フォロー中・いいね状態など本人依存は cookie 認証の createClient（server）で読む。
//
// ⚠ 想定スキーマ（作成済み前提・本コードが依存している列名）:
//   x_posts(id, author_profile_id → x_profiles.id, body text, images text[], like_count int, created_at)
//   x_likes(profile_id → x_profiles.id, post_id → x_posts.id)            ※ like_count はトリガ自動増減
//   x_follows(follower_profile_id → x_profiles.id, followee_profile_id → x_profiles.id)
// 列名が異なる場合はこのファイルの定数/クエリのみ修正で済むよう集約している。

// 将来の肥大に備え、おすすめ／フォロー中とも「直近この件数だけ」created_at desc で取得してから処理する。
export const RECOMMENDED_LIMIT = 500;

// reply_count / replies_disabled はリプライ機能用（reply_count はトリガ自動増減・アプリは手動更新しない）。link_url は投稿の外部リンク。edited_at は編集済み表示用。
// pinned_at はプロフィール固定（📌）用（本人が自分のプロフィール先頭に固定・null=非固定）。
const POST_COLS = 'id, author_profile_id, body, images, like_count, reply_count, replies_disabled, link_url, edited_at, created_at, pinned_at';

export type XPostAuthor = {
  id: string;
  handle: string;
  displayName: string;
  kind: XKind;
  avatarUrl: string | null;
  isVerified: boolean; // 認証バッジ（shop のみ運用）
  address: string | null; // 住所（投稿カードで shop のみ名前の下に表示。他 kind は表示しない）
  // セラピストが店舗に所属していれば所属先の最小情報（投稿カードの「○○店所属」表示用）。なければ null。
  affiliatedShop: { handle: string; displayName: string } | null;
};

export type XPost = {
  id: string;
  body: string | null;
  images: string[];
  likeCount: number;
  replyCount: number; // この投稿が持つリプライ数（トリガ自動更新）
  repliesDisabled: boolean; // リプライ受付不可（therapist/shop が自投稿で設定可）
  linkUrl: string | null; // 投稿の外部リンク（http/https のみ・任意）
  editedAt: string | null; // 編集済みなら最終編集時刻（null=未編集）
  // プロフィール固定（📌）日時。本人が自分のプロフィール先頭に固定した投稿（null/未取得=非固定）。
  // optional なのは、pinned_at を select しない補助的な取得経路（検索・詳細等）が残っているため。
  pinnedAt?: string | null;
  createdAt: string;
  author: XPostAuthor;
};

type PostRow = {
  id: string;
  author_profile_id: string;
  body: string | null;
  images: string[] | null;
  like_count: number | null;
  reply_count: number | null;
  replies_disabled: boolean | null;
  link_url: string | null;
  edited_at: string | null;
  pinned_at?: string | null;
  created_at: string;
};

// 取得した投稿行に投稿主プロフィールを辞書引きで合流（N+1回避：プロフィールは1クエリでまとめて取得）。
// 新設計：BAN(status='rejected') の投稿主の投稿のみ除外（それ以外は表示）。
type AnyClient = ReturnType<typeof createPublicClient>;
async function attachAuthors(client: AnyClient, rows: PostRow[]): Promise<XPost[]> {
  const ids = [...new Set(rows.map((r) => r.author_profile_id).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data: profs } = await client
    .from('x_profiles')
    .select('id, handle, display_name, kind, avatar_url, status, is_verified, affiliated_shop_id, address')
    .in('id', ids);

  const dict = new Map<
    string,
    {
      handle: string;
      display_name: string;
      kind: XKind;
      avatar_url: string | null;
      status: string;
      is_verified: boolean;
      affiliated_shop_id: string | null;
      address: string | null;
    }
  >();
  (profs ?? []).forEach((p) =>
    dict.set(p.id as string, {
      handle: (p.handle as string) ?? '',
      display_name: (p.display_name as string) ?? '',
      kind: (p.kind as XKind) ?? 'user',
      avatar_url: (p.avatar_url as string | null) ?? null,
      status: (p.status as string) ?? 'approved',
      is_verified: Boolean(p.is_verified),
      affiliated_shop_id: (p.affiliated_shop_id as string | null) ?? null,
      address: (p.address as string | null) ?? null,
    })
  );

  // 所属先店舗の最小情報を1クエリでまとめて引く（N+1回避：所属店舗idを集約して in 取得）。
  const shopDict = await fetchShopMiniByIds(
    client,
    [...dict.values()].map((a) => a.affiliated_shop_id)
  );

  const out: XPost[] = [];
  for (const r of rows) {
    const a = dict.get(r.author_profile_id);
    if (!a || a.status === 'rejected') continue; // BAN(凍結)の投稿主のみ除外
    const shop = a.affiliated_shop_id ? shopDict.get(a.affiliated_shop_id) : undefined;
    out.push({
      id: String(r.id),
      body: r.body ?? null,
      images: r.images ?? [],
      likeCount: r.like_count ?? 0,
      replyCount: r.reply_count ?? 0,
      repliesDisabled: Boolean(r.replies_disabled),
      linkUrl: r.link_url ?? null,
      editedAt: r.edited_at ?? null,
      pinnedAt: r.pinned_at ?? null,
      createdAt: r.created_at,
      author: {
        id: r.author_profile_id,
        handle: a.handle,
        displayName: a.display_name,
        kind: a.kind,
        avatarUrl: a.avatar_url,
        isVerified: a.is_verified,
        address: a.address,
        affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
      },
    });
  }
  return out;
}

// 承認済みセラピストの優遇倍率（おすすめのみ）。is_verified なセラピストの投稿をこの倍率だけ
// 「上位に来やすく」する重み付きシャッフル。1.0 で無効＝従来の一様シャッフルと同じ分布。
// 上げるほど更に出やすくなる（完全固定ではない＝未承認も上位に来得る）。テスト運用で調整可。
const VERIFIED_THERAPIST_WEIGHT = 2.0;

// おすすめ（公開）：直近 RECOMMENDED_LIMIT 件を取得→30分シードで決定的な重み付きシャッフル。
// 承認済みセラピスト（kind='therapist' かつ is_verified）の投稿に重みを与えて上位に来やすくする。
// 同じ30分枠の間は並びが固定（リロードで暴れない）。重み計算も30分シードの PRNG から決定的に生成。
// 承認済みセラピストが居ない／全員未承認なら全要素 weight=1.0 ＝従来どおりの一様シャッフルになる。
export async function fetchRecommended(): Promise<XPost[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_posts')
    .select(POST_COLS)
    .is('parent_post_id', null) // リプライ（parent_post_id 有り）はタイムラインに出さない
    .order('created_at', { ascending: false })
    .limit(RECOMMENDED_LIMIT);
  const posts = await attachAuthors(client, (data ?? []) as PostRow[]);
  return seededWeightedShuffle(posts, thirtyMinSeed(), (p) =>
    p.author.kind === 'therapist' && p.author.isVerified ? VERIFIED_THERAPIST_WEIGHT : 1.0
  );
}

// 自分がフォローしている profile id 一覧（follow 状態のUI反映＋フォロー中タブの両方に使う）。
export async function fetchMyFolloweeIds(myProfileId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_follows')
    .select('followee_profile_id')
    .eq('follower_profile_id', myProfileId);
  return [...new Set((data ?? []).map((f) => f.followee_profile_id as string))];
}

// ── リポストのフィード反映（プロフィール／フォロー中TL用） ─────────────────────────
// フィードの1アイテム：通常投稿（kind='post'）か、リポスト（kind='repost'・元投稿＋リポスト者名）。
// sortAt は並べ替えキー（post=投稿日時 / repost=リポスト日時）。
export type FeedItem =
  | { kind: 'post'; sortAt: string; post: XPost }
  | { kind: 'repost'; sortAt: string; post: XPost; reposterName: string };

// 指定 reposter 群がリポストした「トップレベル元投稿」を repost.created_at desc で取得し、
// 元投稿に著者を合流（attachAuthors がリプライ/BAN著者を自然に除外）。リポスト者の表示名も付ける。
export type RepostFeedItem = { post: XPost; repostedAt: string; reposterProfileId: string; reposterName: string };
export async function fetchRepostsByReposters(reposterIds: string[]): Promise<RepostFeedItem[]> {
  if (reposterIds.length === 0) return [];
  const client = createPublicClient();
  const { data: rerows } = await client
    .from('x_reposts')
    .select('post_id, created_at, reposter_profile_id')
    .in('reposter_profile_id', reposterIds)
    .order('created_at', { ascending: false })
    .limit(RECOMMENDED_LIMIT);
  const rrows = (rerows ?? []) as Array<{ post_id: number | string; created_at: string; reposter_profile_id: string }>;
  if (rrows.length === 0) return [];

  // 元投稿（トップレベルのみ）をまとめ取得し著者合流。トップレベル以外・削除・BAN著者は byId に載らない＝除外される。
  const postIds = [...new Set(rrows.map((r) => String(r.post_id)))];
  const { data: postRows } = await client
    .from('x_posts')
    .select(POST_COLS)
    .in('id', postIds)
    .is('parent_post_id', null);
  const posts = await attachAuthors(client, (postRows ?? []) as PostRow[]);
  const byId = new Map(posts.map((p) => [p.id, p]));

  // リポスト者の表示名（ラベル用）をまとめ取得。
  const reposterUniq = [...new Set(rrows.map((r) => r.reposter_profile_id).filter(Boolean))];
  const { data: reposterProfs } = await client
    .from('x_profiles')
    .select('id, display_name')
    .in('id', reposterUniq);
  const nameById = new Map<string, string>();
  (reposterProfs ?? []).forEach((p) => nameById.set(p.id as string, (p.display_name as string) ?? ''));

  const out: RepostFeedItem[] = [];
  for (const r of rrows) {
    const post = byId.get(String(r.post_id));
    if (!post) continue; // トップレベルでない/削除/BAN著者 → 除外
    out.push({
      post,
      repostedAt: r.created_at,
      reposterProfileId: r.reposter_profile_id,
      reposterName: nameById.get(r.reposter_profile_id) ?? '',
    });
  }
  return out;
}

// 通常投稿とリポストをマージして sortAt 降順。同一 post_id は sortAt 最新の1件のみ残す（重複排除の既定）。
export function mergePostsAndReposts(posts: XPost[], reposts: RepostFeedItem[]): FeedItem[] {
  const items: FeedItem[] = [
    ...posts.map((p) => ({ kind: 'post' as const, sortAt: p.createdAt, post: p })),
    ...reposts.map((r) => ({ kind: 'repost' as const, sortAt: r.repostedAt, post: r.post, reposterName: r.reposterName })),
  ];
  items.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
  const seen = new Set<string>();
  return items.filter((it) => (seen.has(it.post.id) ? false : (seen.add(it.post.id), true)));
}

// フォロー中タブ：フォロー先の投稿を新着順。フォロー0なら空配列。
export async function fetchFollowingPosts(followeeIds: string[]): Promise<XPost[]> {
  if (followeeIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_posts')
    .select(POST_COLS)
    .in('author_profile_id', followeeIds)
    .is('parent_post_id', null) // リプライはフォロー中タブにも出さない
    .order('created_at', { ascending: false })
    .limit(RECOMMENDED_LIMIT);
  return attachAuthors(supabase, (data ?? []) as PostRow[]);
}

// 投稿詳細ページ用：単一投稿を公開クライアントで取得（ISRキャッシュ可）。見つからなければ null。
// リプライ一覧・いいね/フォロー状態など本人依存・動的な部分はクライアント側でマウント時に取得する。
// React cache() でラップ：同一リクエスト内の generateMetadata と page 本体の二重フェッチを防ぐ
// （生Supabaseクエリは fetch と違い自動dedupeされないため）。シグネチャ・中身は不変。
export const fetchPostById = cache(async (id: string): Promise<XPost | null> => {
  const client = createPublicClient();
  const { data } = await client.from('x_posts').select(POST_COLS).eq('id', id).maybeSingle();
  if (!data) return null;
  const out = await attachAuthors(client, [data as PostRow]);
  return out[0] ?? null;
});

// 指定の投稿群のうち自分がいいね済みの post_id 一覧（いいね状態のUI反映用）。
export async function fetchMyLikedPostIds(myProfileId: string, postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_likes')
    .select('post_id')
    .eq('profile_id', myProfileId)
    .in('post_id', postIds);
  return (data ?? []).map((l) => String(l.post_id));
}

// 指定投稿群の「自分がリポスト済みの post_id」と「post_idごとのリポスト件数」をまとめ取得（N+1回避）。
// x_reposts は select 公開（RLS: using(true)）。件数はDBに非正規化列が無いため、対象投稿のリポスト行を
// 1クエリで引いてJSで集計する（fukuX規模では十分）。myProfileId が null（未ログイン）なら reposted は空。
export async function fetchRepostMeta(
  myProfileId: string | null,
  postIds: string[]
): Promise<{ repostedIds: string[]; counts: Record<string, number> }> {
  if (postIds.length === 0) return { repostedIds: [], counts: {} };
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_reposts')
    .select('post_id, reposter_profile_id')
    .in('post_id', postIds);
  const counts: Record<string, number> = {};
  const repostedIds: string[] = [];
  ((data ?? []) as Array<{ post_id: number | string; reposter_profile_id: string }>).forEach((r) => {
    const pid = String(r.post_id);
    counts[pid] = (counts[pid] ?? 0) + 1;
    if (myProfileId && r.reposter_profile_id === myProfileId) repostedIds.push(pid);
  });
  return { repostedIds, counts };
}

// 指定の投稿群のうち自分が保存（ブックマーク）済みの post_id 一覧（保存ボタンの初期塗り用・まとめ取り＝N+1回避）。
// x_post_saves は RLS で自分の行のみ select 可。
export async function fetchMySavedPostIds(myProfileId: string, postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_post_saves')
    .select('post_id')
    .eq('profile_id', myProfileId)
    .in('post_id', postIds);
  return (data ?? []).map((s) => String(s.post_id));
}

// 自分が保存した post_id（保存の新しい順）。/x/saved の取得起点。RLSで自分の行のみ。
export async function fetchMySavedPostIdsOrdered(myProfileId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('x_post_saves')
    .select('post_id, created_at')
    .eq('profile_id', myProfileId)
    .order('created_at', { ascending: false })
    .limit(RECOMMENDED_LIMIT);
  return (data ?? []).map((s) => String(s.post_id));
}

// 指定 id 群の投稿を取得し、与えた id の順序を保って返す（/x/saved 用・著者は attachAuthors で合流）。
// in() は順不同なので ids の順に並べ直す。削除済み投稿・BAN著者の投稿は自然に欠落（保存はCASCADEで消える）。
export async function fetchPostsByIds(ids: string[]): Promise<XPost[]> {
  if (ids.length === 0) return [];
  const client = createPublicClient();
  const { data } = await client.from('x_posts').select(POST_COLS).in('id', ids);
  const rows = (data ?? []) as PostRow[];
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is PostRow => !!r);
  return attachAuthors(client, ordered);
}
