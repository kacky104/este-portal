import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchPublishedMainArticles } from '@/app/lib/mainArticles';
import { ArticleCard } from './ArticleCard';
import { CategoryChips } from './CategoryChips';

// ISR：本体公開ページと同じ10分。anon クライアント読取のみ＝cookie不使用で動的化しない。
export const revalidate = 600;

const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'メンズエステコラム';
const PAGE_DESC =
  '福岡のメンズエステをもっと楽しむための選び方ガイド・初めての方向けガイド・マナー・用語解説のコラム。フクエス編集部がお届けします。';

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
  const articles = await fetchPublishedMainArticles();

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエス › コラム */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
          フクエス
        </Link>
        <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
        <span aria-current="page" className="font-semibold text-pink-700">
          コラム
        </span>
      </nav>

      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">{PAGE_TITLE}</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          福岡のメンズエステをもっと楽しむための情報コラム。
        </p>
      </header>

      <CategoryChips activeKey={null} />

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
    </main>
  );
}
