import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { getAllApprovedReviews } from '@/app/lib/reviews';
import { ReviewList } from '@/app/components/ReviewList';
import { PaginatedReviewList } from '@/app/components/PaginatedReviewList';

export const metadata: Metadata = {
  title: '福岡メンズエステの口コミ一覧｜フクエス',
  description: '福岡のメンズエステに寄せられた口コミを新着順でまとめてチェック。接客・施術・受付の評価とレビューを店舗横断で確認できます。',
  alternates: { canonical: '/reviews' },
  openGraph: { title: '福岡メンズエステの口コミ一覧｜フクエス', url: '/reviews', siteName: 'フクエス', type: 'website' },
};

// ISR：10分ごとに再生成（口コミ承認時は /api/revalidate で個別無効化される想定・一覧はゆるめでOK）。
export const revalidate = 600;

export default async function AllReviewsPage() {
  const reviews = await getAllApprovedReviews();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* Heading */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-br from-pink-50 via-rose-50 to-white shadow-sm">
          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
                福岡メンズエステ 口コミ一覧
              </h1>
              {reviews.length > 0 && (
                <span className="inline-flex items-center rounded-full border border-pink-100 bg-white/80 px-2.5 py-0.5 text-xs font-bold text-pink-600">
                  全{reviews.length}件
                </span>
              )}
            </div>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
              福岡のメンズエステ口コミサイト『フクエス』に寄せられた口コミを新着順でチェック
            </p>
          </div>
        </div>

        {/* 口コミ一覧（全店舗・新着順・20件/ページ） */}
        {reviews.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-pink-100 rounded-3xl bg-pink-50/10">
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
