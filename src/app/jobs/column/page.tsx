import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPublishedArticles } from '@/app/lib/workArticles';
import { ArticleCard } from './ArticleCard';
import { CategoryChips } from './CategoryChips';

// ISR：既存 /jobs 系公開ページと同じ10分。anon クライアント読取のみ＝cookie不使用で動的化しない。
export const revalidate = 600;

const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'セラピストのお仕事コラム';
const PAGE_DESC =
  '福岡のメンズエステで働くための働き方ガイド・お金/給料・面接対策・業界知識のコラム。フクエスワーク編集部がセラピストのお仕事に役立つ情報をお届けします。';

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
  const articles = await fetchPublishedArticles();

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › コラム */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          コラム
        </span>
      </nav>

      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">{PAGE_TITLE}</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          福岡のメンズエステで働くセラピストのための情報コラム。
        </p>
      </header>

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
