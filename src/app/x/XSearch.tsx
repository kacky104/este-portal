'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { fetchShopMiniByIds } from './xAffiliation';
import { VerifiedBadge } from './VerifiedBadge';
import { XPostCard } from './XPostCard';
import { XAuthGateModal } from './XAuthGateModal';
import { useXEngagement } from './useXEngagement';
import { useMe } from './XMeProvider';
import type { XKind } from './xProfile';
import type { XPost } from './xPosts';

const sb = createClient();
const LIMIT = 50;

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店' };

const POST_COLS =
  'id, author_profile_id, body, images, like_count, reply_count, replies_disabled, link_url, edited_at, created_at';

// ilike のワイルドカード（% _ \）をエスケープし、入力を「部分一致の literal」として扱う。
// .or() は使わず handle / display_name を別々の .ilike() で引いてマージするため、
// カンマ・カッコ等で .or() フィルタ文字列が壊れる事故が起きない（パターンは値として渡る）。
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

type ProfRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  kind: 'user' | 'therapist' | 'shop';
  is_verified: boolean;
  status: string;
  affiliated_shop_id: string | null;
};

type Hit = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  kind: 'user' | 'therapist' | 'shop';
  isVerified: boolean;
  affiliatedShop: { handle: string; displayName: string } | null;
};

const SELECT = 'id, handle, display_name, avatar_url, kind, is_verified, status, affiliated_shop_id';

// handle / display_name を部分一致（ilike）で検索。BAN(status='rejected')は除外。
// 2クエリ（handle / 表示名）を投げて id でマージ・重複除去し、handle 昇順で返す。所属バッジも解決。
async function searchProfiles(raw: string): Promise<Hit[]> {
  const kw = raw.trim();
  if (!kw) return [];
  const pattern = `%${escapeLike(kw)}%`;

  const [byHandle, byName] = await Promise.all([
    sb.from('x_profiles').select(SELECT).ilike('handle', pattern).neq('status', 'rejected').limit(LIMIT),
    sb.from('x_profiles').select(SELECT).ilike('display_name', pattern).neq('status', 'rejected').limit(LIMIT),
  ]);

  const map = new Map<string, ProfRow>();
  [...((byHandle.data ?? []) as ProfRow[]), ...((byName.data ?? []) as ProfRow[])].forEach((r) => {
    if (!map.has(r.id)) map.set(r.id, r);
  });
  const rows = [...map.values()].sort((a, b) => a.handle.localeCompare(b.handle)).slice(0, LIMIT);

  // セラピストの所属先バッジを1クエリで解決（N+1回避）。
  const shopDict = await fetchShopMiniByIds(sb, rows.map((r) => r.affiliated_shop_id));

  return rows.map((r) => {
    const shop = r.affiliated_shop_id ? shopDict.get(r.affiliated_shop_id) : undefined;
    return {
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      kind: r.kind,
      isVerified: Boolean(r.is_verified),
      affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
    };
  });
}

type PostRow = {
  id: string | number;
  author_profile_id: string;
  body: string | null;
  images: string[] | null;
  like_count: number | null;
  reply_count: number | null;
  replies_disabled: boolean | null;
  link_url: string | null;
  edited_at: string | null;
  created_at: string;
};

