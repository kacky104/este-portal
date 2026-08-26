import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPublishedArticles } from '@/app/lib/workArticles';
import { ArticleCard } from './ArticleCard';
import { CategoryChips } from './CategoryChips';
import { ColumnHeading } from './ColumnHeading';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';

// ISR：既存 /jobs 系公開ページと同じ10分。anon クライアント読取のみ＝cookie不使用で動的化しない。
export const revalidate = 600;

const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'セラピストのお仕事コラム';
// ★ 画面の説明文と <meta description> は同じ1本（2026-08-18 第23便）。本体コラムと同じ考え方。
//   4つのカテゴリ（働き方・お金・面接・業界知識）に触れて、すぐ下のチップと呼応させている。
const PAGE_DESC =
  '福岡のメンズエステで働くセラピストのための情報コラムです。仕事の内容と働き方、お給料のしくみ、面接・体験入店の流れ、業界のきほんまで、フクエスワーク編集部がまとめてお届けします。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/jobs/column' },
  openGraph: {
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    url: `${SITE_URL}/jobs/column`,
    siteName: 'フクエスワーク',
    type: 'website',
    images: [{ url: `${SITE_URL}/ogp-fukuwork.png` }],
  },
};

export default async function ColumnListPage() {
  // 記事一覧とヘッダー画像は互いに独立なので並列取得。
  // ★ ルックバナーはこのページから外した（2026-08-26 第36便・オーナー判断）。
  //   本体コラム（/column・/column/category/[key]）には残っている。
  const [articles, hero] = await Promise.all([
    fetchPublishedArticles(),
    fetchPageHero('jobs-column'),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › コラム */}
      {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエスワーク', path: '/jobs' },
        { name: 'コラム', path: '/jobs/column' },
      ])) }} />
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          コラム
        </span>
      </nav>

      {/* ページ別ヒーロー画像（/admin の「求人ページ別ヒーロー画像設定」→「お仕事コラム」から設定・
          未設定なら何も出ない）。contentMax は <main> の max-w-3xl と同じ 768。
          ★ 同じ画像をカテゴリ別一覧（/jobs/column/category/[key]）にも出している。文言や置き場所を
            変えるときは両方そろえること。 */}
      <PageHero url={hero} alt={PAGE_TITLE} fullBleedMobile contentMax={768} />

      {/* 見出し・説明文・カテゴリチップは中央寄せ（2026-08-18 第23便）。本体コラムと同じ作り。 */}
      <ColumnHeading title={PAGE_TITLE} description={PAGE_DESC} />

      <CategoryChips activeKey={null} />

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
          コラム記事は準備中です。
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
