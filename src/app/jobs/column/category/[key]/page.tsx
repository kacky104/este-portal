import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ARTICLE_CATEGORY_ORDER,
  articleCategoryLabel,
  articleCategoryDescription,
  isValidArticleCategory,
} from '@/app/lib/articleCategories';
import { fetchPublishedArticlesByCategory } from '@/app/lib/workArticles';
import { ArticleCard } from '../../ArticleCard';
import { CategoryChips } from '../../CategoryChips';
import { ColumnHeading } from '../../ColumnHeading';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';

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
  // ★ 画面に出している説明文とまったく同じものを使う（2026-08-18 第23便）。
  //   以前はカテゴリ名を差し替えただけの定型文で、4カテゴリがほぼ同じ文面になっていた。
  const description = articleCategoryDescription(key);
  return {
    title,
    description,
    alternates: { canonical: `/jobs/column/category/${key}` },
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
  // 記事一覧・ヘッダー画像・ルックバナーは互いに独立なので並列取得。
  // ★ ヒーローは一覧ページ（/jobs/column）と【同じ 'jobs-column' キー】。カテゴリごとに別画像は持たない。
  const [articles, hero, adBanners] = await Promise.all([
    fetchPublishedArticlesByCategory(key),
    fetchPageHero('jobs-column'),
    fetchActiveAdBanners(),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › コラム › カテゴリ */}
      {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエスワーク', path: '/jobs' },
        { name: 'コラム', path: '/jobs/column' },
        { name: label, path: `/jobs/column/category/${key}` },
      ])) }} />
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
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

      {/* ページ別ヒーロー画像（/jobs/column と同じ画像・同じ置き場所）。設定は /admin の「お仕事コラム」1か所。 */}
      <PageHero url={hero} alt="セラピストのお仕事コラム" fullBleedMobile contentMax={768} />

      {/* 見出し・説明文・カテゴリチップは中央寄せ（2026-08-18 第23便）。
          説明文は lib/articleCategories.ts の1か所から。<meta description> と同じ出どころ。 */}
      <ColumnHeading title={`${label}のコラム`} description={articleCategoryDescription(key)} />

      <CategoryChips activeKey={key} />

      {/* ルックバナー（タブの下）。一覧（/jobs/column）と同じ2枠（2026-08-19 第24便）。
          ここに置かないと、タブを押した瞬間にバナーが消える（ヒーロー画像と同じ判断基準）。 */}
      <AdBanner banners={adBanners} />

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

      {/* ルックバナー（最後のコラムカードの下）。上の枠とは独立にランダム抽選。 */}
      <AdBanner banners={adBanners} />
    </main>
  );
}
