import type { ArticleHeading } from '@/app/lib/articleToc';

// コラム記事の目次（もくじ）。本体 column/ArticleToc.tsx の緑テーマ版・構造同一。
//
// ★ JavaScript は1行も使っていない。素の <a href="#id"> と、本文側 h2 の id 属性だけで動く。
// ★ 見出し（h2）が TOC_MIN_HEADINGS 本未満の記事では、ページ側が描画しない。
// ★ 飛び先で見出しが追従ヘッダーに隠れないよう、本文側 h2 に scroll-mt-20 を付けてある。

export function ArticleToc({ headings }: { headings: ArticleHeading[] }) {
  if (headings.length === 0) return null;
  return (
    <nav aria-label="目次" className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
      <div className="flex items-center gap-2.5">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <p className="text-sm font-bold text-slate-900">目次</p>
      </div>
      <ol className="mt-3 space-y-2 list-decimal pl-6 marker:text-emerald-500 marker:font-bold marker:text-sm">
        {headings.map((h) => (
          <li key={h.id} className="pl-1">
            <a
              href={`#${h.id}`}
              className="text-[14px] leading-relaxed text-slate-700 underline underline-offset-4 decoration-emerald-200 hover:text-emerald-700 hover:decoration-emerald-400 transition-colors"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
