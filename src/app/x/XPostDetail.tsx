'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchXReplyThread } from './xThreadActions'; // ★ 第986便: 読み込みはサーバー経由
import { getMyXPostStates } from './xReadActions';
import { XPostCard } from './XPostCard';
import { XComposer } from './XComposer';
import { XAuthGateModal } from './XAuthGateModal';
import { XListSkeleton } from './XSkeleton';
import { useXEngagement } from './useXEngagement';
import { useXToast } from './useXToast';
import { useMe } from './XMeProvider';
import type { XPost } from './xPosts';

// 投稿詳細（スレッド）。親投稿はサーバー（ISR）取得済みを props で受け取り、
// 本人依存・動的なもの（自分の profile / リプライ一覧 / いいね・フォロー状態）はマウント時にクライアント取得する。
export function XPostDetail({ parent }: { parent: XPost }) {
  const { me, userId, loading: meLoading } = useMe(); // 自分は共通Contextから（重複取得を排除）
  const loggedIn = !!userId;
  const [replies, setReplies] = useState<XPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const { toast, showToast } = useXToast();
  const [replyCount, setReplyCount] = useState(parent.replyCount);

  const eng = useXEngagement({
    me,
    posts: [parent],
    initialLikedIds: [],
    initialFolloweeIds: [],
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });
  const { seedPosts, seedFollowees, seedSaved, seedReposts, registerPost } = eng;

  // マウント時：リプライ取得 →（ログイン時）いいね/フォロー状態を投入。
  // 自分(me)は Context から即得られるので、リプライ取得を待ちなく開始できる（B：いいね/フォローは並列）。
  useEffect(() => {
    if (meLoading) return; // me 確定を待つ（未ログインと断定しない）
    let alive = true;
    (async () => {
      let thread: XPost[] = [];
      try { thread = await fetchXReplyThread(parent.id); } catch { /* 空で表示 */ }
      if (!alive) return;
      setReplies(thread);
      setReplyCount(thread.length);

      // ★ 第986便: リポスト・いいね・フォロー・保存の状態はサーバーでまとめて取る
      const allPosts = [parent, ...thread];
      let st: Awaited<ReturnType<typeof getMyXPostStates>> = { liked: [], followees: [], saved: [], reposts: [] };
      try {
        st = await getMyXPostStates(allPosts.map((p) => p.id), [...new Set(allPosts.map((p) => p.author.id))], !!me);
      } catch { /* 未いいね等で表示 */ }
      if (!alive) return;

      // 親投稿のリポスト件数＋自分のリポスト済み（リプライはリポスト対象外なので親のみ）。
      const rrows = st.reposts.filter((x) => String(x.post_id) === parent.id);
      if (alive) {
        seedReposts(
          { [parent.id]: rrows.length },
          me ? (rrows.some((x) => String(x.reposter_profile_id) === me.id) ? [parent.id] : []) : []
        );
      }

      let likedIds: string[] = [];
      if (me) {
        likedIds = st.liked;
        if (alive) {
          seedFollowees(st.followees);
          seedSaved(st.saved);
        }
      }
      if (!alive) return;
      seedPosts(allPosts, likedIds);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [parent, me, meLoading, seedPosts, seedFollowees, seedSaved, seedReposts]);

  // リプライ送信成功：一覧末尾へ追加＋件数更新＋いいねマップ登録（reply_count はトリガが親側を増やす）。
  const onReplied = useCallback(
    (reply: XPost) => {
      setReplies((prev) => [...prev, reply]);
      setReplyCount((c) => c + 1);
      registerPost(reply);
      showToast('リプライしました');
    },
    [registerPost, showToast]
  );

  const cardProps = (p: XPost) => {
    const ls = eng.likeState(p);
    return {
      liked: ls.liked,
      likeCount: ls.count,
      following: eng.isFollowing(p.author.id),
      showFollow: eng.showFollowFor(p.author),
      likePending: eng.likePendingFor(p.id),
      followPending: eng.followPendingFor(p.author.id),
      onToggleLike: eng.toggleLike,
      onToggleFollow: eng.toggleFollow,
      saved: eng.isSaved(p.id),
      savePending: eng.savePendingFor(p.id),
      onToggleSave: eng.toggleSave,
    };
  };

  return (
    <div className="py-3">
      {/* 戻る（濃い背景でも読めるよう白文字救済＝白テーマでは濃色に戻る） */}
      <Link
        href="/x"
        className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2"
      >
        ← もどる
      </Link>

      {/* 親投稿（トップレベル＝リポスト可能なのでリポストボタンも配線。ラベルは不要＝元投稿そのものの表示）。
          リプライはリポスト対象外のため cardProps のみでリポストボタンは出さない。 */}
      <XPostCard
        post={parent}
        showReplyLink={false}
        clampBody={false}
        {...cardProps(parent)}
        reposted={eng.repostState(parent).reposted}
        repostCount={eng.repostState(parent).count}
        repostPending={eng.repostPendingFor(parent.id)}
        onToggleRepost={eng.toggleRepost}
      />

      {/* リプライ作成 or 受付不可案内（白カード面＝両テーマで読める） */}
      <div className="x-card mt-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-4">
        <h2 className="text-sm font-black text-[color:var(--x-text-primary)] mb-1">
          リプライ <span className="text-[color:var(--x-text-muted)] tabular-nums font-bold">{replyCount}</span>
        </h2>
        {parent.repliesDisabled ? (
          <p className="text-[13px] text-[color:var(--x-text-secondary)] py-2 leading-relaxed">
            この投稿はリプライを受け付けていません。
          </p>
        ) : me ? (
          <XComposer me={me} parentPostId={parent.id} onPosted={onReplied} />
        ) : (
          <div className="py-2">
            <p className="text-[13px] text-[color:var(--x-text-secondary)] mb-3 leading-relaxed">
              リプライするにはアカウントが必要です。
            </p>
            <button
              type="button"
              onClick={() => setGateOpen(true)}
              className="px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              ログイン / 新規登録
            </button>
          </div>
        )}
      </div>

      {/* リプライ一覧（フラット・時系列） */}
      <div className="mt-3 space-y-3">
        {!loaded ? (
          <XListSkeleton rows={2} variant="post" />
        ) : replies.length === 0 ? (
          <p className="x-rescue-muted text-sm text-white/90 text-center py-8 drop-shadow-sm">
            まだリプライがありません
          </p>
        ) : (
          replies.map((r) => <XPostCard key={r.id} post={r} showReplyLink={false} {...cardProps(r)} />)
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
