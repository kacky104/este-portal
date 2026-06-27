import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getXContext, type XProfile, type XKind, type XStatus } from '../../xProfile';
import { fetchMyLikedPostIds, type XPost } from '../../xPosts';
import { XProfileView } from '../../XProfileView';

// 閲覧者のログイン状態でフォロー状態が変わるため動的レンダリング。
export const dynamic = 'force-dynamic';

const PROFILE_COLS = 'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url';

type ProfileRow = {
  id: string;
  auth_user_id: string;
  kind: XKind;
  status: XStatus;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  header_url: string | null;
};

// LIKE のワイルドカード（% _ \）をエスケープし、ilike で大文字小文字無視の「完全一致」にする。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

export default async function XProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  const viewer = await getXContext();
  const supabase = await createClient();

  // handle は lower 一致（@Sera と @sera を同一視）。RLS の SELECT は rejected を本人/運営以外に見せない。
  const { data: row } = await supabase
    .from('x_profiles')
    .select(PROFILE_COLS)
    .ilike('handle', escapeLike(decoded))
    .maybeSingle();
  const t = row as ProfileRow | null;
  if (!t || t.handle.toLowerCase() !== decoded.toLowerCase()) notFound();

  const target: XProfile = {
    id: t.id,
    auth_user_id: t.auth_user_id,
    kind: t.kind,
    status: t.status,
    handle: t.handle,
    display_name: t.display_name,
    bio: t.bio,
    avatar_url: t.avatar_url,
    header_url: t.header_url,
  };

  const isOwnProfile = !!viewer.profile && viewer.profile.id === target.id;
  const isAdmin = viewer.userId === ADMIN_UUID;

  // rejected は本人/運営以外には出さない（RLSで弾かれるが二重防御で notFound）。
  if (target.status === 'rejected' && !isOwnProfile && !isAdmin) notFound();

  // フォロー数/フォロワー数は count クエリで取得（kind が持ち得る数だけ）。
  const wantsFollowers = target.kind === 'therapist' || target.kind === 'shop'; // フォロワーを持ち得る
  const wantsFollowing = target.kind === 'user' || target.kind === 'shop'; // フォローし得る

  const [followerRes, followingRes, postRes] = await Promise.all([
    wantsFollowers
      ? supabase.from('x_follows').select('id', { count: 'exact', head: true }).eq('followee_profile_id', target.id)
      : Promise.resolve({ count: null }),
    wantsFollowing
      ? supabase.from('x_follows').select('id', { count: 'exact', head: true }).eq('follower_profile_id', target.id)
      : Promise.resolve({ count: null }),
    supabase
      .from('x_posts')
      .select('id, body, images, like_count, created_at')
      .eq('author_profile_id', target.id)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const followerCount = wantsFollowers ? (followerRes.count ?? 0) : null;
  const followingCount = wantsFollowing ? (followingRes.count ?? 0) : null;

  // 投稿は全て target が投稿主なので辞書引き不要（author を直接付与）。
  const author = {
    id: target.id,
    handle: target.handle,
    displayName: target.display_name,
    kind: target.kind,
    avatarUrl: target.avatar_url,
  };
  const posts: XPost[] = (
    (postRes.data ?? []) as Array<{
      id: string;
      body: string | null;
      images: string[] | null;
      like_count: number | null;
      created_at: string;
    }>
  ).map((r) => ({
    id: String(r.id),
    body: r.body ?? null,
    images: r.images ?? [],
    likeCount: r.like_count ?? 0,
    createdAt: r.created_at,
    author,
  }));

  // 閲覧者のフォロー状態・いいね状態（ログイン＋自分のprofileがある時のみ）。
  let initialFollowing = false;
  let initialLikedIds: string[] = [];
  if (viewer.profile) {
    if (!isOwnProfile && wantsFollowers) {
      const { data: f } = await supabase
        .from('x_follows')
        .select('id')
        .eq('follower_profile_id', viewer.profile.id)
        .eq('followee_profile_id', target.id)
        .maybeSingle();
      initialFollowing = !!f;
    }
    initialLikedIds = await fetchMyLikedPostIds(
      viewer.profile.id,
      posts.map((p) => p.id)
    );
  }

  return (
    <XProfileView
      target={target}
      viewerProfile={viewer.profile}
      loggedIn={!!viewer.userId}
      isOwnProfile={isOwnProfile}
      followerCount={followerCount}
      followingCount={followingCount}
      posts={posts}
      initialLikedIds={initialLikedIds}
      initialFollowing={initialFollowing}
    />
  );
}