// 投稿本文検索：x_posts.body を部分一致（ilike）。通常投稿のみ（parent_post_id IS NULL）・新しい順・上限。
// 著者を1クエリ合流し rejected(BAN) 著者の投稿は除外（既存 attachAuthors と同方針）。所属バッジも解決。
async function searchPosts(raw: string): Promise<XPost[]> {
  const kw = raw.trim();
  if (!kw) return [];
  const pattern = `%${escapeLike(kw)}%`;

  const { data: rows } = await sb
    .from('x_posts')
    .select(POST_COLS)
    .ilike('body', pattern)
    .is('parent_post_id', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  const list = (rows ?? []) as PostRow[];
  if (list.length === 0) return [];

  const authorIds = [...new Set(list.map((r) => r.author_profile_id).filter(Boolean))];
  const { data: profs } = await sb
    .from('x_profiles')
    .select('id, handle, display_name, kind, avatar_url, status, is_verified, affiliated_shop_id')
    .in('id', authorIds);

  const dict = new Map<
    string,
    {
      handle: string;
      display_name: string;
      kind: XKind;
      avatar_url: string | null;
      status: string;
      is_verified: boolean;
      affiliated_shop_id: string | null;
    }
  >();
  (profs ?? []).forEach((p) =>
    dict.set(p.id as string, {
      handle: (p.handle as string) ?? '',
      display_name: (p.display_name as string) ?? '',
      kind: ((p.kind as string) ?? 'user') as XKind,
      avatar_url: (p.avatar_url as string | null) ?? null,
      status: (p.status as string) ?? 'approved',
      is_verified: Boolean(p.is_verified),
      affiliated_shop_id: (p.affiliated_shop_id as string | null) ?? null,
    })
  );

  const shopDict = await fetchShopMiniByIds(sb, [...dict.values()].map((a) => a.affiliated_shop_id));

  const out: XPost[] = [];
  for (const r of list) {
    const a = dict.get(r.author_profile_id);
    if (!a || a.status === 'rejected') continue; // BAN 著者の投稿は除外
    const shop = a.affiliated_shop_id ? shopDict.get(a.affiliated_shop_id) : undefined;
    out.push({
      id: String(r.id),
      body: r.body ?? null,
      images: r.images ?? [],
      likeCount: r.like_count ?? 0,
      replyCount: r.reply_count ?? 0,
      repliesDisabled: Boolean(r.replies_disabled),
      linkUrl: r.link_url ?? null,
      editedAt: r.edited_at ?? null,
      createdAt: r.created_at,
      author: {
        id: r.author_profile_id,
        handle: a.handle,
        displayName: a.display_name,
        kind: a.kind,
        avatarUrl: a.avatar_url,
        isVerified: a.is_verified,
        affiliatedShop: shop ? { handle: shop.handle, displayName: shop.displayName } : null,
      },
    });
  }
  return out;
}

// ユーザー / 投稿 の検索（公開・要ログインなし）。入力はデバウンス（300ms）。空文字では検索しない。
// キーワードはタブ間で共有。投稿タブはいいね/フォロー操作のため engagement を持つ（未ログインは認証モーダル）。
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
  const [toast, setToast] = useState('');
  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

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
        const hits = await searchProfiles(kw);
        if (cancelled) return;
        setUserResults(hits);
      } else {
        const posts = await searchPosts(kw);
        if (cancelled) return;
        setPostResults(posts);
        // ログイン時は結果投稿のいいね/フォロー状態を seed（未ログインは未いいね・未フォロー表示）。
        if (me) {
          const ids = posts.map((p) => p.id);
          const authorIds = [...new Set(posts.map((p) => p.author.id))];
          const [likeRes, followRes, saveRes] = await Promise.all([
            sb.from('x_likes').select('post_id').eq('profile_id', me.id).in('post_id', ids),
            sb.from('x_follows').select('followee_profile_id').eq('follower_profile_id', me.id).in('followee_profile_id', authorIds),
            sb.from('x_post_saves').select('post_id').eq('profile_id', me.id).in('post_id', ids),
          ]);
          if (cancelled) return;
          seedFollowees((followRes.data ?? []).map((f) => String(f.followee_profile_id)));
          seedSaved((saveRes.data ?? []).map((s) => String(s.post_id)));
          seedPosts(posts, (likeRes.data ?? []).map((l) => String(l.post_id)));
        } else {
          seedPosts(posts, []);
        }

        // リポスト件数（公開）＋自分のリポスト済み（ログイン時）を seed。件数は全結果に 0 を敷いてから加算。
        const rIds = posts.map((p) => p.id);
        const { data: rr } = await sb.from('x_reposts').select('post_id, reposter_profile_id').in('post_id', rIds);
        if (cancelled) return;
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
      <div className="x-card rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3">
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 px-3 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:border-transparent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          {/* text-base(16px)：iOS Safari はフォーカス時 font-size<16px だと自動ズームするため 16px に固定 */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前や @ID で検索"
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
              className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* タブ（ユーザー / 投稿）。キーワードはタブ間で共有。 */}
      <div className="mt-3 flex gap-1 p-1 rounded-xl bg-slate-100">
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
              tab === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
            表示名・@ID・投稿本文（一部でOK）で検索できます
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
                  className="x-card flex items-center gap-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 hover:brightness-[0.98] transition"
                >
                  <span className="relative w-11 h-11 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold">{u.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 truncate max-w-[50%]">{u.displayName}</span>
                      {(u.kind === 'shop' || u.kind === 'therapist') && u.isVerified && <VerifiedBadge kind={u.kind} />}
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                        {KIND_LABEL[u.kind] ?? u.kind}
                      </span>
                      {u.affiliatedShop && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 truncate max-w-[45%]">
                          {u.affiliatedShop.displayName}所属
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">@{u.handle}</p>
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
