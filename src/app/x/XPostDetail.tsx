'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getSession } from '@/lib/auth';
import { fetchShopMiniByIds } from './xAffiliation';
import { XPostCard } from './XPostCard';
import { XComposer } from './XComposer';
import { XAuthGateModal } from './XAuthGateModal';
import { useXEngagement } from './useXEngagement';
import type { XProfile, XKind } from './xProfile';
import type { XPost } from './xPosts';

const sb = createClient();

const PROFILE_COLS =
  'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url, is_verified, affiliated_shop_id';
const REPLY_COLS =
  'id, author_profile_id, body, images, like_count, reply_count, replies_disabled, created_at';

type ReplyRow = {
  id: string | number;
  author_profile_id: string;
  body: string | null;
  images: string[] | null;
  like_count: number | null;
  reply_count: number | null;
  replies_disabled: boolean | null;
  created_at: string;
};

// クライアントでリプライ行＋著者プロフィールを組み立てる（xPosts.ts はサーバー専用のため流用不可）。
// 1階層フラット：parent_post_id = 親ID の直下リプライのみを created_at 昇順で取得。
// BAN(status='rejected') の著者のリプライは除外（サーバー側 attachAuthors と同方針）。
async function fetchReplyThread(parentId: string): Promise<XPost[]> {
  const { data: rows } = await sb
    .from('x_posts')
    .select(REPLY_COLS)
    .eq('parent_post_id', parentId)
    .order('created_at', { ascending: true });
  const list = (rows ?? []) as ReplyRow[];
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
      kind: (p.kind as XKind) ?? 'user',
      avatar_url: (p.avatar_url as string | null) ?? null,
      status: (p.status as string) ?? 'approved',
      is_verified: Boolean(p.is_verified),
      affiliated_shop_id: (p.affiliated_shop_id as string | null) ?? null,
    })
  );

  const shopDict = await fetchShopMiniByIds(
    sb,
    [...dict.values()].map((a) => a.affiliated_shop_id)
  );

  const out: XPost[] = [];
  for (const r of list) {
    const a = dict.get(r.author_profile_id);
    if (!a || a.status === 'rejected') continue;
    const shop = a.affiliated_shop_id ? shopDict.get(a.affiliated_shop_id) : undefined;
    out.push({
      id: String(r.id),
      body: r.body ?? null,
      images: r.images ?? [],
      likeCount: r.like_count ?? 0,
      replyCount: r.reply_count ?? 0,
      repliesDisabled: Boolean(r.replies_disabled),
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

// 投稿詳細（スレッド）。親投稿はサーバー（ISR）取得済みを props で受け取り、
// 本人依存・動的なもの（自分の profile / リプライ一覧 / いいね・フォロー状態）はマウント時にクライアント取得する。
export function XPostDetail({ parent }: { parent: XPost }) {
  const [me, setMe] = useState<XProfile | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [replies, setReplies] = useState<XPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [replyCount, setReplyCount] = useState(parent.replyCount);

  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  const eng = useXEngagement({
    me,
    posts: [parent],
    initialLikedIds: [],
    initialFolloweeIds: [],
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });
  const { seedPosts, seedFollowees, registerPost } = eng;

  // マウント時：viewer → リプライ → いいね/フォロー状態 をまとめて取得し engagement に投入。
  useEffect(() => {
    let alive = true;
    (async () => {
      const session = await getSession();
      const uid = session?.user.id;
      let profile: XProfile | null = null;
      if (uid) {
        const { data } = await sb
          .from('x_profiles')
          .select(PROFILE_COLS)
          .eq('auth_user_id', uid)
          .maybeSingle();
        profile = (data as XProfile | null) ?? null;
      }
      if (!alive) return;
      setLoggedIn(!!uid);
      setMe(profile);

      const thread = await fetchReplyThread(parent.id);
      if (!alive) return;
      setReplies(thread);
      setReplyCount(thread.length);

      const allPosts = [parent, ...thread];
      let likedIds: string[] = [];
      if (profile) {
        const ids = allPosts.map((p) => p.id);
        const { data: likes } = await sb
          .from('x_likes')
          .select('post_id')
          .eq('profile_id', profile.id)
          .in('post_id', ids);
        likedIds = (likes ?? []).map((l) => String(l.post_id));

        const authorIds = [...new Set(allPosts.map((p) => p.author.id))];
        const { data: follows } = await sb
          .from('x_follows')
          .select('followee_profile_id')
          .eq('follower_profile_id', profile.id)
          .in('followee_profile_id', authorIds);
        if (alive) seedFollowees((follows ?? []).map((f) => String(f.followee_profile_id)));
      }
      if (!alive) return;
      seedPosts(allPosts, likedIds);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [parent, seedPosts, seedFollowees]);

  // リプライ送信成功：一覧末尾へ追加＋件数更新＋いいねマップ登録（reply_count はトリガが親側を増やす）。
  const onReplied = useCallback(
    (reply: XPost) => {
      setReplies((prev) => [...prev, reply]);
      setReplyCount((c) => c + 1);
      registerPost(reply);
      showToast('リプライしました');
    },
    [registerPost]
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

      {/* 親投稿 */}
      <XPostCard post={parent} showReplyLink={false} {...cardProps(parent)} />

      {/* リプライ作成 or 受付不可案内（白カード面＝両テーマで読める） */}
      <div className="x-card mt-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-4">
        <h2 className="text-sm font-black text-slate-800 mb-1">
          リプライ <span className="text-slate-400 tabular-nums font-bold">{replyCount}</span>
        </h2>
        {parent.repliesDisabled ? (
          <p className="text-[13px] text-slate-500 py-2 leading-relaxed">
            この投稿はリプライを受け付けていません。
          </p>
        ) : me ? (
          <XComposer me={me} parentPostId={parent.id} onPosted={onReplied} />
        ) : (
          <div className="py-2">
            <p className="text-[13px] text-slate-500 mb-3 leading-relaxed">
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
          <p className="x-rescue-muted text-sm text-white/90 text-center py-8 drop-shadow-sm">読み込み中...</p>
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
