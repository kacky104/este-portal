import Link from 'next/link';
import { getXContext } from '../xProfile';
import {
  fetchMySavedPostIdsOrdered,
  fetchPostsByIds,
  fetchMyLikedPostIds,
  fetchMyFolloweeIds,
  fetchRepostMeta,
} from '../xPosts';
import { XSavedList } from '../XSavedList';

// 自分の保存（プライベート）を読むため動的レンダリング。
export const dynamic = 'force-dynamic';

// 本人専用の保存一覧（非公開）のため検索インデックス対象外（noindex,nofollow）。
export const metadata = { robots: { index: false, follow: false } };

export default async function XSavedPage() {
  const { userId, profile } = await getXContext();

  // 未ログイン or 未開設：保存はアカウント機能なので案内（要ログイン導線）。
  if (!userId || !profile) {
    return (
      <div className="py-3">
        <Link
          href="/x"
          className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2"
        >
          ← もどる
        </Link>
        <h1 className="x-rescue-muted text-base font-black text-white drop-shadow-sm mb-3">保存した投稿</h1>
        <div className="x-card rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-5 text-center">
          <p className="text-sm font-bold text-slate-800 mb-1">保存はアカウント機能です</p>
          <p className="text-[12px] text-slate-500 mb-4 leading-relaxed">
            ログインすると、気になる投稿を保存して後から見返せます。
          </p>
          <div className="flex justify-center gap-2">
            <Link
              href="/x/signup"
              className="px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              新規登録
            </Link>
            <Link
              href="/x/login"
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              ログイン
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 保存（新しい順）→ 投稿をまとめ取り（順序維持）。さらにいいね済み・フォロー中をまとめ取り（N+1回避）。
  const savedIds = await fetchMySavedPostIdsOrdered(profile.id);
  const posts = await fetchPostsByIds(savedIds);
  const livePostIds = posts.map((p) => p.id); // 削除済み等で欠落した分を除いた実在id
  const [likedIds, followeeIds, repostMeta] = await Promise.all([
    fetchMyLikedPostIds(profile.id, livePostIds),
    fetchMyFolloweeIds(profile.id),
    fetchRepostMeta(profile.id, livePostIds),
  ]);

  return (
    <XSavedList
      me={profile}
      loggedIn={!!userId}
      posts={posts}
      initialLikedIds={likedIds}
      initialSavedIds={livePostIds}
      initialFolloweeIds={followeeIds}
      initialRepostedIds={repostMeta.repostedIds}
      initialRepostCounts={repostMeta.counts}
    />
  );
}
