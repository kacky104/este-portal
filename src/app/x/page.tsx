import Link from 'next/link';
import { getXContext } from './xProfile';
import {
  fetchRecommended,
  fetchMyFolloweeIds,
  fetchFollowingPosts,
  fetchMyLikedPostIds,
} from './xPosts';
import { XTimeline } from './XTimeline';

// ログイン状態・自分の x_profiles・フォロー中/いいね状態を読むため動的レンダリング（ISRにはしない）。
export const dynamic = 'force-dynamic';

export default async function XHomePage() {
  const { userId, profile } = await getXContext();

  // ログイン済みだが x_profiles 未作成 → 開設フローへ誘導（タイムラインは出さない）。
  if (userId && !profile) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-black tracking-tight mb-3">アカウントを開設してください</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          fukuX を使うには、表示名と ID を設定してアカウントを開設する必要があります。
        </p>
        <Link
          href="/x/onboarding"
          className="inline-block px-8 py-3 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
          style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
        >
          アカウントを開設する
        </Link>
      </div>
    );
  }

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

  return (
    <div>
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
