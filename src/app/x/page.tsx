import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import { getXContext } from './xProfile';
import {
  fetchRecommended,
  fetchMyFolloweeIds,
  fetchFollowingPosts,
  fetchMyLikedPostIds,
} from './xPosts';
import { XTimeline } from './XTimeline';
import { XAffiliationBanner, type IncomingRequest } from './XAffiliationBanner';

// ログイン状態・自分の x_profiles・フォロー中/いいね状態を読むため動的レンダリング（ISRにはしない）。
export const dynamic = 'force-dynamic';

export default async function XHomePage() {
  const { userId, profile } = await getXContext();

  // 閲覧はログイン不要（SNS標準）。未ログイン・未開設でもおすすめタイムラインを見せ、
  // アクション（いいね/フォロー/投稿）時にアカウント作成モーダルへ誘導する。
  // おすすめ（公開・ログイン不要）。フォロー中・いいね状態はログイン時のみ取得。
  const recommended = await fetchRecommended();

  let following: Awaited<ReturnType<typeof fetchFollowingPosts>> = [];
  let followeeIds: string[] = [];
  let likedIds: string[] = [];
  if (profile) {
    followeeIds = await fetchMyFolloweeIds(profile.id);
    following = await fetchFollowingPosts(followeeIds);
    const allIds = [...new Set([...recommended, ...following].map((p) => p.id))];
    likedIds = await fetchMyLikedPostIds(profile.id, allIds);
  }

  // セラピスト本人宛の所属申請（pending）を取得し、承認/却下バナーを出す。
  let incoming: IncomingRequest[] = [];
  let alreadyAffiliated = false;
  if (profile?.kind === 'therapist') {
    const supabase = await createClient();
    const [reqRes, meRes] = await Promise.all([
      supabase
        .from('x_affiliation_requests')
        .select('id, shop_profile_id, created_at')
        .eq('therapist_profile_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('x_profiles').select('affiliated_shop_id').eq('id', profile.id).maybeSingle(),
    ]);
    alreadyAffiliated = !!(meRes.data?.affiliated_shop_id as string | null | undefined);

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
          <p className="text-sm font-bold text-slate-800">メンズエステ専用SNS「fukuX」</p>
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
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              ログイン
            </Link>
          </div>
        </div>
      )}

      {/* セラピスト本人宛の所属申請バナー（承認/却下） */}
      <XAffiliationBanner requests={incoming} alreadyAffiliated={alreadyAffiliated} />

      <XTimeline
        me={profile}
        loggedIn={!!userId}
        recommended={recommended}
        following={following}
        initialLikedIds={likedIds}
        initialFolloweeIds={followeeIds}
      />
    </div>
  );
}
