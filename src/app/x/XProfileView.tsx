'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import type { ShopMini, TherapistMini } from './xAffiliation';
import { XPostCard } from './XPostCard';
import { VerifiedBadge } from './VerifiedBadge';
import { XAuthGateModal } from './XAuthGateModal';
import { XImageLightbox } from './XImageLightbox';
import { XComposeFab } from './XComposeFab';
import { XMessageButton } from './XMessageButton';
import { safeHref, linkDomain } from './xLink';
import { useXEngagement } from './useXEngagement';

const KIND_LABEL: Record<string, string> = {
  user: 'ユーザー',
  therapist: 'セラピスト',
  shop: 'お店',
};

export function XProfileView({
  target,
  viewerProfile,
  loggedIn,
  isOwnProfile,
  followerCount,
  followingCount,
  posts,
  initialLikedIds,
  initialSavedIds,
  initialFollowing,
  affiliatedShop,
  affiliatedTherapists,
}: {
  target: XProfile;
  viewerProfile: XProfile | null;
  loggedIn: boolean;
  isOwnProfile: boolean;
  followerCount: number | null;
  followingCount: number | null;
  posts: XPost[];
  initialLikedIds: string[];
  initialSavedIds: string[];
  initialFollowing: boolean;
  affiliatedShop: ShopMini | null; // target が therapist のとき所属先（無ければ null）
  affiliatedTherapists: TherapistMini[]; // target が shop のとき所属セラピスト一覧
}) {
  const [toast, setToast] = useState('');
  const [gateOpen, setGateOpen] = useState(false); // 未ログイン／未開設アクション時のモーダル
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null); // avatar/header の全体表示
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  // いいね／フォローは共通フックで（タイムラインと同一ロジック）。
  const eng = useXEngagement({
    me: viewerProfile,
    posts,
    initialLikedIds,
    initialFolloweeIds: initialFollowing ? [target.id] : [],
    initialSavedIds,
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });

  const showFollowBtn = eng.showFollowFor(target); // target が therapist/shop・自分以外・自分が therapist でない
  const following = eng.isFollowing(target.id);
  const followPending = eng.followPendingFor(target.id);

  return (
    <div>
      {/* ─── ヘッダー（浮遊カード） ─── */}
      <div className="x-card mt-3 rounded-2xl overflow-hidden bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
        {/* バナー（header_url があればタップで全体表示） */}
        <div className="h-28 bg-gradient-to-br from-indigo-100 to-sky-100 relative">
          {target.header_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={target.header_url}
              alt=""
              onClick={() => setLightboxSrc(target.header_url)}
              className="w-full h-full object-cover cursor-pointer"
            />
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-end justify-between -mt-9">
            <span className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center">
              {target.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={target.avatar_url}
                  alt={target.display_name}
                  onClick={() => setLightboxSrc(target.avatar_url)}
                  className="w-full h-full object-cover cursor-pointer"
                />
              ) : (
                <span className="text-white font-bold text-2xl">{target.display_name.charAt(0) || '?'}</span>
              )}
            </span>

            <div className="mb-1 flex items-center gap-2">
              {isOwnProfile ? (
                <Link
                  href="/x/settings"
                  className="inline-block text-xs font-bold px-4 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  プロフィール編集
                </Link>
              ) : (
                <>
                  {/* メッセージ（フォロー関係が1本でもあるときのみ表示・条件は内部で判定） */}
                  <XMessageButton viewerProfile={viewerProfile} target={target} isOwnProfile={isOwnProfile} />
                  {showFollowBtn && (
                    // 未ログイン／未開設でも表示し、押下時に toggleFollow → onAuthRequired でモーダルを開く。
                    <button
                      type="button"
                      onClick={() => eng.toggleFollow(target.id)}
                      disabled={followPending}
                      className={`text-sm font-bold px-5 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
                        following
                          ? 'border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500'
                          : 'text-white'
                      }`}
                      style={following ? undefined : { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                    >
                      {following ? 'フォロー中' : 'フォロー'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 名前・kind・所属（同じ行に横並び。狭幅は折り返し） */}
          <div className="mt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 truncate max-w-full">{target.display_name}</h1>
              {(target.kind === 'shop' || target.kind === 'therapist') && target.is_verified && (
                <VerifiedBadge size={18} kind={target.kind} />
              )}
              <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5 flex-shrink-0">
                {KIND_LABEL[target.kind] ?? target.kind}
              </span>
              {/* 所属バッジ（therapist の確定所属先。種別バッジの右隣・店舗プロフィールへリンク） */}
              {target.kind === 'therapist' && affiliatedShop && (
                <Link
                  href={`/x/u/${affiliatedShop.handle}`}
                  className="inline-flex items-center gap-1 max-w-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full pl-1 pr-2.5 py-1 hover:bg-emerald-100 transition-colors"
                >
                  <span className="relative w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-emerald-300 to-teal-300 flex items-center justify-center flex-shrink-0">
                    {affiliatedShop.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={affiliatedShop.avatarUrl} alt={affiliatedShop.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-[10px] font-bold">{affiliatedShop.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <span className="truncate">{affiliatedShop.displayName}所属</span>
                </Link>
              )}
            </div>
            <p className="text-sm text-slate-400">@{target.handle}</p>

            {target.bio && <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words mt-2">{target.bio}</p>}

            {/* リンク（任意・http/https のみ）。ドメイン名を新タブで開く。 */}
            {safeHref(target.link_url) && (
              <a
                href={safeHref(target.link_url)!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 max-w-full text-sm font-medium text-indigo-600 hover:underline"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span className="truncate">{linkDomain(target.link_url!)}</span>
              </a>
            )}

            {/* 数値（kind が持ち得る数だけ表示）。タップでフォロー中／フォロワー一覧へ。 */}
            <div className="flex items-center gap-4 mt-3 text-sm">
              {followingCount !== null && (
                <Link href={`/x/u/${target.handle}/following`} className="text-slate-500 hover:underline">
                  <strong className="text-slate-900 tabular-nums">{followingCount}</strong> フォロー中
                </Link>
              )}
              {followerCount !== null && (
                <Link href={`/x/u/${target.handle}/followers`} className="text-slate-500 hover:underline">
                  <strong className="text-slate-900 tabular-nums">{followerCount}</strong> フォロワー
                </Link>
              )}
            </div>

            {/* 本人向け：BAN(凍結)時の注記 */}
            {isOwnProfile && target.status === 'rejected' && (
              <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-[12px] leading-relaxed">
                このアカウントは運営により凍結されています。投稿・フォローはできず、プロフィールは他のユーザーに表示されません。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 所属セラピスト一覧（店舗プロフィールのみ・浮遊カード） ─── */}
      {target.kind === 'shop' && (
        <div className="x-card mt-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-4">
          <h2 className="text-sm font-black text-slate-800 mb-2">
            所属セラピスト
            {affiliatedTherapists.length > 0 && (
              <span className="ml-1.5 text-xs font-bold text-slate-400 tabular-nums">{affiliatedTherapists.length}</span>
            )}
          </h2>
          {affiliatedTherapists.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">所属セラピストはまだいません</p>
          ) : (
            <div className="space-y-1">
              {affiliatedTherapists.map((th) => (
                <Link
                  key={th.id}
                  href={`/x/u/${th.handle}`}
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <span className="relative w-9 h-9 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {th.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={th.avatarUrl} alt={th.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-xs font-bold">{th.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{th.displayName}</p>
                    <p className="text-xs text-slate-400 truncate">@{th.handle}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 投稿一覧（各カードが浮遊） ─── */}
      <div className="mt-3 space-y-3">
        {posts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="x-rescue-muted text-sm text-white/90 drop-shadow-sm">まだ投稿がありません</p>
          </div>
        ) : (
          posts.map((p) => {
            const ls = eng.likeState(p);
            return (
              <XPostCard
                key={p.id}
                post={p}
                liked={ls.liked}
                likeCount={ls.count}
                following={following}
                showFollow={false} /* プロフィール上部にフォローボタンがあるため各投稿では出さない */
                likePending={eng.likePendingFor(p.id)}
                followPending={followPending}
                onToggleLike={eng.toggleLike}
                onToggleFollow={eng.toggleFollow}
                saved={eng.isSaved(p.id)}
                savePending={eng.savePendingFor(p.id)}
                onToggleSave={eng.toggleSave}
              />
            );
          })
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      <XAuthGateModal open={gateOpen} loggedIn={loggedIn} onClose={() => setGateOpen(false)} />

      {/* avatar / header の全体表示ライトボックス */}
      <XImageLightbox src={lightboxSrc} alt={target.display_name} onClose={() => setLightboxSrc(null)} />

      {/* 右下の投稿FAB（閲覧者が therapist/shop かつ approved のときのみ）。
          プロフィール投稿一覧へのリアルタイム反映はせず、成功トーストのみ（リロードで反映）。 */}
      {eng.canPost && viewerProfile && (
        <XComposeFab me={viewerProfile} onPosted={() => showToast('投稿しました')} />
      )}
    </div>
  );
}
