import Link from 'next/link';
import Image from 'next/image';
import { mainArticleCategoryLabel } from '@/app/lib/mainArticleCategories';
import type { MainArticleListItem } from '@/app/lib/mainArticles';
import { formatColumnDate } from './format';

// 本体コラム一覧カード（ワーク側 ArticleCard のピンクテーマ版）。
// hero画像（なければグラデーションのプレースホルダー）・カテゴリバッジ・タイトル・excerpt・更新日。
// カード全体が詳細ページ /column/[slug] へのリンク。
export function ArticleCard({ article }: { article: MainArticleListItem }) {
  return (
    <Link
      href={`/column/${article.slug}`}
      className="group flex gap-4 rounded-2xl border border-pink-100 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* サムネイル（16:9） */}
      <div className="relative flex-shrink-0 w-28 sm:w-40 aspect-video rounded-xl overflow-hidden bg-pink-50">
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
            style={{ background: 'linear-gradient(135deg,#FCE7F3,#FFE4E6)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* テキスト */}
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
            {mainArticleCategoryLabel(article.category)}
          </span>
          {(article.updatedAt ?? article.publishedAt) && (
            <span className="text-[10px] text-slate-400">{formatColumnDate(article.updatedAt ?? article.publishedAt)}</span>
          )}
        </div>
        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-pink-700 transition-colors">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">{article.excerpt}</p>
        )}
      </div>
    </Link>
  );
}
