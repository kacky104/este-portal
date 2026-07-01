import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getXContext, type XProfile, type XKind, type XStatus } from '../../xProfile';
import { fetchMyLikedPostIds, fetchMySavedPostIds, fetchRepostMeta, type XPost } from '../../xPosts';
import {
  fetchShopMini,
  fetchAffiliatedTherapists,
  type ShopMini,
  type TherapistMini,
} from '../../xAffiliation';
import { XProfileView } from '../../XProfileView';
import { getLinkedTherapistForXProfile } from '@/app/lib/xLink';

// 閲覧者のログイン状態でフォロー状態が変わるため動的レンダリング。
export const dynamic = 'force-dynamic';

const PROFILE_COLS =
  'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url, is_verified, affiliated_shop_id, link_url, age, height, bust, cup, waist, hip, created_at, address';

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
  is_verified: boolean;
  affiliated_shop_id: string | null;
  link_url: string | null;
  age: number | null;
  height: number | null;
  bust: number | null;
  cup: string | null;
  waist: number | null;
  hip: number | null;
  created_at: string | null;
  address: string | null;
};

// LIKE のワイルドカード（% _ \）をエスケープし、ilike で大文字小文字無視の「完全一致」にする。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

export default async function XProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  const supabase = await createClient();

  // viewer（認証＋自分profile）と target プロフィール取得は独立（target は handle 依存・viewer 非依存）なので並列化。
  // handle は lower 一致（@Sera と @sera を同一視）。RLS の SELECT は rejected を本人/運営以外に見せない。
  const [viewer, rowRes] = await Promise.all([
    getXContext(),
    supabase.from('x_profiles').select(PROFILE_COLS).ilike('handle', escapeLike(decoded)).maybeSingle(),
  ]);
  const { data: row } = rowRes;
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
    is_verified: t.is_verified,
    affiliated_shop_id: t.affiliated_shop_id,
    link_url: t.link_url,
    age: t.age,
    height: t.height,
    bust: t.bust,
    cup: t.cup,
    waist: t.waist,
    hip: t.hip,
    created_at: t.created_at,
    address: t.address,
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
      ? supabase.from('x_follows').select('followee_profile_id', { count: 'exact', head: true }).eq('followee_profile_id', target.id)
      : Promise.resolve({ count: null }),
    wantsFollowing
      ? supabase.from('x_follows').select('follower_profile_id', { count: 'exact', head: true }).eq('follower_profile_id', target.id)
      : Promise.resolve({ count: null }),
    supabase
      .from('x_posts')
      .select('id, body, images, like_count, reply_count, replies_disabled, link_url, edited_at, created_at')
      .eq('author_profile_id', target.id)
      .is('parent_post_id', null) // プロフィールの投稿一覧にもリプライは出さない
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const followerCount = wantsFollowers ? (followerRes.count ?? 0) : null;
  const followingCount = wantsFollowing ? (followingRes.count ?? 0) : null;

  // 所属情報：therapist は所属先店舗（1件）、shop は所属セラピスト一覧を解決。
  // linkedTherapist：セラピストなら紐づく本体 therapist を解決（出勤スケジュールブロック用）。
  // therapist id 自体は日付非依存なのでサーバー解決でISRに焼いてよい（日付依存の取得・表示は子のクライアント側）。
  const [affiliatedShop, affiliatedTherapists, linkedTherapist] = await Promise.all([
    target.kind === 'therapist'
      ? fetchShopMini(supabase, t.affiliated_shop_id)
      : Promise.resolve(null),
    target.kind === 'shop'
      ? fetchAffiliatedTherapists(supabase, target.id)
      : Promise.resolve([] as TherapistMini[]),
    target.kind === 'therapist'
      ? getLinkedTherapistForXProfile(target.auth_user_id)
      : Promise.resolve(null),
  ]);
  const scheduleTherapistId = linkedTherapist?.id ?? null; // 紐づく therapist が無ければ null＝ブロック非表示

  // 投稿は全て target が投稿主なので辞書引き不要（author を直接付与）。
  // target が所属ありセラピストなら、本人の投稿カードにも所属バッジが出るよう author に付与。
  const author = {
    id: target.id,
    handle: target.handle,
    displayName: target.display_name,
    kind: target.kind,
    avatarUrl: target.avatar_url,
    isVerified: target.is_verified,
    affiliatedShop: affiliatedShop
      ? { handle: affiliatedShop.handle, displayName: affiliatedShop.displayName }
      : null,
  };
  const posts: XPost[] = (
    (postRes.data ?? []) as Array<{
      id: string;
      body: string | null;
      images: string[] | null;
      like_count: number | null;
      reply_count: number | null;
      replies_disabled: boolean | null;
      link_url: string | null;
      edited_at: string | null;
      created_at: string;
    }>
  ).map((r) => ({
    id: String(r.id),
    body: r.body ?? null,
    images: r.images ?? [],
    likeCount: r.like_count ?? 0,
    replyCount: r.reply_count ?? 0,
    repliesDisabled: Boolean(r.replies_disabled),
    linkUrl: r.link_url ?? null,
    editedAt: r.edited_at ?? null,
    createdAt: r.created_at,
    author,
  }));

  // 閲覧者のフォロー状態・いいね状態・保存状態（ログイン＋自分のprofileがある時のみ）。
  let initialFollowing = false;
  let initialNotifyPosts = false; // フォロー行の投稿通知フラグ（既定OFF）。フォロー中ベルの初期状態。
  let initialLikedIds: string[] = [];
  let initialSavedIds: string[] = [];
  if (viewer.profile) {
    if (!isOwnProfile && wantsFollowers) {
      const { data: f } = await supabase
        .from('x_follows')
        .select('follower_profile_id, notify_posts')
        .eq('follower_profile_id', viewer.profile.id)
        .eq('followee_profile_id', target.id)
        .maybeSingle();
      initialFollowing = !!f;
      initialNotifyPosts = !!(f?.notify_posts);
    }
    const postIds = posts.map((p) => p.id);
    [initialLikedIds, initialSavedIds] = await Promise.all([
      fetchMyLikedPostIds(viewer.profile.id, postIds),
      fetchMySavedPostIds(viewer.profile.id, postIds),
    ]);
  }

  // リポスト件数は公開情報＝未ログインでも表示。自分のリポスト済みは viewer.profile があるときだけ入る。
  const { repostedIds: initialRepostedIds, counts: initialRepostCounts } = await fetchRepostMeta(
    viewer.profile?.id ?? null,
    posts.map((p) => p.id)
  );

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
      initialSavedIds={initialSavedIds}
      initialRepostedIds={initialRepostedIds}
      initialRepostCounts={initialRepostCounts}
      initialFollowing={initialFollowing}
      initialNotifyPosts={initialNotifyPosts}
      affiliatedShop={affiliatedShop}
      affiliatedTherapists={affiliatedTherapists}
      scheduleTherapistId={scheduleTherapistId}
    />
  );
}
