'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { searchXProfiles, searchXPosts, type Hit } from './xSearchActions'; // ★ 第986便: 検索はサーバー経由
import { getMyXPostStates } from './xReadActions';
import { VerifiedBadge } from './VerifiedBadge';
import { XPostCard } from './XPostCard';
import { XAuthGateModal } from './XAuthGateModal';
import { useXEngagement } from './useXEngagement';
import { useXToast } from './useXToast';
import { useMe } from './XMeProvider';
import type { XPost } from './xPosts';

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店', official: '運営' };

export function XSearch() {
  // URL クエリ ?q= / ?tab= で初期キーワード・初期タブを受け取る（#タグ タップからの遷移先）。
  const params = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const urlTab = params.get('tab') === 'posts' ? 'posts' : params.get('tab') === 'users' ? 'users' : null;

  const [tab, setTab] = useState<'users' | 'posts'>(urlTab ?? 'users');
  const [q, setQ] = useState(urlQ);
  const [userResults, setUserResults] = useState<Hit[]>([]);
  const [postResults, setPostResults] = useState<XPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const { me, userId } = useMe(); // 自分は共通Contextから（重複取得を排除）
  const loggedIn = !!userId;
  const [gateOpen, setGateOpen] = useState(false);
  const { toast, showToast } = useXToast();

  const eng = useXEngagement({
    me,
    posts: [],
    initialLikedIds: [],
    initialFolloweeIds: [],
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });
  const { seedPosts, seedFollowees, seedSaved, seedReposts } = eng;

  // URL クエリが変わったら（例：検索結果内の #タグ をタップ）キーワード・タブを同期する。
  useEffect(() => {
    if (urlQ) setQ(urlQ);
    if (urlTab) setTab(urlTab);
  }, [urlQ, urlTab]);

  // （自分の profile は共通Context から取得済み。投稿結果のいいね/フォロー seed にそのまま使う。）

  // キーワード or タブ変更で検索（デバウンス）。選択中タブのみ検索する。
  useEffect(() => {
    const kw = q.trim();
    if (!kw) {
      setUserResults([]);
      setPostResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      if (tab === 'users') {
        let hits: Hit[] = [];
        try { hits = await searchXProfiles(kw); } catch { /* 空で表示 */ }
        if (cancelled) return;
        setUserResults(hits);
      } else {
        let posts: XPost[] = [];
        try { posts = await searchXPosts(kw); } catch { /* 空で表示 */ }
        if (cancelled) return;
        setPostResults(posts);
        // ログイン時は結果投稿のいいね/フォロー状態を seed（未ログインは未いいね・未フォロー表示）。
        // ★ 第986便: いいね・フォロー・保存・リポストの状態はサーバーでまとめて取る
        const ids = posts.map((p) => p.id);
        const authorIds = [...new Set(posts.map((p) => p.author.id))];
        let st: Awaited<ReturnType<typeof getMyXPostStates>> = { liked: [], followees: [], saved: [], reposts: [] };
        try { st = await getMyXPostStates(ids, authorIds, !!me); } catch { /* 未いいね等で表示 */ }
        if (cancelled) return;
        if (me) {
          seedFollowees(st.followees);
          seedSaved(st.saved);
          seedPosts(posts, st.liked);
        } else {
          seedPosts(posts, []);
        }

        // リポスト件数（公開）＋自分のリポスト済み（ログイン時）を seed。件数は全結果に 0 を敷いてから加算。
        const rr = st.reposts;
        const rCounts: Record<string, number> = {};
        posts.forEach((p) => {
          rCounts[p.id] = 0;
        });
        const rReposted: string[] = [];
        (rr ?? []).forEach((x) => {
          const pid = String(x.post_id);
          rCounts[pid] = (rCounts[pid] ?? 0) + 1;
          if (me && String(x.reposter_profile_id) === me.id) rReposted.push(pid);
        });
        seedReposts(rCounts, rReposted);
      }
      if (!cancelled) {
        setLoading(false);
        setSearched(true);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, tab, me, seedPosts, seedFollowees, seedSaved, seedReposts]);

  const cardProps = (p: XPost) => {
    const ls = eng.likeState(p);
    const rs = eng.repostState(p);
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
      reposted: rs.reposted,
      repostCount: rs.count,
      repostPending: eng.repostPendingFor(p.id),
      onToggleRepost: eng.toggleRepost,
    };
  };

  return (
    <div className="py-3">
      <h1 className="x-rescue-muted text-lg font-black text-white drop-shadow-sm mb-3 px-1">検索</h1>

      {/* 入力欄（白カード面＝両テーマで読める） */}
      <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3">
        <div className="flex items-center rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] px-3 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:border-transparent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--x-text-muted)] flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          {/* text-base(16px)：iOS Safari はフォーカス時 font-size<16px だと自動ズームするため 16px に固定 */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前や @ID で検索"
            // 可視ラベルを置かないデザインなので aria-label で項目名を補う（placeholder はラベル代わりにならない）。
            aria-label="名前や @ID で検索"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 py-2.5 px-2 text-base bg-transparent focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="クリア"
              className="text-[color:var(--x-text-muted)] hover:text-[color:var(--x-text-primary)] text-lg leading-none px-1"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* タブ（ユーザー / 投稿）。キーワードはタブ間で共有。 */}
      <div className="mt-3 flex gap-1 p-1 rounded-xl bg-[color:var(--x-inset)]">
        {(
          [
            ['users', 'ユーザー'],
            ['posts', '投稿'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === key ? 'bg-[color:var(--x-surface)] text-[color:var(--x-accent)] shadow-sm' : 'text-[color:var(--x-text-secondary)] hover:text-[color:var(--x-text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 結果 */}
      <div className="mt-3">
        {!q.trim() ? (
          <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">
            アカウント名・@ID・投稿本文（一部でOK）で検索できます
          </p>
        ) : loading ? (
          <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">検索中...</p>
        ) : tab === 'users' ? (
          userResults.length === 0 && searched ? (
            <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">
              該当するユーザーが見つかりません
            </p>
          ) : (
            <div className="space-y-2">
              {userResults.map((u) => (
                <Link
                  key={u.id}
                  href={`/x/u/${u.handle}`}
                  className="x-card flex items-center gap-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 hover:brightness-[0.98] transition"
                >
                  <span className="relative w-11 h-11 rounded-full overflow-hidden border border-[color:var(--x-border)] bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold">{u.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-[color:var(--x-text-primary)] truncate max-w-[50%]">{u.displayName}</span>
                      {(u.kind === 'official' || ((u.kind === 'shop' || u.kind === 'therapist') && u.isVerified)) && <VerifiedBadge kind={u.kind} />}
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                        {KIND_LABEL[u.kind] ?? u.kind}
                      </span>
                      {u.affiliatedShop && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 truncate max-w-[45%]">
                          {u.affiliatedShop.displayName}所属
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[color:var(--x-text-muted)] truncate">@{u.handle}</p>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : postResults.length === 0 && searched ? (
          <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">
            該当する投稿が見つかりません
          </p>
        ) : (
          <div className="space-y-3">
            {postResults.map((p) => (
              <XPostCard key={p.id} post={p} {...cardProps(p)} />
            ))}
          </div>
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
