'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import type { XProfile } from './xProfile';
import type { XPost, XPostAuthor } from './xPosts';

// fukuX のいいね／フォローの状態管理＋楽観更新を、タイムライン・プロフィールページで共有するフック。
// 権限判定（kind/status）も集約し、DB側RLSとUI出し分けを一致させる。
const supabase = createClient();

type LikeState = { liked: boolean; count: number };

export function useXEngagement(opts: {
  me: XProfile | null;
  posts: XPost[];
  initialLikedIds: string[];
  initialFolloweeIds: string[];
  onToast: (msg: string) => void;
}) {
  const { me, posts, initialLikedIds, initialFolloweeIds, onToast } = opts;

  // いいね状態（post_id → {liked,count}）。複数リストの投稿を1マップで管理。
  const [likes, setLikes] = useState<Record<string, LikeState>>(() => {
    const likedSet = new Set(initialLikedIds);
    const m: Record<string, LikeState> = {};
    posts.forEach((p) => {
      if (!m[p.id]) m[p.id] = { liked: likedSet.has(p.id), count: p.likeCount };
    });
    return m;
  });
  const [likePending, setLikePending] = useState<Set<string>>(new Set());

  // フォロー状態（followee profile id 集合）。
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set(initialFolloweeIds));
  const [followPending, setFollowPending] = useState<Set<string>>(new Set());

  // ── 権限（DB側RLSと一致） ──
  const approved = !!me && me.status === 'approved';
  const canPost = approved && (me!.kind === 'therapist' || me!.kind === 'shop');
  const canLike = approved;
  const canFollow = approved && (me!.kind === 'user' || me!.kind === 'shop');

  const likeState = useCallback(
    (post: XPost): LikeState => likes[post.id] ?? { liked: false, count: post.likeCount },
    [likes]
  );

  // 動的に増えた投稿（コンポーザ投稿）をいいねマップに登録。
  const registerPost = useCallback((post: XPost) => {
    setLikes((m) => (m[post.id] ? m : { ...m, [post.id]: { liked: false, count: post.likeCount } }));
  }, []);

  const isFollowing = useCallback((authorId: string) => followingSet.has(authorId), [followingSet]);

  // フォローボタンの表示可否：投稿主が therapist/shop かつ自分以外、かつ自分が therapist でない
  // （未ログイン・user/shop には出してクリックで誘導。therapist 閲覧者には出さない）。
  const showFollowFor = useCallback(
    (author: Pick<XPostAuthor, 'id' | 'kind'>): boolean => {
      const target = author.kind === 'therapist' || author.kind === 'shop';
      if (!target) return false;
      if (me && author.id === me.id) return false;
      if (me && me.kind === 'therapist') return false;
      return true;
    },
    [me]
  );

  // ── いいねトグル（楽観→失敗ロールバック） ──
  const toggleLike = useCallback(
    async (post: XPost) => {
      if (!me) {
        onToast('いいねするにはログインしてください');
        return;
      }
      if (!canLike) {
        onToast('アカウントが承認されるといいねできます');
        return;
      }
      if (likePending.has(post.id)) return;

      const prev = likes[post.id] ?? { liked: false, count: post.likeCount };
      const next: LikeState = { liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) };
      setLikes((m) => ({ ...m, [post.id]: next }));
      setLikePending((s) => new Set(s).add(post.id));

      const { error } = next.liked
        ? await supabase.from('x_likes').insert({ profile_id: me.id, post_id: post.id })
        : await supabase.from('x_likes').delete().eq('profile_id', me.id).eq('post_id', post.id);

      setLikePending((s) => {
        const n = new Set(s);
        n.delete(post.id);
        return n;
      });
      if (error) {
        setLikes((m) => ({ ...m, [post.id]: prev }));
        onToast('いいねに失敗しました');
      }
    },
    [me, canLike, likePending, likes, onToast]
  );

  // ── フォロートグル（楽観→失敗ロールバック） ──
  const toggleFollow = useCallback(
    async (authorId: string) => {
      if (!me) {
        onToast('フォローするにはログインしてください');
        return;
      }
      if (!canFollow) {
        onToast('このアカウントではフォローできません');
        return;
      }
      if (followPending.has(authorId)) return;

      const wasFollowing = followingSet.has(authorId);
      setFollowingSet((s) => {
        const n = new Set(s);
        if (wasFollowing) n.delete(authorId);
        else n.add(authorId);
        return n;
      });
      setFollowPending((s) => new Set(s).add(authorId));

      const { error } = wasFollowing
        ? await supabase
            .from('x_follows')
            .delete()
            .eq('follower_profile_id', me.id)
            .eq('followee_profile_id', authorId)
        : await supabase.from('x_follows').insert({ follower_profile_id: me.id, followee_profile_id: authorId });

      setFollowPending((s) => {
        const n = new Set(s);
        n.delete(authorId);
        return n;
      });
      if (error) {
        setFollowingSet((s) => {
          const n = new Set(s);
          if (wasFollowing) n.add(authorId);
          else n.delete(authorId);
          return n;
        });
        onToast('フォロー操作に失敗しました');
      }
    },
    [me, canFollow, followPending, followingSet, onToast]
  );

  return {
    approved,
    canPost,
    canLike,
    canFollow,
    likeState,
    isFollowing,
    showFollowFor,
    likePendingFor: (id: string) => likePending.has(id),
    followPendingFor: (id: string) => followPending.has(id),
    registerPost,
    toggleLike,
    toggleFollow,
  };
}
