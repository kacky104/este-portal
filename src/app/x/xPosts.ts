import { createPublicClient } from '@/app/lib/supabase/public';
import { createClient } from '@/app/lib/supabase/server';
import { seededShuffle, thirtyMinSeed } from '@/lib/shuffle';
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

// reply_count / replies_disabled はリプライ機能用（reply_count はトリガ自動増減・アプリは手動更新しない）。
const POST_COLS = 'id, author_profile_id, body, images, like_count, reply_count, replies_disabled, created_at';

export type XPostAuthor = {
  id: string;
  handle: string;
  displayName: string;
  kind: XKind;
  avatarUrl: string | null;
  isVerified: boolean; // 認証バッジ（shop のみ運用）
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
    .select('id, handle, display_name, kind, avatar_url, status, is_verified, affiliated_shop_id')
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
      createdAt: r.created_at,
      author: {
        id: r.author_profile_id,
        handle: a.handle,
        displayName: a.display_name,
        kind: a.kind,
        avatarUrl: a.avatar_url,
        isVerified: a.is_verified,
        affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
      },
    });
  }
  return out;
}

// おすすめ（公開）：直近 RECOMMENDED_LIMIT 件を取得→30分シードで決定的シャッフル。
// 同じ30分枠の間は並びが固定（リロードで暴れない）。seededShuffle/thirtyMinSeed は src/lib/shuffle.ts。
export async function fetchRecommended(): Promise<XPost[]> {
  const client = createPublicClient();
  const { data } = await client
    .from('x_posts')
    .select(POST_COLS)
    .is('parent_post_id', null) // リプライ（parent_post_id 有り）はタイムラインに出さない
    .order('created_at', { ascending: false })
    .limit(RECOMMENDED_LIMIT);
  const posts = await attachAuthors(client, (data ?? []) as PostRow[]);
  return seededShuffle(posts, thirtyMinSeed());
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
export async function fetchPostById(id: string): Promise<XPost | null> {
  const client = createPublicClient();
  const { data } = await client.from('x_posts').select(POST_COLS).eq('id', id).maybeSingle();
  if (!data) return null;
  const out = await attachAuthors(client, [data as PostRow]);
  return out[0] ?? null;
}

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
