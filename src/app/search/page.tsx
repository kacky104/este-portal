import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Logo } from '@/app/components/Logo';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchSalons } from '@/app/lib/salons';
import { buildKodawariGroups } from '@/app/lib/kodawari';
import { SearchClient } from '@/app/components/SearchClient';

// ISR：10分ごとに再生成（エリアページと同じ方針。絞り込み自体はクライアントで行う）。
export const revalidate = 600;

export const metadata: Metadata = {
  title: 'エリア・こだわりで探す｜フクエス',
  description:
    '福岡のメンズエステをエリアとこだわり条件で絞り込み検索。完全個室・出張対応・アロマなど、希望に合うサロンを見つけられます。',
  alternates: { canonical: '/search' },
  openGraph: { title: 'エリア・こだわりで探す｜フクエス' },
};

export default async function SearchPage() {
  // cookie を読まない匿名クライアント（公開データ専用・ISRを効かせる）。
  const supabase = createPublicClient();
  const salons = await fetchSalons(supabase);

  // こだわり候補は実データの tags から構成（空振りチップを作らない・未知タグは「その他」へ）。
  const allTags = Array.from(new Set(salons.flatMap((s) => s.tags))).filter(Boolean);
  const kodawariGroups = buildKodawariGroups(allTags);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* シンプルヘッダー */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
          <h1 className="text-xl font-bold text-slate-900">エリア・こだわりで探す</h1>
        </div>

        {/* useSearchParams を使うため Suspense 境界で包む（静的シェル＋クライアント絞り込み）。 */}
        <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">読み込み中…</div>}>
          <SearchClient salons={salons} kodawariGroups={kodawariGroups} />
        </Suspense>
      </main>
    </div>
  );
}
