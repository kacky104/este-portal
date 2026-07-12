'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import { XPostCard } from './XPostCard';
import { XAuthGateModal } from './XAuthGateModal';
import { useXEngagement } from './useXEngagement';
import { useXToast } from './useXToast';

// 保存した投稿の一覧（自分のみ）。各カードの保存ボタンから解除でき、解除すると一覧から消える。
// 「表示中の投稿」を eng.isSaved でフィルタ＝楽観解除で即消え、失敗ロールバック時は再表示される（保存状態が真の出所）。
export function XSavedList({
  me,
  loggedIn,
  posts,
  initialLikedIds,
  initialSavedIds,
  initialFolloweeIds,
  initialRepostedIds,
  initialRepostCounts,
}: {
  me: XProfile | null;
  loggedIn: boolean;
  posts: XPost[];
  initialLikedIds: string[];
  initialSavedIds: string[];
  initialFolloweeIds: string[];
  initialRepostedIds: string[];
  initialRepostCounts: Record<string, number>;
}) {
  const { toast, showToast } = useXToast();
  const [gateOpen, setGateOpen] = useState(false);

  const eng = useXEngagement({
    me,
    posts,
    initialLikedIds,
    initialFolloweeIds,
    initialSavedIds,
    initialRepostedIds,
    initialRepostCounts,
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });

  // 保存中の投稿だけ表示（解除＝isSaved=false で一覧から外れる。保存の新しい順は props の posts 順を維持）。
  const visible = useMemo(() => posts.filter((p) => eng.isSaved(p.id)), [posts, eng]);

  return (
    <div className="py-3">
      <Link
        href="/x"
        className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2"
      >
        ← もどる
      </Link>
      <h1 className="x-rescue-muted text-base font-black text-white drop-shadow-sm mb-3">保存した投稿</h1>

      {visible.length === 0 ? (
        <p className="x-rescue-muted text-sm text-white/90 text-center py-12 drop-shadow-sm">
          保存した投稿はまだありません。投稿のしおりアイコンから保存できます。
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const ls = eng.likeState(p);
            const rs = eng.repostState(p);
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
                reposted={rs.reposted}
                repostCount={rs.count}
                repostPending={eng.repostPendingFor(p.id)}
                onToggleRepost={eng.toggleRepost}
              />
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      <XAuthGateModal open={gateOpen} loggedIn={loggedIn} onClose={() => setGateOpen(false)} />
    </div>
  );
}
