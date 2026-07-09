'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { toggleRepost as toggleRepostAction } from './xRepostActions';
import type { XProfile } from './xProfile';
import type { XPost, XPostAuthor } from './xPosts';

// fukuX のいいね／フォロー／リポストの状態管理＋楽観更新を、タイムライン・プロフィールページで共有するフック。
// 権限判定（kind/status）も集約し、DB側RLSとUI出し分けを一致させる。
const supabase = createClient();

type LikeState = { liked: boolean; count: number };
type RepostState = { reposted: boolean; count: number };

export function useXEngagement(opts: {
  me: XProfile | null;
  posts: XPost[];
  initialLikedIds: string[];
  initialFolloweeIds: string[];
  initialSavedIds?: string[]; // 自分が保存済みの post_id（保存ボタンの初期塗り用・まとめ取り）
  initialRepostedIds?: string[]; // 自分がリポスト済みの post_id（リポストボタンの初期塗り用・まとめ取り）
  initialRepostCounts?: Record<string, number>; // post_id → リポスト件数（まとめ取り）
  onToast: (msg: string) => void;
  // 未ログイン／未開設（me が無い）でアクションしたときに呼ぶ。親がアカウント作成モーダルを開く。
  onAuthRequired?: () => void;
}) {
  const {
    me,
    posts,
    initialLikedIds,
    initialFolloweeIds,
    initialSavedIds,
    initialRepostedIds,
    initialRepostCounts,
    onToast,
    onAuthRequired,
  } = opts;

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

  // リポスト状態（post_id → {reposted,count}）。いいねと同じ持ち方。件数は初期マップ（まとめ取り）由来。
  const [reposts, setReposts] = useState<Record<string, RepostState>>(() => {
    const repostedSet = new Set(initialRepostedIds ?? []);
    const m: Record<string, RepostState> = {};
    posts.forEach((p) => {
      if (!m[p.id]) m[p.id] = { reposted: repostedSet.has(p.id), count: initialRepostCounts?.[p.id] ?? 0 };
    });
    return m;
  });
  const [repostPending, setRepostPending] = useState<Set<string>>(new Set());

  // フォロー状態（followee profile id 集合）。
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set(initialFolloweeIds));
  const [followPending, setFollowPending] = useState<Set<string>>(new Set());

  // 保存（ブックマーク）状態（保存済み post_id 集合）。保存は完全プライベート（RLSで自分のみ）。
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set(initialSavedIds ?? []));
  const [savePending, setSavePending] = useState<Set<string>>(new Set());

  // ── 権限（DB側 x_me_can_act() と一致：BAN(status='rejected')でなければ可） ──
  const notBanned = !!me && me.status !== 'rejected';
  const canPost = notBanned && (me!.kind === 'therapist' || me!.kind === 'shop' || me!.kind === 'official');
  const canLike = notBanned;
  const canFollow = notBanned && (me!.kind === 'user' || me!.kind === 'shop');
  const canSave = notBanned; // 保存はいいねと同様に（凍結でなければ）誰でも可

  const likeState = useCallback(
    (post: XPost): LikeState => likes[post.id] ?? { liked: false, count: post.likeCount },
    [likes]
  );

  const repostState = useCallback(
    (post: XPost): RepostState => reposts[post.id] ?? { reposted: false, count: initialRepostCounts?.[post.id] ?? 0 },
    [reposts, initialRepostCounts]
  );

  // 動的に増えた投稿（コンポーザ投稿）をいいね／リポストのマップに登録（初期値は未いいね・未リポスト・件数0）。
  const registerPost = useCallback((post: XPost) => {
    setLikes((m) => (m[post.id] ? m : { ...m, [post.id]: { liked: false, count: post.likeCount } }));
    setReposts((m) => (m[post.id] ? m : { ...m, [post.id]: { reposted: false, count: 0 } }));
  }, []);

  // マウント後に取得した投稿群（投稿詳細ページの親＋リプライ）をまとめて初期投入する。
  // likedIds に含まれる id は liked=true で投入。初期ロード用途のため対象 id は上書きする。
  const seedPosts = useCallback((newPosts: XPost[], likedIds: string[] = []) => {
    const likedSet = new Set(likedIds);
    setLikes((m) => {
      const next = { ...m };
      newPosts.forEach((p) => {
        next[p.id] = { liked: likedSet.has(p.id), count: p.likeCount };
      });
      return next;
    });
  }, []);

  // マウント後に取得した「フォロー中の followee id」をまとめて投入（詳細ページの著者フォロー状態反映用）。
  const seedFollowees = useCallback((ids: string[]) => {
    setFollowingSet((s) => {
      const n = new Set(s);
      ids.forEach((id) => n.add(id));
      return n;
    });
  }, []);

  // マウント後に取得した「保存済み post_id」をまとめて投入（検索・詳細などクライアント取得分の保存状態反映用）。
  const seedSaved = useCallback((ids: string[]) => {
    setSavedSet((s) => {
      const n = new Set(s);
      ids.forEach((id) => n.add(id));
      return n;
    });
  }, []);

  // マウント後に取得した「リポスト件数＋自分のリポスト済み」を投入（投稿詳細などクライアント取得分の反映用）。
  // counts の各 post_id を上書き。repostedIds に含まれれば reposted=true。
  const seedReposts = useCallback((counts: Record<string, number>, repostedIds: string[]) => {
    const repostedSet = new Set(repostedIds);
    setReposts((m) => {
      const next = { ...m };
      Object.keys(counts).forEach((pid) => {
        next[pid] = { reposted: repostedSet.has(pid), count: counts[pid] };
      });
      return next;
    });
  }, []);

  const isFollowing = useCallback((authorId: string) => followingSet.has(authorId), [followingSet]);
  const isSaved = useCallback((postId: string) => savedSet.has(postId), [savedSet]);

  // フォローボタンの表示可否：投稿主が therapist/shop かつ自分以外、かつ自分が therapist でない
  // （未ログイン・user/shop には出してクリックで誘導。therapist 閲覧者には出さない）。
  const showFollowFor = useCallback(
    (author: Pick<XPostAuthor, 'id' | 'kind'>): boolean => {
      const target = author.kind === 'therapist' || author.kind === 'shop' || author.kind === 'official';
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
        onAuthRequired?.(); // 未ログイン／未開設 → アカウント作成モーダル
        return;
      }
      if (!canLike) {
        onToast('このアカウントはご利用が制限されています');
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
    [me, canLike, likePending, likes, onToast, onAuthRequired]
  );

  // ── リポストトグル（いいねと同じ作法：楽観→失敗ロールバック。挿入/削除は server action 経由） ──
  const toggleRepost = useCallback(
    async (post: XPost) => {
      if (!me) {
        onAuthRequired?.(); // 未ログイン／未開設 → いいねと同じくアカウント作成モーダル
        return;
      }
      if (!canLike) {
        // いいねと同じ権限（凍結でなければ可・全種別）。
        onToast('このアカウントはご利用が制限されています');
        return;
      }
      if (post.author.id === me.id) return; // self ガード（UIでも非表示だが二重防御）
      if (repostPending.has(post.id)) return;

      const prev = reposts[post.id] ?? { reposted: false, count: 0 };
      const next: RepostState = { reposted: !prev.reposted, count: prev.count + (prev.reposted ? -1 : 1) };
      setReposts((m) => ({ ...m, [post.id]: next }));
      setRepostPending((s) => new Set(s).add(post.id));

      const res = await toggleRepostAction(Number(post.id), next.reposted);

      setRepostPending((s) => {
        const n = new Set(s);
        n.delete(post.id);
        return n;
      });
      if (!res.ok) {
        setReposts((m) => ({ ...m, [post.id]: prev }));
        onToast(res.error);
      }
    },
    [me, canLike, repostPending, reposts, onToast, onAuthRequired]
  );

  // ── フォロートグル（楽観→失敗ロールバック） ──
  const toggleFollow = useCallback(
    async (authorId: string) => {
      if (!me) {
        onAuthRequired?.(); // 未ログイン／未開設 → アカウント作成モーダル
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
    [me, canFollow, followPending, followingSet, onToast, onAuthRequired]
  );

  // ── 保存トグル（楽観→失敗ロールバック）。x_post_saves(profile_id, post_id)。RLSで自分のみ。 ──
  const toggleSave = useCallback(
    async (post: XPost) => {
      if (!me) {
        onAuthRequired?.(); // 未ログイン／未開設 → アカウント作成モーダル
        return;
      }
      if (!canSave) {
        onToast('このアカウントでは保存できません');
        return;
      }
      if (savePending.has(post.id)) return;

      const wasSaved = savedSet.has(post.id);
      setSavedSet((s) => {
        const n = new Set(s);
        if (wasSaved) n.delete(post.id);
        else n.add(post.id);
        return n;
      });
      setSavePending((s) => new Set(s).add(post.id));

      const { error } = wasSaved
        ? await supabase.from('x_post_saves').delete().eq('profile_id', me.id).eq('post_id', post.id)
        : await supabase.from('x_post_saves').insert({ profile_id: me.id, post_id: post.id });

      setSavePending((s) => {
        const n = new Set(s);
        n.delete(post.id);
        return n;
      });
      if (error) {
        setSavedSet((s) => {
          const n = new Set(s);
          if (wasSaved) n.add(post.id);
          else n.delete(post.id);
          return n;
        });
        onToast(wasSaved ? '保存の解除に失敗しました' : '保存に失敗しました');
      }
    },
    [me, canSave, savePending, savedSet, onToast, onAuthRequired]
  );

  return {
    notBanned,
    canPost,
    canLike,
    canFollow,
    canSave,
    likeState,
    repostState,
    isFollowing,
    isSaved,
    showFollowFor,
    likePendingFor: (id: string) => likePending.has(id),
    repostPendingFor: (id: string) => repostPending.has(id),
    followPendingFor: (id: string) => followPending.has(id),
    savePendingFor: (id: string) => savePending.has(id),
    registerPost,
    seedPosts,
    seedFollowees,
    seedSaved,
    seedReposts,
    toggleLike,
    toggleRepost,
    toggleFollow,
    toggleSave,
  };
}
