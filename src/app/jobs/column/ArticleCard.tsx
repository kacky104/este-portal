import Link from 'next/link';
import Image from 'next/image';
import { articleCategoryLabel } from '@/app/lib/articleCategories';
import type { WorkArticleListItem } from '@/app/lib/workArticles';
import { formatColumnDate } from './format';

// コラム一覧カード。hero画像（なければグラデーションのプレースホルダー）・カテゴリバッジ・
// タイトル・excerpt・公開日。カード全体が詳細ページ /jobs/column/[slug] へのリンク。
export function ArticleCard({ article }: { article: WorkArticleListItem }) {
  return (
    <Link
      href={`/jobs/column/${article.slug}`}
      className="group flex gap-4 rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* サムネイル（16:9） */}
      <div className="relative flex-shrink-0 w-28 sm:w-40 aspect-video rounded-xl overflow-hidden bg-emerald-50">
        {article.heroImageUrl ? (
          <Image
            src={article.heroImageUrl}
            alt={article.title}
            fill
            sizes="(max-width: 640px) 112px, 160px"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#D1FAE5,#ECFCCB)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* テキスト */}
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
            {articleCategoryLabel(article.category)}
          </span>
          {article.publishedAt && (
            <span className="text-[10px] text-slate-400">{formatColumnDate(article.publishedAt)}</span>
          )}
        </div>
        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">{article.excerpt}</p>
        )}
      </div>
    </Link>
  );
}
