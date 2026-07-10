'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { XProfile } from './xProfile';
import type { XPost, FeedItem } from './xPosts';
import type { ShopShowcase } from './xShops';
import { XComposeFab } from './XComposeFab';
import { XPostCard } from './XPostCard';
import { XAuthGateModal } from './XAuthGateModal';
import { XFollowRows } from './XFollowRows';
import { VerifiedBadge } from './VerifiedBadge';
import { useXEngagement } from './useXEngagement';
import type { FollowUser } from './xFollows';

export function XTimeline({
  me,
  loggedIn,
  recommended,
  shopShowcases,
  followingFeed,
  initialLikedIds,
  initialFolloweeIds,
  initialSavedIds,
  initialRepostedIds,
  initialRepostCounts,
  myFollowers,
  myAffiliatedShop,
}: {
  me: XProfile | null;
  loggedIn: boolean;
  recommended: XPost[];
  shopShowcases: ShopShowcase[]; // お店タブ：承認済み・画像1枚以上のお店（サーバで30分シードシャッフル済み）
  followingFeed: FeedItem[]; // フォロー中タブ：投稿＋リポストをマージ済み（サーバで sortAt 降順・重複排除）
  initialLikedIds: string[];
  initialFolloweeIds: string[];
  initialSavedIds: string[];
  initialRepostedIds: string[];
  initialRepostCounts: Record<string, number>;
  // セラピスト本人のフォロワー一覧（2つ目タブを「フォロワー」に置き換えて表示）。それ以外は未使用。
  myFollowers?: FollowUser[];
  myAffiliatedShop?: { handle: string; displayName: string } | null;
}) {
  const [tab, setTab] = useState<'recommended' | 'following' | 'shops'>('recommended');
  // セラピスト本人はフォローしない仕様＝「フォロー中」フィードが常に空。代わりに2つ目タブを
  // 「フォロワー（自分をフォローしている人の一覧）」に置き換える。user/shop/未ログインは従来どおり。
  const isTherapist = me?.kind === 'therapist';
  const followers = myFollowers ?? [];
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
    posts: useMemo(
      () => [...recommended, ...followingFeed.map((f) => f.post)],
      [recommended, followingFeed]
    ),
    initialLikedIds,
    initialFolloweeIds,
    initialSavedIds,
    initialRepostedIds,
    initialRepostCounts,
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

  // 1枚のカードを描画（repostLabel を渡せばカード上部にリポストラベルが出る）。
  const renderCard = (p: XPost, repostLabel?: string) => {
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
        repostLabel={repostLabel}
        flat
      />
    );
  };

  // おすすめ（通常投稿のみ・リポスト無し）。
  const renderList = (list: XPost[]) => list.map((p) => renderCard(p));

  // フォロー中（投稿＋リポスト）。リポストは「◯◯ さんがリポスト」ラベル付き。
  const renderFeed = (list: FeedItem[]) =>
    list.map((it) => renderCard(it.post, it.kind === 'repost' ? `${it.reposterName} さんがリポスト` : undefined));

  return (
    <div className="py-2">
      {/* タブ */}
      <div className="sticky top-14 z-30 -mx-4 px-4 bg-[color:var(--x-surface-translucent)] backdrop-blur-md border-b border-[color:var(--x-border-strong)]">
        <div className="flex">
          {([['recommended', 'おすすめ'], ['following', isTherapist ? 'フォロワー' : 'フォロー中'], ['shops', 'お店']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-sm font-bold transition-colors relative ${
                tab === key ? 'text-[color:var(--x-accent)]' : 'text-[color:var(--x-text-muted)] hover:text-[color:var(--x-text-secondary)]'
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
          // 【試験実装 2026-07-10】X風の全幅行＋区切り線（タイムラインのみ）。戻す場合は
          // space-y-3 pt-3 のカード並び＋ renderCard の flat を外す。
          <div className="-mx-4 divide-y divide-[color:var(--x-border)] border-b border-[color:var(--x-border)]">
            {renderList(recommendedView)}
          </div>
        )
      ) : tab === 'shops' ? (
        // お店タブ：お店カード（店名＋アバター＋画像グリッド）の一覧。カード全体タップでプロフィールへ。
        // ※全幅グリッド方式を試験（2026-07-10）→実機評価でカード型（A方式）継続に確定し差し戻し済み。
        shopShowcases.length === 0 ? (
          <Empty text="表示できるお店がまだありません" />
        ) : (
          <div className="space-y-3 pt-3">
            {shopShowcases.map((s) => (
              <Link
                key={s.id}
                href={`/x/u/${encodeURIComponent(s.handle)}`}
                className="block rounded-2xl bg-[color:var(--x-surface)] shadow-sm border border-[color:var(--x-border)] p-2.5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-8 h-8 rounded-full overflow-hidden border border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-sm">{s.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <span className="font-bold text-[color:var(--x-text-primary)]">{s.displayName}</span>
                  {s.isVerified && <VerifiedBadge kind="shop" />}
                  <span className="text-xs text-[color:var(--x-text-muted)]">@{s.handle}</span>
                </div>
                {/* 地域（x_profiles.address）。空なら行ごと非表示。 */}
                {s.address && (
                  <p className="text-xs text-[color:var(--x-text-secondary)] mb-3 flex items-center gap-1">📍{s.address}</p>
                )}
                {/* 余白削減方式: カードの白フチ（p-2.5=10px）を細く残しつつ、隙間は最小限（gap-0.5=2px）。 */}
                <div className="grid grid-cols-4 gap-0.5">
                  {s.images.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`${s.displayName}-${i + 1}`}
                      className="aspect-square w-full object-cover rounded-sm"
                      loading="lazy"
                    />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )
      ) : isTherapist ? (
        // セラピスト：2つ目タブ＝自分のフォロワー一覧（人リスト）。フォローされた新しい順。
        <div className="pt-3">
          <p className="x-rescue-muted text-sm font-bold text-white/90 drop-shadow-sm mb-2 px-1">
            {followers.length}人のフォロワー
          </p>
          <XFollowRows users={followers} emptyText="まだフォロワーがいません" />
        </div>
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
      ) : followingFeed.length === 0 ? (
        <Empty text="気になるセラピスト・お店をフォローすると、ここに新着が表示されます" />
      ) : (
        // 【試験実装 2026-07-10】おすすめタブと同じ全幅行方式。
        <div className="-mx-4 divide-y divide-[color:var(--x-border)] border-b border-[color:var(--x-border)]">
          {renderFeed(followingFeed)}
        </div>
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
