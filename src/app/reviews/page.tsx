import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { getAllApprovedReviews } from '@/app/lib/reviews';
import { ReviewList } from '@/app/components/ReviewList';
import { PaginatedReviewList } from '@/app/components/PaginatedReviewList';

export const metadata: Metadata = {
  title: '福岡メンズエステの口コミ一覧｜フクエス',
  description: '福岡のメンズエステに寄せられた口コミを新着順でまとめてチェック。接客・施術・受付の評価とレビューを店舗横断で確認できます。',
  alternates: { canonical: '/reviews' },
  openGraph: { title: '福岡メンズエステの口コミ一覧｜フクエス', description: '福岡のメンズエステに寄せられた口コミを新着順でまとめてチェック。接客・施術・受付の評価とレビューを店舗横断で確認できます。', url: '/reviews', siteName: 'フクエス', type: 'website' },
};

// ISR：10分ごとに再生成（口コミ承認時は /api/revalidate で個別無効化される想定・一覧はゆるめでOK）。
export const revalidate = 600;

export default async function AllReviewsPage() {
  // 黄色テーマ壁紙を固定レイヤーで敷く（/therapists と同方式）。口コミ・ヒーロー・壁紙を同時取得。
  const [reviews, hero, wallpapers, adBanners] = await Promise.all([
    getAllApprovedReviews(),
    fetchPageHero('reviews'),
    fetchThemeWallpapers(),
    fetchActiveAdBanners(),
  ]);
  const theme = getTheme('yellow');
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgStyle = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
        }
      : {}),
  };

  return (
    <div className="min-h-screen text-slate-900">
      {/* 背景：yellow テーマ壁紙を固定レイヤーで敷く（サロン詳細/therapists と同方式）。 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgStyle} />
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back */}
        <Breadcrumb current="口コミ一覧" currentColor={breadcrumbCurrentColor(theme.key)} />
        <PageHero url={hero} alt="口コミ" fullBleedMobile />

        {/* Heading：カードを外し、黄色の壁紙背景に直接（神秘的なレイアウト・/therapists と同方式）。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-amber-500/90">FUKUES REVIEWS</p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-black tracking-[0.06em] bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(245,158,11,0.3)]">
            福岡メンズエステ 口コミ一覧
          </h1>
          {reviews.length > 0 && (
            <div className="mt-3">
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-white/80 px-2.5 py-0.5 text-xs font-bold text-amber-600">
                全{reviews.length}件
              </span>
            </div>
          )}
          <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
          <p className="mx-auto mt-4 max-w-md text-xs sm:text-sm leading-relaxed text-slate-600">
            福岡のメンズエステ口コミサイト<br />『フクエス』に寄せられた口コミを新着順でチェック
          </p>
        </div>

        {/* 細い広告バナー（公開中からランダム1枚・ページを開くたびに入れ替わり） */}
        <AdBanner banners={adBanners} />

        {/* 口コミ一覧（全店舗・新着順・20件/ページ） */}
        {reviews.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-amber-100 rounded-3xl bg-amber-50/10">
            口コミはまだありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <Suspense fallback={<ReviewList reviews={reviews.slice(0, 20)} />}>
              <PaginatedReviewList reviews={reviews} pageSize={20} />
            </Suspense>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
