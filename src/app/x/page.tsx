import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getXContext } from './xProfile';
import {
  fetchRecommended,
  fetchMyFolloweeIds,
  fetchFollowingPosts,
  fetchMyLikedPostIds,
  fetchMySavedPostIds,
  fetchRepostMeta,
  fetchRepostsByReposters,
  mergePostsAndReposts,
  type FeedItem,
} from './xPosts';
import { XTimeline } from './XTimeline';
import { XAffiliationBanner, type IncomingRequest } from './XAffiliationBanner';
import { fetchShopMini } from './xAffiliation';
import { fetchFollowUsers, type FollowUser } from './xFollows';
import { fetchShopShowcases } from './xShops';
import { fetchStoryGroups, fetchStoryAuthorsPublic, type StoryGroup } from './xStories';
import { XStoryBar } from './XStoryBar';
import { fetchXBanners } from './xBanners';
import { fetchMyHiddenProfileIds } from './xModerationData';

// ログイン状態・自分の x_profiles・フォロー中/いいね状態を読むため動的レンダリング（ISRにはしない）。
export const dynamic = 'force-dynamic';

// canonical を明示しないと root layout の alternates:{canonical:'/'} を継承し、
// fukuXトップの正規URLが本体トップ扱いになる（検索インデックス除外の恐れ）。
// layout 側に置くと canonical 未定義の下位ページ全てが /x 扱いになるため page 側で定義する。
export const metadata = { alternates: { canonical: '/x' } };

