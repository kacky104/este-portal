'use client';

import { useState } from 'react';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import { XPostCard } from './XPostCard';
import { VerifiedBadge } from './VerifiedBadge';
import { XAuthGateModal } from './XAuthGateModal';
import { useXEngagement } from './useXEngagement';

const KIND_LABEL: Record<string, string> = {
  user: 'ユーザー',
  therapist: 'セラピスト',
  shop: 'お店',
};

export function XProfileView({
  target,
  viewerProfile,
  loggedIn,
  isOwnProfile,
  followerCount,
  followingCount,
  posts,
  initialLikedIds,
  initialFollowing,
}: {
  target: XProfile;
  viewerProfile: XProfile | null;
  loggedIn: boolean;
  isOwnProfile: boolean;
  followerCount: number | null;
  followingCount: number | null;
  posts: XPost[];
  initialLikedIds: string[];
  initialFollowing: boolean;
}) {
  const [toast, setToast] = useState('');
  const [gateOpen, setGateOpen] = useState(false); // 未ログイン／未開設アクション時のモーダル
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  // いいね／フォローは共通フックで（タイムラインと同一ロジック）。
  const eng = useXEngagement({
    me: viewerProfile,
    posts,
    initialLikedIds,
    initialFolloweeIds: initialFollowing ? [target.id] : [],
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });

  const showFollowBtn = eng.showFollowFor(target); // target が therapist/shop・自分以外・自分が therapist でない
  const following = eng.isFollowing(target.id);
  const followPending = eng.followPendingFor(target.id);

  return (
    <div>
      {/* ─── ヘッダー ─── */}
      <div className="-mx-4">
        {/* バナー（header_url があれば） */}
        <div className="h-28 bg-gradient-to-br from-indigo-100 to-sky-100 relative">
          {target.header_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={target.header_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="px-4">
          <div className="flex items-end justify-between -mt-9">
            <span className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center">
              {target.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={target.avatar_url} alt={target.display_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-2xl">{target.display_name.charAt(0) || '?'}</span>
              )}
            </span>

            <div className="mb-1">
              {isOwnProfile ? (
                <span className="inline-block text-xs font-bold px-4 py-1.5 rounded-full border border-slate-200 text-slate-400">
                  プロフィール編集（準備中）
                </span>
              ) : showFollowBtn ? (
                // 未ログイン／未開設でも表示し、押下時に toggleFollow → onAuthRequired でモーダルを開く。
                <button
                  type="button"
                  onClick={() => eng.toggleFollow(target.id)}
                  disabled={followPending}
                  className={`text-sm font-bold px-5 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
                    following
                      ? 'border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500'
                      : 'text-white'
                  }`}
                  style={following ? undefined : { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                >
                  {following ? 'フォロー中' : 'フォロー'}
                </button>
              ) : null}
            </div>
          </div>

          {/* 名前・handle・kind */}
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 truncate">{target.display_name}</h1>
              {target.kind === 'shop' && target.is_verified && <VerifiedBadge size={18} />}
              <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5 flex-shrink-0">
                {KIND_LABEL[target.kind] ?? target.kind}
              </span>
            </div>
            <p className="text-sm text-slate-400">@{target.handle}</p>
            {target.bio && <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words mt-2">{target.bio}</p>}

            {/* 数値（kind が持ち得る数だけ表示） */}
            <div className="flex items-center gap-4 mt-3 text-sm">
              {followingCount !== null && (
                <span className="text-slate-500">
                  <strong className="text-slate-900 tabular-nums">{followingCount}</strong> フォロー中
                </span>
              )}
              {followerCount !== null && (
                <span className="text-slate-500">
                  <strong className="text-slate-900 tabular-nums">{followerCount}</strong> フォロワー
                </span>
              )}
            </div>

            {/* 本人向け：BAN(凍結)時の注記 */}
            {isOwnProfile && target.status === 'rejected' && (
              <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-[12px] leading-relaxed">
                このアカウントは運営により凍結されています。投稿・フォローはできず、プロフィールは他のユーザーに表示されません。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 投稿一覧 ─── */}
      <div className="mt-4 border-t border-slate-100">
        {posts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-400">まだ投稿がありません</p>
          </div>
        ) : (
          posts.map((p) => {
            const ls = eng.likeState(p);
            return (
              <XPostCard
                key={p.id}
                post={p}
                liked={ls.liked}
                likeCount={ls.count}
                following={following}
                showFollow={false} /* プロフィール上部にフォローボタンがあるため各投稿では出さない */
                likePending={eng.likePendingFor(p.id)}
                followPending={followPending}
                onToggleLike={eng.toggleLike}
                onToggleFollow={eng.toggleFollow}
              />
            );
          })
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      <XAuthGateModal open={gateOpen} loggedIn={loggedIn} onClose={() => setGateOpen(false)} />
    </div>
  );
}
