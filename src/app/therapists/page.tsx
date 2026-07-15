import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { TherapistSearch } from '@/app/components/TherapistSearch';
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
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
          <h1 className="text-xl font-bold text-slate-900">特徴からセラピストを探す</h1>
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