export default async function XHomePage() {
  // 閲覧はログイン不要（SNS標準）。未ログイン・未開設でもおすすめタイムラインを見せ、
  // アクション（いいね/フォロー/投稿）時にアカウント作成モーダルへ誘導する。
  // getXContext（認証＋自分profile）と fetchRecommended・fetchShopShowcases（profile非依存）は独立なので並列化。
  const [{ userId, profile }, recommended, shopShowcases, banners] = await Promise.all([
    getXContext(),
    fetchRecommended(),
    fetchShopShowcases(),
    fetchXBanners(),
  ]);

  let followingFeed: FeedItem[] = []; // フォロー中タブ：フォロー先の投稿＋フォロー先がリポストした投稿をマージ
  let followeeIds: string[] = [];
  let likedIds: string[] = [];
  let savedIds: string[] = [];
  let repostedIds: string[] = [];
  let repostCounts: Record<string, number> = {};
  let hiddenProfileIds: string[] = []; // ミュート/ブロック中の相手（タイムライン非表示用）
  if (profile) {
    [followeeIds, hiddenProfileIds] = await Promise.all([
      fetchMyFolloweeIds(profile.id),
      fetchMyHiddenProfileIds(profile.id),
    ]);
    // フォロー先のトップレベル投稿と、フォロー先がリポストした投稿を並行取得しマージ（sortAt降順・重複排除）。
    const [followingPosts, followingReposts] = await Promise.all([
      fetchFollowingPosts(followeeIds),
      fetchRepostsByReposters(followeeIds),
    ]);
    followingFeed = mergePostsAndReposts(followingPosts, followingReposts);
  }
  // おすすめにはリポストを流さない（従来の投稿のみ）。meta/いいね/保存は両タブの全post_idを対象に。
  const allIds = [...new Set([...recommended.map((p) => p.id), ...followingFeed.map((f) => f.post.id)])];
  // リポスト件数は公開情報＝未ログインでも表示。自分のリポスト済みは profile があるときだけ入る。
  {
    const meta = await fetchRepostMeta(profile?.id ?? null, allIds);
    repostedIds = meta.repostedIds;
    repostCounts = meta.counts;
  }
  if (profile) {
    // いいね済み・保存済みの post_id をまとめて取得（互いに独立＝並列・N+1回避）。
    [likedIds, savedIds] = await Promise.all([
      fetchMyLikedPostIds(profile.id, allIds),
      fetchMySavedPostIds(profile.id, allIds),
    ]);
  }

  // セラピスト本人：タイムライン2つ目タブを「フォロワー一覧」に置き換えるため、自分のフォロワーを取得。
  // （セラピストはフォローしない仕様＝フォロー中フィードが常に空のため）。
  let myFollowers: FollowUser[] = [];
  if (profile?.kind === 'therapist') {
    myFollowers = await fetchFollowUsers(profile.id, 'followers');
  }

  // ストーリーバー：ログイン済み（profile あり）は本体つきで取得。
  // 未ログイン/未開設は投稿者情報のみ（サークル表示・タップでログイン誘導）。
  let storyGroups: StoryGroup[] = [];
  if (profile) {
    storyGroups = await fetchStoryGroups();
  } else {
    storyGroups = await fetchStoryAuthorsPublic();
  }

  // 凍結(BAN=status='rejected')中の本人かどうか。凍結中はアクション系UI（コンポーザは canPost で抑止済み）に加え、
  // 所属申請バナーも出さない（承認/却下RPCはどのみちRLS/ガードで弾かれるため）。
  const isFrozen = profile?.status === 'rejected';

  // セラピスト本人宛の所属申請（pending）を取得し、承認/却下バナーを出す。
  // あわせて自分の所属先（あれば）を解決し、投稿直後の楽観カードにも所属バッジを出せるようにする。
  let incoming: IncomingRequest[] = [];
  const alreadyAffiliated = !!(profile?.affiliated_shop_id ?? null);
  let myAffiliatedShop: { handle: string; displayName: string } | null = null;
  if (profile?.kind === 'therapist' && !isFrozen) {
    const supabase = await createClient();
    const [reqRes, shopMini] = await Promise.all([
      supabase
        .from('x_affiliation_requests')
        .select('id, shop_profile_id, created_at')
        .eq('therapist_profile_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      fetchShopMini(supabase, profile.affiliated_shop_id),
    ]);
    myAffiliatedShop = shopMini ? { handle: shopMini.handle, displayName: shopMini.displayName } : null;

    const reqRows = (reqRes.data ?? []) as Array<{ id: number | string; shop_profile_id: string; created_at: string }>;
    const shopIds = [...new Set(reqRows.map((r) => r.shop_profile_id).filter(Boolean))];
    if (shopIds.length > 0) {
      // 申請元店舗の最小情報を1クエリで合流（N+1回避）。凍結店舗からの申請は出さない。
      const { data: shops } = await supabase
        .from('x_profiles')
        .select('id, handle, display_name, avatar_url, is_verified, status')
        .in('id', shopIds);
      const dict = new Map<string, IncomingRequest['shop']>();
      (shops ?? []).forEach((s) => {
        if ((s.status as string) === 'rejected') return;
        dict.set(s.id as string, {
          id: s.id as string,
          handle: (s.handle as string) ?? '',
          displayName: (s.display_name as string) ?? '',
          avatarUrl: (s.avatar_url as string | null) ?? null,
          isVerified: Boolean(s.is_verified),
        });
      });
      incoming = reqRows
        .map((r) => {
          const shop = dict.get(r.shop_profile_id);
          return shop ? { requestId: String(r.id), shop } : null;
        })
        .filter((v): v is IncomingRequest => v !== null);
    }
  }

  return (
    <div>
      {/* 凍結(BAN)中の本人への通知。理由は表示しない。ログイン/開設バナーより優先して最上部に出す。 */}
      {isFrozen && (
        <div className="mt-4 mb-1 p-5 rounded-2xl bg-slate-50 border border-[color:var(--x-border-strong)]">
          <div className="flex items-start gap-3">
            <span className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">このアカウントは現在ご利用いただけません</p>
              <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                運営により利用を停止されています。投稿・いいね・フォローはご利用いただけません。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ログイン済みだが未開設：閲覧はできる。投稿/フォローには開設が必要なので案内バナーを出す。 */}
      {userId && !profile && (
        <div className="mt-4 mb-1 p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-100">
          <p className="text-sm font-bold text-slate-800">アカウントを開設しましょう</p>
          <p className="text-[12px] text-slate-500 mt-0.5 mb-3">
            表示名と ID を設定すると、投稿・いいね・フォローができるようになります。
          </p>
          <Link
            href="/x/onboarding"
            className="inline-block px-4 py-2 rounded-lg text-white font-bold text-xs shadow-sm hover:opacity-95 transition-opacity"
            style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            アカウントを開設する
          </Link>
        </div>
      )}

      {/* 未ログイン向けの小バナー（おすすめは見られる。投稿/フォローはログイン後） */}
      {!userId && (
        <div className="mt-4 mb-1 p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-100">
          <p className="text-sm font-bold text-slate-800">メンズエステ専用SNS「fukuX(フクエックス)」</p>
          <p className="text-[12px] text-slate-500 mt-0.5 mb-3">
            お気に入りのセラピスト・お店をフォローして新着をチェックしよう。
          </p>
          <div className="flex gap-2">
            <Link
              href="/x/signup"
              className="px-4 py-2 rounded-lg text-white font-bold text-xs shadow-sm hover:opacity-95 transition-opacity"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              はじめる
            </Link>
            <Link
              href="/x/login"
              className="px-4 py-2 rounded-lg border border-[color:var(--x-border-strong)] text-slate-600 font-bold text-xs hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              ログイン
            </Link>
          </div>
        </div>
      )}

      {/* セラピスト本人宛の所属申請バナー（承認/却下） */}
      <XAffiliationBanner requests={incoming} alreadyAffiliated={alreadyAffiliated} />

      {/* ストーリーバー（タブの上）。未ログインもサークルは見える＝タップでログイン誘導モーダル。 */}
      <XStoryBar groups={storyGroups} me={profile} loggedIn={!!userId} />

      <XTimeline
        me={profile}
        loggedIn={!!userId}
        recommended={recommended}
        shopShowcases={shopShowcases}
        followingFeed={followingFeed}
        initialLikedIds={likedIds}
        initialFolloweeIds={followeeIds}
        initialSavedIds={savedIds}
        initialRepostedIds={repostedIds}
        initialRepostCounts={repostCounts}
        myFollowers={myFollowers}
        myAffiliatedShop={myAffiliatedShop}
        banners={banners}
        initialHiddenProfileIds={hiddenProfileIds}
        isAdmin={userId === ADMIN_UUID}
      />
    </div>
  );
}
