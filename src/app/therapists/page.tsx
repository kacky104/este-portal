import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Logo } from '@/app/components/Logo';
import { TherapistSearch } from '@/app/components/TherapistSearch';

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
