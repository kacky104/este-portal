import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { mainArticleCategoryLabel } from '@/app/lib/mainArticleCategories';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, areaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import {
  fetchPublishedMainArticleBySlug,
  fetchPublishedMainArticleSlugs,
  fetchRelatedMainArticles,
  type MainArticleDetail,
} from '@/app/lib/mainArticles';
import { ArticleBody } from '../ArticleBody';
import { ArticleCard } from '../ArticleCard';
import { formatColumnDate } from '../format';

// 本体コラム詳細（ワーク側 jobs/column/[slug] のピンクテーマ版・構成同一）。
// 記事末尾の導線はサロン探し（トップ＋エリアページ）へ向ける。

const SITE_URL = 'https://fukues.com';
const AUTHOR_NAME = 'フクエス編集部';

export const revalidate = 600;

export async function generateStaticParams() {
  const slugs = await fetchPublishedMainArticleSlugs();
  return slugs.map((slug) => ({ slug }));
}

function truncatePlain(text: string | null, max: number): string {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// updated_at が published_at より「後」なら更新日として表示する（同時刻・以前は非表示）。
function isMeaningfulUpdate(publishedAt: string | null, updatedAt: string | null): boolean {
  if (!updatedAt || !publishedAt) return false;
  const p = new Date(publishedAt).getTime();
  const u = new Date(updatedAt).getTime();
  if (Number.isNaN(p) || Number.isNaN(u)) return false;
  return u - p > 60 * 1000; // 1分以上後
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await fetchPublishedMainArticleBySlug(slug);
  if (!article) return {};

  // title は layout の template「%s｜フクエス」に合成される。
  const title = article.title;
  const description = article.excerpt || truncatePlain(article.body, 90);
  const shareImage = article.heroImageUrl || `${SITE_URL}/ogp.png`;
  return {
    title,
    description,
    alternates: { canonical: `/column/${article.slug}` },
    openGraph: {
      title: `${article.title}｜フクエス`,
      description,
      url: `${SITE_URL}/column/${article.slug}`,
      siteName: 'フクエス',
      type: 'article',
      images: [{ url: shareImage }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${article.title}｜フクエス`,
      description,
      images: [shareImage],
    },
  };
}

// Article 構造化データ。
function buildArticleJsonLd(article: MainArticleDetail): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'Article',
    headline: article.title,
    author: { '@type': 'Organization', name: AUTHOR_NAME, url: `${SITE_URL}/column` },
    publisher: {
      '@type': 'Organization',
      name: 'フクエス',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/column/${article.slug}` },
  };
  if (article.publishedAt) ld.datePublished = article.publishedAt;
  ld.dateModified = article.updatedAt || article.publishedAt || undefined;
  if (article.heroImageUrl) ld.image = [article.heroImageUrl];
  return ld;
}

// BreadcrumbList 構造化データ（フクエス › コラム › 記事タイトル）。
function buildBreadcrumbJsonLd(article: MainArticleDetail): Record<string, unknown> {
  return {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'フクエス', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'コラム', item: `${SITE_URL}/column` },
      { '@type': 'ListItem', position: 3, name: article.title, item: `${SITE_URL}/column/${article.slug}` },
    ],
  };
}

export default async function MainColumnDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await fetchPublishedMainArticleBySlug(slug);
  if (!article) notFound();

  const related = await fetchRelatedMainArticles(article.category, article.slug, 3);
  const showUpdated = isMeaningfulUpdate(article.publishedAt, article.updatedAt);

  // エリアページへの導線（AREA_ORDER 準拠。全域はトップに集約されるため除外・出張は含める）。
  const areaLinks = AREA_ORDER.filter((a) => a !== ALL_AREA);

  const articleJsonLd = buildArticleJsonLd(article);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(article);
  const articleJsonLdString = JSON.stringify(articleJsonLd).replace(/</g, '\\u003c');
  const breadcrumbJsonLdString = JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c');

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJsonLdString }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdString }} />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* パンくず：フクエス › コラム › 記事タイトル */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
            フクエス
          </Link>
          <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
          <Link href="/column" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
            コラム
          </Link>
          <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
          <span aria-current="page" className="flex-1 min-w-0 truncate font-semibold text-pink-700">
            {article.title}
          </span>
        </nav>

        <article>
          {/* カテゴリバッジ → h1 → 日付 */}
          <div className="mb-3">
            <Link
              href={`/column/category/${article.category}`}
              className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200"
            >
              {mainArticleCategoryLabel(article.category)}
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug break-words">
            {article.title}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
            {article.publishedAt && <time dateTime={article.publishedAt}>公開: {formatColumnDate(article.publishedAt)}</time>}
            {showUpdated && article.updatedAt && (
              <time dateTime={article.updatedAt}>更新: {formatColumnDate(article.updatedAt)}</time>
            )}
          </div>

          {/* hero画像（16:9） */}
          {article.heroImageUrl && (
            <div className="mt-5 rounded-2xl overflow-hidden shadow-md border border-pink-100">
              <Image
                src={article.heroImageUrl}
                alt={article.title}
                width={1200}
                height={630}
                priority
                sizes="(max-width: 768px) 100vw, 768px"
                className="w-full h-auto aspect-video object-cover"
              />
            </div>
          )}

          {/* 本文（Markdown） */}
          <div className="mt-6">
            <ArticleBody body={article.body} />
          </div>

          {/* 著者表記 */}
          <div className="mt-10 rounded-2xl border border-pink-100 bg-pink-50/40 p-5 flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-pink-400 to-rose-500">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">{AUTHOR_NAME}</p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                福岡メンズエステポータルサイト「フクエス」の編集部です。メンズエステをもっと楽しむための情報をお届けします。
              </p>
            </div>
          </div>
        </article>

        {/* ── 内部リンクブロック（テンプレート側で自動挿入・記事本文には書かない） ── */}
        {/* 同カテゴリの他記事（最大3件・0件なら非表示） */}
        {related.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
              <h2 className="font-bold text-slate-900">同じカテゴリのコラム</h2>
            </div>
            <ul className="space-y-3">
              {related.map((a) => (
                <li key={a.id}>
                  <ArticleCard article={a} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* サロン探しへの導線：トップCTA＋エリアページ */}
        <section className="mt-10 rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
            <h2 className="font-bold text-slate-900">福岡のメンズエステを探す</h2>
          </div>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(to right,#ec4899,#f97316)' }}
          >
            店舗一覧を見る
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <div className="mt-4 flex flex-wrap gap-2">
            {areaLinks.map((area) => (
              <Link
                key={area}
                href={areaHref(area)}
                className="text-xs font-bold px-3 py-1.5 rounded-full border border-pink-200 text-pink-600 transition-colors hover:bg-pink-50"
              >
                {area === DISPATCH_AREA ? '出張対応' : areaLabel(area)}の店舗
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-8 text-center">
          <Link href="/column" className="text-sm text-slate-500 hover:text-pink-600 transition-colors">
            ← コラム一覧へ戻る
          </Link>
        </div>
      </main>
    </>
  );
}
