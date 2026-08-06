'use client';

import { Suspense, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { PageHero } from '@/app/components/PageHero';
import { AdBanner } from '@/app/components/AdBanner';
import type { AdBanner as AdBannerData } from '@/app/lib/adBanners';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { getTheme, breadcrumbCurrentColor, type SalonTheme } from '@/app/lib/themes';
import type { ApprovedReview, TherapistReviewRankItem } from '@/app/lib/reviews';
import { ReviewList } from '@/app/components/ReviewList';
import { PaginatedReviewList } from '@/app/components/PaginatedReviewList';
import { SiteFooter } from '@/app/components/SiteFooter';

// /reviews のタブ（新着 / セラピスト / 殿堂入り）。/ranking の RankingTabs と同方式で、
// タブごとにテーマ（壁紙・配色）を切り替えるため、ページ全体（ヘッダー〜フッター）をここに集約。
// - 新着：イエローテーマ。全店舗の承認済み口コミを新着順（20件/ページ）。
// - セラピスト：シルバーテーマ。口コミ50件以下を件数の多い順（TOP50人・同数は総合平均が高い順）。
// - 殿堂入り：ブラックテーマ（黒基調＋金アクセント）。口コミ51件以上のセラピスト（件数の多い順）。
// タブ状態は URL ハッシュに保存し、リロード時に復元（ISR を壊さないようクライアント側のみ）。
const TAB_THEME = { new: 'yellow', therapist: 'silver', hall: 'black' } as const;
type TabKey = keyof typeof TAB_THEME;
const TAB_KEYS = ['new', 'therapist', 'hall'] as const;
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ページ大見出しのタブ別タイトル・配色。神秘的なレイアウト（トラッキング英字ラベル＋グラデ発光文字＋区切り線）を
// タブごとの色（黄＝新着 / 銀＝ランキング / 黒×金＝殿堂入り）で出し分ける。
const HERO_HEAD: Record<
  TabKey,
  { label: string; title: string; labelClass: string; gradClass: string; dividerClass: string; badgeClass: string }
> = {
  new: {
    label: 'FUKUES REVIEWS',
    title: '福岡メンズエステ 口コミ一覧',
    labelClass: 'text-amber-500/90',
    gradClass: 'from-amber-600 via-yellow-500 to-amber-600 drop-shadow-[0_1px_10px_rgba(245,158,11,0.3)]',
    dividerClass: 'via-amber-400/70',
    badgeClass: 'bg-white/80 border-amber-200 text-amber-600',
  },
  // 銀の光をまとった神秘的なグラデ（中央が明るく輝く）＋シルバーのグロー。
  therapist: {
    label: 'REVIEW RANKING',
    title: 'セラピスト口コミ数TOP50',
    labelClass: 'text-slate-500/90',
    gradClass: 'from-slate-600 via-gray-300 to-slate-600 drop-shadow-[0_1px_14px_rgba(148,163,184,0.5)]',
    dividerClass: 'via-slate-400/70',
    badgeClass: 'bg-white/80 border-slate-300 text-slate-600',
  },
  // 黒背景に金文字（暗背景で映える明るめの金グラデ＋強めの金グロー）。
  hall: {
    label: 'HALL OF FAME',
    title: '口コミ殿堂入りセラピスト',
    labelClass: 'text-yellow-400/90',
    gradClass: 'from-yellow-500 via-amber-200 to-yellow-500 drop-shadow-[0_1px_16px_rgba(247,201,72,0.5)]',
    dividerClass: 'via-yellow-500/70',
    badgeClass: 'bg-white/10 border-yellow-500/60 text-yellow-300',
  },
};

// 順位バッジ：1〜3位はメダル色、4位以降はテーマ連動の淡色（/ranking の RankBadge と同意匠）。
function RankBadge({ rank, theme }: { rank: number; theme: SalonTheme }) {
  const medal =
    rank === 1
      ? { bg: 'linear-gradient(135deg,#F7C948,#E8A317)', ring: '#E8A317', text: '#5A3E00' }
      : rank === 2
      ? { bg: 'linear-gradient(135deg,#D7DEE5,#AEB8C2)', ring: '#AEB8C2', text: '#3A4450' }
      : rank === 3
      ? { bg: 'linear-gradient(135deg,#E7B98F,#CD8B54)', ring: '#CD8B54', text: '#5A3418' }
      : null;

  if (medal) {
    return (
      <span
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shadow-sm"
        style={{ background: medal.bg, color: medal.text, border: `1px solid ${medal.ring}` }}
      >
        {rank}
      </span>
    );
  }
  return (
    <span
      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
      style={{ background: theme.bg, color: theme.body, border: `1px solid ${theme.cardBorder}` }}
    >
      {rank}
    </span>
  );
}

// 殿堂入り用の王冠バッジ（金のグラデ丸に王冠アイコン）。
function CrownBadge() {
  return (
    <span
      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-sm"
      style={{ background: 'linear-gradient(135deg,#F7C948,#E8A317)', border: '1px solid #E8A317' }}
      aria-label="殿堂入り"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#5A3E00" aria-hidden>
        <path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-1.6 9.2a1 1 0 01-1 .8H5.6a1 1 0 01-1-.8L3 8z" />
      </svg>
    </span>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0 opacity-60"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ランキング1行：順位（or 王冠）＋丸アイコン＋名前・所属店＋件数・★総合平均。行全体でセラピストページへ。
function RankRow({ t, badge, theme }: { t: TherapistReviewRankItem; badge: ReactNode; theme: SalonTheme }) {
  return (
    <Link
      href={`/therapist/${t.id}`}
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        theme.key === 'black' ? 'hover:bg-white/10' : 'hover:bg-black/5'
      }`}
    >
      {badge}
      <span className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden bg-slate-100 relative">
        {t.image ? (
          <Image src={t.image} alt={t.name} fill className="object-cover" sizes="44px" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold">
            {t.name.charAt(0) || '—'}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold truncate" style={{ color: theme.heading }}>
          {t.name || '—'}
        </span>
        {t.salonName && (
          <span className="block text-[11px] truncate" style={{ color: theme.body }}>
            {t.salonName}
          </span>
        )}
      </span>
      <span className="flex-shrink-0 text-right">
        {/* 件数：黒テーマ（殿堂入り）では金色で強調 */}
        <span
          className="block text-sm font-black tabular-nums"
          style={{ color: theme.key === 'black' ? '#F7C948' : theme.heading }}
        >
          {t.reviewCount}
          <span className="ml-0.5 text-[10px] font-bold" style={{ color: theme.body }}>件</span>
        </span>
        <span className="block text-[11px] font-bold tabular-nums" style={{ color: theme.body }}>
          <span className="text-amber-400">★</span> {t.avgOverall.toFixed(1)}
        </span>
      </span>
      <Chevron color={theme.body} />
    </Link>
  );
}

function EmptyCard({ children, theme }: { children: ReactNode; theme: SalonTheme }) {
  return (
    <div
      className={`text-center py-16 text-sm border border-dashed rounded-3xl ${
        theme.key === 'black' ? 'bg-white/5' : 'bg-white/40'
      }`}
      style={{ borderColor: theme.cardBorder, color: theme.body }}
    >
      {children}
    </div>
  );
}

export default function ReviewsTabs({
  reviews,
  ranking,
  hallOfFame,
  heroes,
  wallpapers,
  adBanners,
}: {
  reviews: ApprovedReview[];
  ranking: TherapistReviewRankItem[];
  hallOfFame: TherapistReviewRankItem[];
  heroes: { new: string | null; therapist: string | null; hall: string | null };
  wallpapers: Record<string, string>;
  adBanners: AdBannerData[];
}) {
  const [tab, setTab] = useState<TabKey>('new');
  // リロード時に直前のタブを復元（/ranking と同方式・URL ハッシュ）。
  useIsoLayoutEffect(() => {
    const h = window.location.hash.replace('#', '');
    if ((TAB_KEYS as readonly string[]).includes(h)) setTab(h as TabKey);
  }, []);
  const changeTab = (key: TabKey) => {
    setTab(key);
    try {
      const url = key === 'new' ? window.location.pathname + window.location.search : `#${key}`;
      window.history.replaceState(null, '', url);
    } catch {}
  };

  const theme = getTheme(TAB_THEME[tab]);
  const head = HERO_HEAD[tab];
  const heroUrl = heroes[tab] ?? null; // タブ別ヒーロー画像（/admin のページ別ヒーロー画像設定・未設定なら非表示）
  const cardStyle = { background: theme.card, borderColor: theme.cardBorder } as const;

  // テーマ壁紙（設定があれば）をテーマ色の半透明オーバーレイ越しに敷く。/ranking・サロン詳細と同方式。
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgLayerStyle: CSSProperties = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  };

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ color: theme.text }}>
      {/* テーマ背景（壁紙＋オーバーレイ）を全面に固定配置。タブ切替で色ごと入れ替わる。 */}
      <div aria-hidden className="fixed inset-0 -z-10 transition-colors duration-300" style={bgLayerStyle} />

      {/* Header（テーマに関わらず白のバー） */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back */}
        <Breadcrumb current="口コミ一覧" currentColor={breadcrumbCurrentColor(theme.key)} />
        <PageHero url={heroUrl} alt="口コミ" fullBleedMobile />

        {/* タブ（新着 / セラピスト / 殿堂入り）：ヒーロー画像の直下に配置。
            /ranking と同じ角なし・隙間なしセグメント。スマホは幅いっぱい。 */}
        <div className="mt-6 flex sm:justify-center">
          <div className="flex w-full sm:w-auto">
            {([
              ['new', '新着'],
              ['therapist', 'セラピスト'],
              ['hall', '殿堂入り'],
            ] as const).map(([key, label], i) => {
              const selected = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeTab(key)}
                  aria-pressed={selected}
                  className={`flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-8 py-2.5 border text-sm font-bold transition-colors ${
                    i > 0 ? '-ml-px' : ''
                  } ${selected ? 'relative z-10' : ''}`}
                  style={
                    selected
                      ? { background: `${theme.heading}1A`, color: theme.heading, borderColor: theme.heading }
                      : { background: theme.card, color: theme.body, borderColor: theme.cardBorder }
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Heading：カード無しで壁紙背景に直接（/therapists と同方式）。配色はタブ連動。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className={`text-[11px] tracking-[0.35em] font-semibold ${head.labelClass}`}>{head.label}</p>
          <h1
            className={`mt-2 text-2xl sm:text-4xl font-black tracking-[0.06em] bg-gradient-to-r bg-clip-text text-transparent ${head.gradClass}`}
          >
            {head.title}
          </h1>
          {reviews.length > 0 && (
            <div className="mt-3">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${head.badgeClass}`}>
                口コミ総数{reviews.length}件
              </span>
            </div>
          )}
          <div className={`mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent to-transparent ${head.dividerClass}`} />
          {/* 説明文：タブ連動で切り替え（新着=サイト紹介／セラピスト=50件までのランキング／殿堂入り=51件以上）。
              いずれもスマホ・PCとも2行に収まる位置で改行。 */}
          <p className="mx-auto mt-4 max-w-md text-xs sm:text-sm leading-relaxed" style={{ color: theme.body }}>
            {tab === 'new' && (
              <>福岡のメンズエステ口コミサイト『フクエス』に<br />寄せられた口コミを新着順・ランキングでチェック</>
            )}
            {tab === 'therapist' && (
              <>口コミ50件までのセラピストを件数の多い順で紹介する<br className="sm:hidden" />口コミセラピストランキングです（51件以上は殿堂入りへ）</>
            )}
            {tab === 'hall' && (
              <>口コミが51件以上寄せられたセラピストだけが<br className="sm:hidden" />名を連ねる殿堂入りリストです</>
            )}
          </p>
        </div>

        {/* 細い広告バナー（公開中からランダム1枚）。key={tab} でタブ切替のたびに再マウント＝再抽選（/ranking と同挙動）。 */}
        <AdBanner key={`ad-top-${tab}`} banners={adBanners} />

        {/* ── 新着：従来どおり全店舗の口コミを新着順（20件/ページ）。イエローテーマ ──
            3タブとも常にDOMへ描画し、非アクティブ側は hidden で隠す（JobDetailTabs と同方式。2026-08-05）。
            従来の {tab === 'x' && ...} 方式は初期HTMLに「新着」しか含まれず、セラピスト・殿堂入りの
            /therapist/[id] リンク群がクローラから見えなかった。 */}
        <div className={tab === 'new' ? '' : 'hidden'}>
          {reviews.length === 0 ? (
            <EmptyCard theme={theme}>口コミはまだありません</EmptyCard>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <Suspense fallback={<ReviewList reviews={reviews.slice(0, 20)} />}>
                <PaginatedReviewList reviews={reviews} pageSize={20} />
              </Suspense>
            </div>
          )}
        </div>

        {/* ── セラピスト：口コミ数ランキング（50件以下・TOP50人）。シルバーテーマ ── */}
        <div className={tab === 'therapist' ? '' : 'hidden'}>
          <>
            {ranking.length === 0 ? (
              <EmptyCard theme={theme}>口コミのあるセラピストはまだいません</EmptyCard>
            ) : (
              <div className="rounded-2xl border shadow-sm overflow-hidden transition-colors duration-300" style={cardStyle}>
                <ul>
                  {ranking.map((t, idx) => (
                    <li
                      key={t.id}
                      style={idx < ranking.length - 1 ? { borderBottom: `1px solid ${theme.cardBorder}` } : undefined}
                    >
                      <RankRow t={t} theme={theme} badge={<RankBadge rank={t.rank} theme={theme} />} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        </div>

        {/* ── 殿堂入り：口コミ51件以上のレジェンド（黒×金の特別カード）。ブラックテーマ ── */}
        <div className={tab === 'hall' ? '' : 'hidden'}>
          <>
            {hallOfFame.length === 0 ? (
              <EmptyCard theme={theme}>
                殿堂入りセラピストはまだいません
                <br />
                <span className="text-xs">口コミが51件以上になると殿堂入りします</span>
              </EmptyCard>
            ) : (
              <div
                className="rounded-2xl overflow-hidden shadow-[0_0_24px_rgba(247,201,72,0.15)]"
                style={{
                  border: '1px solid #B8860B',
                  background: 'linear-gradient(160deg,#262626 0%,#1c1c1c 45%,#2a2413 100%)',
                }}
              >
                <ul>
                  {hallOfFame.map((t, idx) => (
                    <li
                      key={t.id}
                      style={idx < hallOfFame.length - 1 ? { borderBottom: '1px solid rgba(232,163,23,0.35)' } : undefined}
                    >
                      <RankRow t={t} theme={theme} badge={<CrownBadge />} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        </div>

        {/* ルックバナー（ページ下部）。上部の枠とは独立にランダム抽選。key={tab} でタブ切替のたびに再抽選。 */}
        <AdBanner key={`ad-bottom-${tab}`} banners={adBanners} />
      </main>

      {/* Footer */}
      <SiteFooter inner="max-w-4xl" />
    </div>
  );
}
