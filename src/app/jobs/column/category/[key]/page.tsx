import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ARTICLE_CATEGORY_ORDER,
  articleCategoryLabel,
  isValidArticleCategory,
} from '@/app/lib/articleCategories';
import { fetchPublishedArticlesByCategory } from '@/app/lib/workArticles';
import { ArticleCard } from '../../ArticleCard';
import { CategoryChips } from '../../CategoryChips';

// ISR：一覧と同じ10分。
export const revalidate = 600;

const SITE_URL = 'https://fukues.com';

// 4カテゴリを事前生成（完全SSG）。不正 key は下の notFound で弾く（dynamicParams 既定 true でも
// isValidArticleCategory を通らなければ描画しない）。
export async function generateStaticParams() {
  return ARTICLE_CATEGORY_ORDER.map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  if (!isValidArticleCategory(key)) return {};
  const label = articleCategoryLabel(key);
  const title = `${label}のコラム`;
  const description = `福岡のメンズエステで働くための「${label}」に関するコラム記事一覧。フクエスワーク編集部がお届けします。`;
  return {
    title,
    description,
    openGraph: {
      title: `${title}｜フクエスワーク`,
      description,
      url: `${SITE_URL}/jobs/column/category/${key}`,
      siteName: 'フクエスワーク',
      type: 'website',
      images: [{ url: `${SITE_URL}/ogp-fukuwork.png` }],
    },
  };
}

export default async function ColumnCategoryPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  if (!isValidArticleCategory(key)) notFound();

  const label = articleCategoryLabel(key);
  const articles = await fetchPublishedArticlesByCategory(key);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › コラム › カテゴリ */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <Link href="/jobs/column" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          コラム
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          {label}
        </span>
      </nav>

      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">{label}のコラム</h1>
      </header>

      <CategoryChips activeKey={key} />

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
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
