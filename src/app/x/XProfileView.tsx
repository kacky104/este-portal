'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { XProfile } from './xProfile';
import type { StoryGroup } from './xStories';
import { XStoryViewer } from './XStoryViewer';
import { getSeenMap, isGroupSeen } from './xStoriesShared';
import type { XPost, FeedItem } from './xPosts';
import type { ShopMini, TherapistMini } from './xAffiliation';
import { XPostCard } from './XPostCard';
import { VerifiedBadge } from './VerifiedBadge';
import { AutoFitName } from './AutoFitName';
import { XAuthGateModal } from './XAuthGateModal';
import { XImageLightbox } from './XImageLightbox';
import { XComposeFab } from './XComposeFab';
import { XMessageButton } from './XMessageButton';
import { XPostNotifyBell } from './XPostNotifyBell';
import { XProfileSchedule } from './XProfileSchedule';
import { safeHref, linkDomain } from './xLink';
import { formatFukuxStartDate } from './xDate';
import { useXEngagement } from './useXEngagement';

const KIND_LABEL: Record<string, string> = {
  user: 'ユーザー',
  therapist: 'セラピスト',
  shop: 'お店',
  official: '運営',
};

export function XProfileView({
  target,
  storyGroup,
  viewerProfile,
  loggedIn,
  isOwnProfile,
  followerCount,
  followingCount,
  feed,
  initialLikedIds,
  initialSavedIds,
  initialRepostedIds,
  initialRepostCounts,
  initialFollowing,
  initialNotifyPosts,
  affiliatedShop,
  affiliatedTherapists,
  scheduleTherapistId,
}: {
  target: XProfile;
  storyGroup: StoryGroup | null; // target の未失効ストーリー（あればアバターにリング＋タップでビューア）
  viewerProfile: XProfile | null;
  loggedIn: boolean;
  isOwnProfile: boolean;
  followerCount: number | null;
  followingCount: number | null;
  feed: FeedItem[]; // 通常投稿＋リポストをマージ済み（サーバで sortAt 降順・重複排除済み）
  initialLikedIds: string[];
  initialSavedIds: string[];
  initialRepostedIds: string[];
  initialRepostCounts: Record<string, number>;
  initialFollowing: boolean;
  initialNotifyPosts: boolean;
  affiliatedShop: ShopMini | null; // target が therapist のとき所属先（無ければ null）
  affiliatedTherapists: TherapistMini[]; // target が shop のとき所属セラピスト一覧
  scheduleTherapistId: number | null; // 紐づく本体 therapist id（セラピスト＋連携時のみ。無ければスケジュール非表示）
}) {
  const [toast, setToast] = useState('');
  const [gateOpen, setGateOpen] = useState(false); // 未ログイン／未開設アクション時のモーダル
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null); // avatar/header の全体表示
  // ストーリーリング: 既読状態は localStorage 依存＝マウント後に読む（SSR不一致回避）。
  const [storyOpen, setStoryOpen] = useState(false);
  const [storySeenMap, setStorySeenMap] = useState<Record<string, string>>({});
  useEffect(() => {
    setStorySeenMap(getSeenMap());
  }, []);
  const storySeen = storyGroup ? isGroupSeen(storyGroup, storySeenMap) : true;
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  // フックのいいね/リポスト状態はフィード内の各投稿（重複排除済み）を種にする。
  const posts = useMemo(() => feed.map((f) => f.post), [feed]);

  // いいね／フォローは共通フックで（タイムラインと同一ロジック）。
  const eng = useXEngagement({
    me: viewerProfile,
    posts,
    initialLikedIds,
    initialFolloweeIds: initialFollowing ? [target.id] : [],
    initialSavedIds,
    initialRepostedIds,
    initialRepostCounts,
    onToast: showToast,
    onAuthRequired: () => setGateOpen(true),
  });

  const showFollowBtn = eng.showFollowFor(target); // target が therapist/shop・自分以外・自分が therapist でない
  const following = eng.isFollowing(target.id);
  const followPending = eng.followPendingFor(target.id);

  // 年齢・スリーサイズ（@handle の右横に表示）。各値が無ければその項目だけ省略、全部空なら何も出さない。
  // カップはバストがある時だけ B89（F） の形で付ける。
  const measurements: string[] = [];
  if (target.age != null) measurements.push(`${target.age}歳`);
  if (target.height != null) measurements.push(`T${target.height}`);
  if (target.bust != null) measurements.push(target.cup ? `B${target.bust}（${target.cup}）` : `B${target.bust}`);
  if (target.waist != null) measurements.push(`W${target.waist}`);
  if (target.hip != null) measurements.push(`H${target.hip}`);

  // fukuX開始日（プロフィール作成日・変更不可）。リンク行の右隣に表示。
  const startDate = formatFukuxStartDate(target.created_at);

  return (
    <div>
      {/* ─── ヘッダー（浮遊カード） ─── */}
      <div className="x-card mt-3 rounded-2xl overflow-hidden bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
        {/* バナー（header_url があればタップで全体表示） */}
        {/* 高さ: スマホ=123px / PC=168×1.2≒202px */}
        <div className="h-[123px] sm:h-[202px] bg-gradient-to-br from-indigo-100 to-sky-100 relative">
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
            {storyGroup ? (
              /* ストーリーあり: リング（未読はグラデ回転・既読はグレー）＋タップでビューア */
              <button type="button" onClick={() => setStoryOpen(true)} aria-label="ストーリーを見る" className="relative w-20 h-20 flex-shrink-0">
                <span
                  className={`absolute inset-0 rounded-full ${storySeen ? '' : 'x-story-ring'}`}
                  style={storySeen ? { background: 'var(--x-border-strong)' } : undefined}
                />
                {/* リング幅5px・白フチなし（リングとアバターを直接密着させる） */}
                <span className="absolute inset-[5px] rounded-full overflow-hidden shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center">
                  {target.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={target.avatar_url} alt={target.display_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold text-2xl">{target.display_name.charAt(0) || '?'}</span>
                  )}
                </span>
              </button>
            ) : (
              /* ストーリーなし: 従来どおり（タップでアバター全体表示） */
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
            )}

            <div className="mb-1 flex flex-nowrap items-center gap-2">
              {isOwnProfile ? (
                <Link
                  href="/x/settings"
                  className="inline-block whitespace-nowrap shrink-0 text-xs font-bold px-4 py-1.5 rounded-full border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:border-indigo-300 hover:text-[color:var(--x-accent)] transition-colors"
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
                      className={`whitespace-nowrap shrink-0 text-sm font-bold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
                        following
                          ? 'border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:border-rose-200 hover:text-rose-500'
                          : 'text-white'
                      }`}
                      style={following ? undefined : { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                    >
                      {following ? 'フォロー中' : 'フォロー'}
                    </button>
                  )}
                  {/* 投稿通知ベル：相手が therapist/shop（showFollowBtn）かつ「フォロー中」のときだけ。既定OFF＝オプトイン。 */}
                  {showFollowBtn && following && (
                    <XPostNotifyBell targetProfileId={target.id} initialOn={initialNotifyPosts} onToast={showToast} />
                  )}
                </>
              )}
            </div>
          </div>

          {/* 名前・kind・所属（同じ行に横並び。狭幅は折り返し）。
              表示名は1行自動縮小フィット（20→13px・AutoFitName）＝長い名前でも改行/省略せず1行に収める。
              認証バッジ・種別チップは縮めず名前の直後に配置（after）。所属バッジは長くなり得るため次行へ折り返し。 */}
          <div className="mt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AutoFitName
                name={target.display_name}
                max={20}
                min={13}
                className="gap-2"
                textClassName="font-black text-[color:var(--x-text-primary)]"
                textTag="h1"
                after={
                  <>
                    {(target.kind === 'official' || ((target.kind === 'shop' || target.kind === 'therapist') && target.is_verified)) && (
                      <span className="flex-shrink-0">
                        <VerifiedBadge size={18} kind={target.kind} />
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      {KIND_LABEL[target.kind] ?? target.kind}
                    </span>
                  </>
                }
              />
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
            {/* @handle と 住所（お店のみ）・年齢・スリーサイズ を同じ行に（狭幅は折り返してもレイアウトが崩れない）。 */}
            <div className="flex flex-wrap items-center gap-x-2">
              <p className="text-sm text-[color:var(--x-text-muted)]">@{target.handle}</p>
              {/* 住所：お店アカウントのみ・address があるときだけ。Lucide MapPin 相当のインラインSVG＋住所。 */}
              {target.kind === 'shop' && target.address && (
                <span className="inline-flex items-center gap-x-1 text-xs text-[color:var(--x-text-secondary)]">
                  <svg
                    className="h-3.5 w-3.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="break-words">{target.address}</span>
                </span>
              )}
              {target.kind === 'therapist' && measurements.length > 0 && (
                <p className="text-xs text-[color:var(--x-text-secondary)] tabular-nums">{measurements.join(' ')}</p>
              )}
            </div>

            {target.bio && <p className="text-sm text-[color:var(--x-text-primary)] leading-relaxed whitespace-pre-wrap break-words mt-2">{target.bio}</p>}

            {/* リンク（任意・http/https のみ）と fukuX開始日（作成日・変更不可）を同じ行に。
                リンクが無くても開始日は単独で表示する（狭幅は折り返し）。 */}
            {(safeHref(target.link_url) || startDate) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                {safeHref(target.link_url) && (
                  <a
                    href={safeHref(target.link_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 max-w-full text-sm font-medium text-[color:var(--x-accent)] hover:underline"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span className="truncate">{linkDomain(target.link_url!)}</span>
                  </a>
                )}
                {startDate && <span className="text-xs text-[color:var(--x-text-secondary)]">{startDate}</span>}
              </div>
            )}

            {/* 数値（kind が持ち得る数だけ表示）。タップでフォロー中／フォロワー一覧へ。 */}
            <div className="flex items-center gap-4 mt-3 text-sm">
              {followingCount !== null && (
                <Link href={`/x/u/${target.handle}/following`} className="text-[color:var(--x-text-secondary)] hover:underline">
                  <strong className="text-[color:var(--x-text-primary)] tabular-nums">{followingCount}</strong> フォロー中
                </Link>
              )}
              {followerCount !== null && (
                <Link href={`/x/u/${target.handle}/followers`} className="text-[color:var(--x-text-secondary)] hover:underline">
                  <strong className="text-[color:var(--x-text-primary)] tabular-nums">{followerCount}</strong> フォロワー
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

      {/* ─── 出勤スケジュール（7日間）：紐づく本体セラピストがある時のみ・プロフィール欄の直下 ─── */}
      {scheduleTherapistId != null && <XProfileSchedule therapistId={scheduleTherapistId} />}

      {/* ─── 所属セラピスト一覧（店舗プロフィールのみ・浮遊カード） ─── */}
      {target.kind === 'shop' && (
        <div className="x-card mt-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-4">
          <h2 className="text-sm font-black text-[color:var(--x-text-primary)] mb-2">
            所属セラピスト
            {affiliatedTherapists.length > 0 && (
              <span className="ml-1.5 text-xs font-bold text-[color:var(--x-text-muted)] tabular-nums">{affiliatedTherapists.length}</span>
            )}
          </h2>
          {affiliatedTherapists.length === 0 ? (
            <p className="text-xs text-[color:var(--x-text-muted)] py-2">所属セラピストはまだいません</p>
          ) : (
            <div className="space-y-1">
              {affiliatedTherapists.map((th) => (
                <Link
                  key={th.id}
                  href={`/x/u/${th.handle}`}
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[color:var(--x-surface-hover)] transition-colors"
                >
                  <span className="relative w-9 h-9 rounded-full overflow-hidden border border-[color:var(--x-border)] bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {th.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={th.avatarUrl} alt={th.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-xs font-bold">{th.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[color:var(--x-text-primary)] truncate">{th.displayName}</p>
                    <p className="text-xs text-[color:var(--x-text-muted)] truncate">@{th.handle}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 投稿＋リポスト一覧（各カードが浮遊） ─── */}
      {/* ユーザーは投稿不可だがリポストは可能。投稿ゼロでもリポストがあればフィードを描画する。
          セラピスト・お店は従来どおり（空のときの空表示も維持）。ユーザーでフィード空なら丸ごと非描画。 */}
      {(target.kind !== 'user' || feed.length > 0) && (
        <div className="mt-3 space-y-3">
          {feed.length === 0 ? (
            <div className="py-16 text-center">
              <p className="x-rescue-muted text-sm text-white/90 drop-shadow-sm">まだ投稿がありません</p>
            </div>
          ) : (
            feed.map((item) => {
              const p = item.post;
              const ls = eng.likeState(p);
              const rs = eng.repostState(p);
              return (
                <XPostCard
                  key={p.id}
                  post={p}
                  liked={ls.liked}
                  likeCount={ls.count}
                  following={eng.isFollowing(p.author.id)}
                  showFollow={false} /* プロフィール上部にフォローボタンがあるため各投稿では出さない（リポスト元にも出さない） */
                  likePending={eng.likePendingFor(p.id)}
                  followPending={followPending}
                  onToggleLike={eng.toggleLike}
                  onToggleFollow={eng.toggleFollow}
                  saved={eng.isSaved(p.id)}
                  savePending={eng.savePendingFor(p.id)}
                  onToggleSave={eng.toggleSave}
                  reposted={rs.reposted}
                  repostCount={rs.count}
                  repostPending={eng.repostPendingFor(p.id)}
                  onToggleRepost={eng.toggleRepost}
                  repostLabel={item.kind === 'repost' ? `${item.reposterName} さんがリポスト` : undefined}
                />
              );
            })
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      <XAuthGateModal open={gateOpen} loggedIn={loggedIn} onClose={() => setGateOpen(false)} />

      {/* avatar / header の全体表示ライトボックス */}
      <XImageLightbox src={lightboxSrc} alt={target.display_name} onClose={() => setLightboxSrc(null)} />

      {/* アバターのストーリーリングから開くビューア（このプロフィールの1グループのみ） */}
      {storyOpen && storyGroup && (
        <XStoryViewer
          groups={[storyGroup]}
          startGroupIndex={0}
          myProfileId={viewerProfile?.id ?? ''}
          onClose={() => {
            setStoryOpen(false);
            setStorySeenMap(getSeenMap());
          }}
        />
      )}

      {/* 右下の投稿FAB（閲覧者が therapist/shop かつ approved のときのみ）。
          プロフィール投稿一覧へのリアルタイム反映はせず、成功トーストのみ（リロードで反映）。 */}
      {eng.canPost && viewerProfile && (
        <XComposeFab me={viewerProfile} onPosted={() => showToast('投稿しました')} />
      )}
    </div>
  );
}
