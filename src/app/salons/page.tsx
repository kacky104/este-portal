import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import { ShuffledSalons } from '@/app/components/ShuffledSalons';

const AREAS = [
  '福岡全域',
  '博多・住吉',
  '中洲・天神・薬院',
  '北九州・小倉',
  '久留米',
  '福岡県その他',
  '出張',
] as const;

export default async function SalonsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('salons')
    .select('id, name, rating, review_count, tags, price, area, hours, description');

  const salons = (rows ?? []).map(row => ({
    id:          row.id as number,
    name:        (row.name as string) ?? '',
    rating:      (row.rating as number) ?? 0,
    reviewCount: (row.review_count as number) ?? 0,
    tags:        (row.tags as string[]) ?? [],
    price:       (row.price as string) ?? '',
    area:        (row.area as string) ?? '',
    hours:       (row.hours as string) ?? '',
    description: (row.description as string) ?? '',
  }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              福岡メンズエステポータル
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-8"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">掲載サロン一覧</h1>
          <p className="text-xs text-slate-400">
            全{salons.length}件 ｜ 表示順はページ読み込みのたびにシャッフルされます
          </p>
        </div>

        <ShuffledSalons salons={salons} areas={[...AREAS]} />
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 福岡メンズエステポータル. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
