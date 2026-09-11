import Link from 'next/link';
import type { Metadata } from 'next';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchLatestWorkNews, WORK_NEWS_FEED_MAX } from '@/app/lib/workNewsFeed';
import { WorkNewsFeedList } from '@/app/jobs/WorkNewsFeedList';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// 全店舗を横断した「店舗新着情報」の一覧（/jobs トップのブロックの「もっと見る」先）。
// ★ 最新 50 件・ページングなし（★ 51件目は出さない・2026-09-11 カッキーさんの指示）。
// ★ 1行タップで【その店の求人詳細】へ（/jobs/<求人ID>）。
// ★ トップのブロックと違い、ここは【間引かない】。★ 同じ店が続いても、履歴を見に来る場所なので出す。
//
// ★★ URL について: /jobs/news は静的な区切りなので、/jobs/[id]（求人詳細）より先に一致する。
//   ★ 店舗ごとの新着ページ（/jobs/<求人ID>/news/<ページ>）とは別物。混ぜないこと。

export const revalidate = 600;

const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = '店舗新着情報';
const PAGE_DESC =
  '福岡のメンズエステ求人の新着情報一覧。掲載店舗からのお知らせ（新人入店・体験入店・待遇の更新など）をまとめてチェックできます。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/jobs/news' },
  openGraph: {
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    url: `${SITE_URL}/jobs/news`,
    siteName: 'フクエスワーク',
    type: 'website',
    images: [{ url: `${SITE_URL}/ogp-fukuwork.png` }],
  },
};

export default async function WorkNewsIndexPage() {
  const supabase = createPublicClient();
  const items = await fetchLatestWorkNews(supabase, WORK_NEWS_FEED_MAX);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › 店舗新着情報 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエスワーク', path: '/jobs' },
        { name: PAGE_TITLE, path: '/jobs/news' },
      ])) }} />
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          {PAGE_TITLE}
        </span>
      </nav>

      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h1 className="font-bold text-slate-900">{PAGE_TITLE}</h1>
      </div>

      {items.length === 0 ? (
        <div className="border border-emerald-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
          新着情報はまだありません。
        </div>
      ) : (
        <WorkNewsFeedList items={items} />
      )}
    </main>
  );
}
