import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPublishedMainArticles } from '@/app/lib/mainArticles';
import { ArticleCard } from './ArticleCard';
import { CategoryChips } from './CategoryChips';
import { ColumnHeading } from './ColumnHeading';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';

// ISR：本体公開ページと同じ10分。anon クライアント読取のみ＝cookie不使用で動的化しない。
export const revalidate = 600;

const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'メンズエステコラム';
// ★ 画面の説明文と <meta description> は同じ1本（2026-08-18 第23便）。
//   以前は画面が「福岡のメンズエステをもっと楽しむための情報コラム。」の一文だけ、
//   meta はそれとは別の文、と二重に持っていた。カテゴリ別ページと同じ「1か所」の作りにそろえる。
//   4つのカテゴリ（選び方・初めての方・マナー・用語）に触れておくと、
//   すぐ下のカテゴリチップと内容が呼応して、このページが何の入口なのかが伝わる。
const PAGE_DESC =
  '福岡のメンズエステをもっと楽しむための情報コラムです。お店の選び方、初めての方に向けた基礎知識、当日の楽しみ方とマナー、よく見かける用語の解説まで、フクエス編集部がまとめてお届けします。';

export const metadata: Metadata = {
  // 同一セグメントには layout の title.template が効かない（Next仕様）ためフルタイトルを明示。
  title: `${PAGE_TITLE}｜フクエス`,
  description: PAGE_DESC,
  alternates: { canonical: '/column' },
  openGraph: {
    title: `${PAGE_TITLE}｜フクエス`,
    description: PAGE_DESC,
    url: `${SITE_URL}/column`,
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: `${SITE_URL}/ogp.png` }],
  },
};

export default async function MainColumnListPage() {
  // 記事一覧・ヘッダー画像・ルックバナーは互いに独立なので並列取得。
  const [articles, hero, adBanners] = await Promise.all([
    fetchPublishedMainArticles(),
    fetchPageHero('column'),
    fetchActiveAdBanners(),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエス › コラム */}
      {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエス', path: '/' },
        { name: 'コラム', path: '/column' },
      ])) }} />
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
          フクエス
        </Link>
        <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
        <span aria-current="page" className="font-semibold text-pink-700">
          コラム
        </span>
      </nav>

      {/* ページ別ヒーロー画像（/admin の「ページ別ヒーロー画像設定」→「コラム」から設定・未設定なら何も出ない）。
          contentMax は <main> の max-w-3xl と同じ 768。ここを合わせないと、
          必要より大きい画像を取りに行ってスマホの通信量が無駄になる（PageHero のコメント参照）。
          ★ 同じ画像をカテゴリ別一覧（/column/category/[key]）にも出している。文言や置き場所を
            変えるときは両方そろえること。 */}
      <PageHero url={hero} alt={PAGE_TITLE} fullBleedMobile contentMax={768} />

      {/* 見出し・説明文・カテゴリチップは中央寄せ（2026-08-18 第23便）。
          中身は ColumnHeading が持つ＝カテゴリ別一覧と必ず同じ見た目になる。 */}
      <ColumnHeading title={PAGE_TITLE} description={PAGE_DESC} />

      <CategoryChips activeKey={null} />

      {/* ルックバナー（タブの下）。公開中からランダム1枚・0件なら非表示（2026-08-19 第24便）。
          ★ カテゴリ別一覧（/column/category/[key]）にも同じ2枠を置いてある。動かすときは4ページ
            （本体2・求人2）そろえること。保存の即時反映は /api/revalidate の adBanners 分岐が担う。 */}
      <AdBanner banners={adBanners} />

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-pink-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
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

      {/* ルックバナー（最後のコラムカードの下）。上の枠とは独立にランダム抽選
          （枚数が少ないと同じ枠になることもある・/salons と同じ作法）。 */}
      <AdBanner banners={adBanners} />
    </main>
  );
}
