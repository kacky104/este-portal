'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { XProfile } from './xProfile';
import type { XPost, XPostAuthor, FeedItem } from './xPosts';
import type { ShopShowcase } from './xShops';
import { XComposeFab } from './XComposeFab';
import { XPostCard } from './XPostCard';
import { XBannerSlider } from './XBannerSlider';
import type { XBanner } from './xBanners';
import { XAuthGateModal } from './XAuthGateModal';
import { muteProfile, blockProfile, reportPost } from './xModerationActions';
import { adminSetXPostPinned } from '@/app/actions/xAdmin';
import { XFollowRows } from './XFollowRows';
import { VerifiedBadge } from './VerifiedBadge';
import { AutoFitName } from './AutoFitName';
import { useXEngagement } from './useXEngagement';
import { useXToast } from './useXToast';
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
  banners,
  initialHiddenProfileIds,
  isAdmin = false,
}: {
  me: XProfile | null;
  loggedIn: boolean;
  recommended: XPost[];
  shopShowcases: ShopShowcase[]; // お店タブ：承認済み全店（画像は認証×バナー設置で0/4/8枚に上限適用済み・サーバで30分シードシャッフル済み）
  followingFeed: FeedItem[]; // フォロー中タブ：投稿＋リポストをマージ済み（サーバで sortAt 降順・重複排除）
  initialLikedIds: string[];
  initialFolloweeIds: string[];
  initialSavedIds: string[];
  initialRepostedIds: string[];
  initialRepostCounts: Record<string, number>;
  // セラピスト本人のフォロワー一覧（2つ目タブを「フォロワー」に置き換えて表示）。それ以外は未使用。
  myFollowers?: FollowUser[];
  myAffiliatedShop?: { handle: string; displayName: string } | null;
  banners?: XBanner[]; // 運営設定のバナースライダー（全タブ共通・タブバー直下）。空なら非表示。
  initialHiddenProfileIds?: string[]; // 自分がミュート/ブロック中の相手（サーバー取得・タイムライン非表示用）
  isAdmin?: boolean; // 運営（ADMIN_UUID）のみ true。投稿カード「…」メニューに「TOPに固定」を出す
}) {
  const [tab, setTab] = useState<'recommended' | 'following' | 'shops'>('recommended');
  // バナースライダーのシャッフル：タブを切り替えるたびに並びをシャッフルし、key を変えて
  // スライダーを先頭から再スタートさせる。初期表示はサーバー順のまま（hydration mismatch 回避＝
  // Math.random はクリック時のみ）。
  const [shuffledBanners, setShuffledBanners] = useState<XBanner[] | null>(null);
  const [bannerShuffleKey, setBannerShuffleKey] = useState(0);
  const selectTab = (key: 'recommended' | 'following' | 'shops') => {
    setTab(key);
    if ((banners?.length ?? 0) > 1) {
      const arr = [...banners!];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      setShuffledBanners(arr);
      setBannerShuffleKey(k => k + 1);
    }
  };
  // セラピスト本人はフォローしない仕様＝「フォロー中」フィードが常に空。代わりに2つ目タブを
  // 「フォロワー（自分をフォローしている人の一覧）」に置き換える。user/shop/未ログインは従来どおり。
  const isTherapist = me?.kind === 'therapist';
  const followers = myFollowers ?? [];
  const { toast, showToast } = useXToast();
  const [myNewPosts, setMyNewPosts] = useState<XPost[]>([]);
  const [gateOpen, setGateOpen] = useState(false); // 未ログイン／未開設アクション時のモーダル
  // ミュート/ブロック中の相手（author profile id）。サーバー初期値＋この場の操作で追記し、全タブの表示から除外。
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set(initialHiddenProfileIds ?? []));
  const hideAuthor = (id: string) => setHiddenIds((s) => { const n = new Set(s); n.add(id); return n; });

  // ── 「…」ドロワーのモデレーション操作（未ログイン/未開設はアカウント作成モーダルへ） ──
  const handleMute = async (author: XPostAuthor) => {
    if (!me) { setGateOpen(true); return; }
    const res = await muteProfile(author.id);
    if (!res.ok) { showToast(res.error); return; }
    hideAuthor(author.id);
    showToast(`@${author.handle} をミュートしました`);
  };
  const handleBlock = async (author: XPostAuthor) => {
    if (!me) { setGateOpen(true); return; }
    if (!window.confirm(`@${author.handle} をブロックしますか？\n相手の投稿が表示されなくなり、相互のフォローも解除されます。`)) return;
    const res = await blockProfile(author.id);
    if (!res.ok) { showToast(res.error); return; }
    hideAuthor(author.id);
    showToast(`@${author.handle} をブロックしました`);
  };
  const handleReport = async (post: XPost, reason: string) => {
    if (!me) { setGateOpen(true); return; }
    const res = await reportPost({ targetProfileId: post.author.id, postId: post.id, reason });
    showToast(res.ok ? '通報を受け付けました。ご協力ありがとうございます' : res.error);
  };

  // タイムライン固定（運営のみ）。固定/解除 → force-dynamic ページを router.refresh() で再取得し、
  // おすすめ最上部の固定枠（pinned prop）に反映する。
  const router = useRouter();
  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const handleTogglePin = async (post: XPost, pin: boolean) => {
    const res = await adminSetXPostPinned(post.id, pin);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    showToast(pin ? 'TOPに固定しました' : '固定を解除しました');
    router.refresh();
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
    return [...myNewPosts, ...recommended]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .filter((p) => !hiddenIds.has(p.author.id)); // ミュート/ブロック中の相手を除外
  }, [myNewPosts, recommended, hiddenIds]);

  // フォロー中フィード・お店タブもミュート/ブロック中の相手を除外。
  const followingFeedView = useMemo(
    () => followingFeed.filter((f) => !hiddenIds.has(f.post.author.id)),
    [followingFeed, hiddenIds],
  );
  const shopShowcasesView = useMemo(
    () => shopShowcases.filter((sc) => !hiddenIds.has(sc.id)),
    [shopShowcases, hiddenIds],
  );

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
        moderation={{ onMute: handleMute, onBlock: handleBlock, onReport: handleReport }}
        pinControl={isAdmin ? { pinned: pinnedIds.has(p.id), onToggle: handleTogglePin } : undefined}
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
              onClick={() => selectTab(key)}
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

      {/* 運営バナースライダー（全タブ共通・タブバー直下）。未設定なら出さない。
          タブ切替のたびにシャッフルした並びで先頭から再スタート（key で再マウント）。 */}
      {(banners?.length ?? 0) > 0 && <XBannerSlider key={bannerShuffleKey} banners={shuffledBanners ?? banners!} />}

      {/* タブ中身 */}
      {tab === 'recommended' ? (
        recommendedView.length === 0 ? (
          <Empty text="まだ投稿がありません" />
        ) : (
          // X風の全幅行＋区切り線（2026-07-10 実機評価で本採用）。タイムラインのみこの方式で、
          // プロフィール・投稿詳細・検索などは従来の浮遊カードのまま。
          <div className="-mx-4 divide-y divide-[color:var(--x-border)] border-b border-[color:var(--x-border)]">
            {renderList(recommendedView)}
          </div>
        )
      ) : tab === 'shops' ? (
        // お店タブ：お店カード（店名＋アバター＋画像グリッド）の一覧。カード全体タップでプロフィールへ。
        // ※全幅グリッド方式を試験（2026-07-10）→実機評価でカード型（A方式）継続に確定し差し戻し済み。
        shopShowcasesView.length === 0 ? (
          <Empty text="表示できるお店がまだありません" />
        ) : (
          <div className="space-y-3 pt-3">
            {shopShowcasesView.map((s) => (
              <Link
                key={s.id}
                href={`/x/u/${encodeURIComponent(s.handle)}`}
                className="block rounded-2xl bg-[color:var(--x-surface)] shadow-sm border border-[color:var(--x-border)] p-2.5 hover:shadow-md transition-shadow"
              >
                {/* 店名は1行自動縮小フィット（AutoFitShopName）・@ID は非表示（2026-07-10 変更）。バッジは縮めない。 */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-8 h-8 rounded-full overflow-hidden border border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-sm">{s.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <AutoFitName
                    name={s.displayName}
                    max={16}
                    min={11}
                    textClassName="font-bold text-[color:var(--x-text-primary)]"
                    after={
                      s.isVerified ? (
                        <span className="flex-shrink-0">
                          <VerifiedBadge kind="shop" />
                        </span>
                      ) : undefined
                    }
                  />
                </div>
                {/* 地域（x_profiles.address）。空なら行ごと非表示。 */}
                {s.address && (
                  <p className="text-xs text-[color:var(--x-text-secondary)] mb-3 flex items-center gap-1">📍{s.address}</p>
                )}
                {/* 余白削減方式: カードの白フチ（p-2.5=10px）を細く残しつつ、隙間は最小限（gap-0.5=2px）。
                    画像0枚（未認証店など）はグリッドごと出さず、名前＋地域だけのコンパクトなカードになる。 */}
                {s.images.length > 0 && (
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
                )}
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
      ) : followingFeedView.length === 0 ? (
        <Empty text="気になるセラピスト・お店をフォローすると、ここに新着が表示されます" />
      ) : (
        // おすすめタブと同じ全幅行方式（本採用）。
        <div className="-mx-4 divide-y divide-[color:var(--x-border)] border-b border-[color:var(--x-border)]">
          {renderFeed(followingFeedView)}
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
