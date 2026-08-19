import type { ArticleHeading } from '@/app/lib/articleToc';

// 本体コラム記事の目次（もくじ）。ワーク側 jobs/column/ArticleToc.tsx のピンクテーマ版・構造同一。
//
// ★ JavaScript は1行も使っていない。素の <a href="#id"> と、本文側 h2 の id 属性だけで動く。
//   （公式HPのタブと同じ方針。'use client' の部品を増やさない）
// ★ 見出し（h2）が TOC_MIN_HEADINGS 本未満の記事では、ページ側が描画しない。
// ★ 飛び先で見出しが追従ヘッダーに隠れないよう、本文側 h2 に scroll-mt-20 を付けてある。

export function ArticleToc({ headings }: { headings: ArticleHeading[] }) {
  if (headings.length === 0) return null;
  return (
    <nav aria-label="目次" className="mt-6 rounded-2xl border border-pink-100 bg-pink-50/40 p-5">
      <div className="flex items-center gap-2.5">
        <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
        <p className="text-sm font-bold text-slate-900">目次</p>
      </div>
      <ol className="mt-3 space-y-2 list-decimal pl-6 marker:text-pink-500 marker:font-bold marker:text-sm">
        {headings.map((h) => (
          <li key={h.id} className="pl-1">
            <a
              href={`#${h.id}`}
              className="text-[14px] leading-relaxed text-slate-700 underline underline-offset-4 decoration-pink-200 hover:text-pink-700 hover:decoration-pink-400 transition-colors"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
