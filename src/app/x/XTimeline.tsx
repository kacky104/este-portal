'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import { XComposeFab } from './XComposeFab';
import { XPostCard } from './XPostCard';
import { XAuthGateModal } from './XAuthGateModal';
import { useXEngagement } from './useXEngagement';

export function XTimeline({
  me,
  loggedIn,
  recommended,
  following,
  initialLikedIds,
  initialFolloweeIds,
  initialSavedIds,
  myAffiliatedShop,
}: {
  me: XProfile | null;
  loggedIn: boolean;
  recommended: XPost[];
  following: XPost[];
  initialLikedIds: string[];
  initialFolloweeIds: string[];
  initialSavedIds: string[];
  myAffiliatedShop?: { handle: string; displayName: string } | null;
}) {
  const [tab, setTab] = useState<'recommended' | 'following'>('recommended');
  const [toast, setToast] = useState('');
  const [myNewPosts, setMyNewPosts] = useState<XPost[]>([]);
  const [gateOpen, setGateOpen] = useState(false); // 未ログイン／未開設アクション時のモーダル

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  // いいね/フォローの状態・権限・操作は共通フックに集約（プロフィールページと共有）。
  const eng = useXEngagement({
    me,
    posts: useMemo(() => [...recommended, ...following], [recommended, following]),
    initialLikedIds,
    initialFolloweeIds,
    initialSavedIds,
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });

  // 投稿成功 → おすすめ先頭に差し込み＋いいねマップ登録。
  const onPosted = (post: XPost) => {
    setMyNewPosts((prev) => [post, ...prev]);
    eng.registerPost(post);
    setTab('recommended');
    showToast('投稿しました');
  };

  // おすすめ表示：自分の新規投稿 + サーバー取得分（重複除去）。
  const recommendedView = useMemo(() => {
    const seen = new Set<string>();
    return [...myNewPosts, ...recommended].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [myNewPosts, recommended]);

  const renderList = (list: XPost[]) =>
    list.map((p) => {
      const ls = eng.likeState(p);
      return (
        <XPostCard
          key={p.id}
          post={p}
          liked={ls.liked}
          likeCount={ls.count}
          following={eng.isFollowing(p.author.id)}
          showFollow={eng.showFollowFor(p.author)}
          likePending={eng.likePendingFor(p.id)}
          followPending={eng.followPendingFor(p.author.id)}
          onToggleLike={eng.toggleLike}
          onToggleFollow={eng.toggleFollow}
          saved={eng.isSaved(p.id)}
          savePending={eng.savePendingFor(p.id)}
          onToggleSave={eng.toggleSave}
        />
      );
    });

  return (
    <div className="py-2">
      {/* タブ */}
      <div className="sticky top-14 z-30 -mx-4 px-4 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="flex">
          {([['recommended', 'おすすめ'], ['following', 'フォロー中']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-bold transition-colors relative ${
                tab === key ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {label}
              {tab === key && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full bg-indigo-500" />}
            </button>
          ))}
        </div>
      </div>

      {/* タブ中身 */}
      {tab === 'recommended' ? (
        recommendedView.length === 0 ? (
          <Empty text="まだ投稿がありません" />
        ) : (
          <div className="space-y-3 pt-3">{renderList(recommendedView)}</div>
        )
      ) : !loggedIn ? (
        <div className="py-14 text-center">
          <p className="x-rescue-muted text-sm text-white/90 mb-4 leading-relaxed px-6 drop-shadow-sm">
            ログインすると、フォローしたセラピスト・お店の新着がここに表示されます。
          </p>
          <div className="flex justify-center gap-2">
            <Link
              href="/x/signup"
              className="inline-block px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              新規登録
            </Link>
            <Link
              href="/x/login"
              className="x-rescue-outline inline-block px-6 py-2.5 rounded-xl border border-white/70 text-white font-bold text-sm hover:bg-white/10 transition-colors"
            >
              ログイン
            </Link>
          </div>
        </div>
      ) : following.length === 0 ? (
        <Empty text="気になるセラピスト・お店をフォローすると、ここに新着が表示されます" />
      ) : (
        <div className="space-y-3 pt-3">{renderList(following)}</div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      <XAuthGateModal open={gateOpen} loggedIn={loggedIn} onClose={() => setGateOpen(false)} />

      {/* 右下の投稿FAB（therapist/shop かつ approved のときのみ）。タップで投稿モーダル。 */}
      {eng.canPost && me && (
        <XComposeFab me={me} myAffiliatedShop={myAffiliatedShop ?? null} onPosted={onPosted} />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-16 text-center">
      <p className="x-rescue-muted text-sm text-white/90 leading-relaxed px-6 drop-shadow-sm">{text}</p>
    </div>
  );
}
