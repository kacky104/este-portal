import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { TherapistSearch } from '@/app/components/TherapistSearch';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { POPULAR_BADGES, badgeToSlug } from '@/lib/therapistBadgeSlugs';
import { getBadgeColors } from '@/lib/therapistBadges';

const TITLE = '特徴からセラピストを探す｜福岡メンズエステ【フクエス】';
const DESCRIPTION =
  '福岡のメンズエステのセラピストを「特徴バッジ」やエリアで絞り込み検索。癒し系・妹系・密着施術など、好みに合うセラピストを見つけられます。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/therapists' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/therapists', siteName: 'フクエス', type: 'website' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export default function TherapistsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* シンプルヘッダー */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Breadcrumb current="特徴からセラピストを探す" />
        <div className="mb-5 overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-br from-pink-50 via-rose-50 to-white shadow-sm">
          <div className="px-5 py-5 sm:px-8 sm:py-6">
            <h1 className="text-lg sm:text-2xl font-black tracking-tight bg-gradient-to-r from-pink-600 to-rose-500 bg-clip-text text-transparent">
              特徴からセラピストを探す
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 leading-relaxed">
              癒し系・妹系・密着施術など、好みの特徴やエリアで福岡のメンズエステセラピストを絞り込み検索。
            </p>
          </div>
        </div>

        {/* 人気の特徴から探す：バッジ別ランディングページ（/therapists/badge/[slug]）への内部リンク。
            サーバー描画の <Link> なのでクローラに辿られ、各ランディングの発見性・評価を底上げする。 */}
        <nav aria-label="人気の特徴から探す" className="mb-6">
          <p className="text-xs font-bold text-slate-500 mb-2">人気の特徴から探す</p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_BADGES.map((label) => {
              const slug = badgeToSlug(label);
              if (!slug) return null;
              const c = getBadgeColors(label);
              return (
                <Link
                  key={label}
                  href={`/therapists/badge/${slug}`}
                  className="px-3 py-1 rounded-full text-xs font-bold border hover:opacity-80 transition-opacity"
                  style={c ? { background: c.fill, color: c.text, borderColor: c.border } : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* useSearchParams を使うため Suspense 境界で包む。 */}
        <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">読み込み中…</div>}>
          <TherapistSearch />
        </Suspense>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
