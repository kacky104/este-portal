import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  MAIN_ARTICLE_CATEGORY_ORDER,
  mainArticleCategoryLabel,
  isValidMainArticleCategory,
} from '@/app/lib/mainArticleCategories';
import { fetchPublishedMainArticlesByCategory } from '@/app/lib/mainArticles';
import { ArticleCard } from '../../ArticleCard';
import { CategoryChips } from '../../CategoryChips';

// 本体コラムのカテゴリ別一覧（ワーク側 jobs/column/category/[key] のピンクテーマ版）。

export const revalidate = 600;

const SITE_URL = 'https://fukues.com';

// 4カテゴリを事前生成（完全SSG）。不正 key は下の notFound で弾く。
export async function generateStaticParams() {
  return MAIN_ARTICLE_CATEGORY_ORDER.map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  if (!isValidMainArticleCategory(key)) return {};
  const label = mainArticleCategoryLabel(key);
  const title = `${label}のコラム`;
  const description = `福岡のメンズエステをもっと楽しむための「${label}」に関するコラム記事一覧。フクエス編集部がお届けします。`;
  return {
    title,
    description,
    alternates: { canonical: `/column/category/${key}` },
    openGraph: {
      title: `${title}｜フクエス`,
      description,
      url: `${SITE_URL}/column/category/${key}`,
      siteName: 'フクエス',
      type: 'website',
      images: [{ url: `${SITE_URL}/ogp.png` }],
    },
  };
}

export default async function MainColumnCategoryPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  if (!isValidMainArticleCategory(key)) notFound();

  const label = mainArticleCategoryLabel(key);
  const articles = await fetchPublishedMainArticlesByCategory(key);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエス › コラム › カテゴリ */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
        <Link href="/" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
          フクエス
        </Link>
        <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
        <Link href="/column" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
          コラム
        </Link>
        <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
        <span aria-current="page" className="font-semibold text-pink-700">
          {label}
        </span>
      </nav>

      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">{label}のコラム</h1>
      </header>

      <CategoryChips activeKey={key} />

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-pink-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
          このカテゴリのコラムは準備中です。
        </div>
      ) : (
        <ul className="space-y-3">
          {articles.map((a) => (
            <li key={a.id}>
              <ArticleCard article={a} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
