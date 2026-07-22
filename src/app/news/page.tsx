import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchLatestSalonNews } from '@/app/lib/salonNews';
import { SalonNewsList } from '@/app/components/SalonNewsList';
import type { Metadata } from 'next';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';

// 全サロン横断の新着情報一覧（トップ「サロン新着情報」の「もっと見る」先）。最新50件・ページングなし。
// 件数が増えてページングが必要になったら limit+offset か published_at カーソルで拡張する。

export const revalidate = 600;

// 自己参照 canonical を明示（root の canonical '/' 継承による重複扱いを防ぐ）。
// openGraph は浅いマージで root の og が丸ごと消えるため必要項目を全て明示。
const NEWS_TITLE = '店舗新着情報｜フクエス - 福岡メンズエステポータル';
const NEWS_DESCRIPTION =
  '福岡のメンズエステ店舗の最新お知らせ一覧。新人入店・イベント・割引情報など店舗の新着情報をまとめてチェックできます。';

export const metadata: Metadata = {
  title: NEWS_TITLE,
  description: NEWS_DESCRIPTION,
  alternates: { canonical: '/news' },
  openGraph: {
    title: NEWS_TITLE,
    description: NEWS_DESCRIPTION,
    url: '/news',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: NEWS_TITLE,
    description: NEWS_DESCRIPTION,
    images: ['/ogp.png'],
  },
};

export default async function SalonNewsIndexPage() {
  const supabase = createPublicClient();
  // 新着情報50件とヒーロー画像を並列取得（ヒーロー未設定は null＝非表示）。
  const [items, hero] = await Promise.all([
    fetchLatestSalonNews(supabase, 50),
    fetchPageHero('news'),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ─── Header（トップと同一構成） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon />
            <NotificationBell />
            <AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* パンくずリスト：トップ › サロン新着情報 */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap text-pink-500">
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0 text-slate-400">
            ›
          </span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap font-semibold text-slate-600">
            店舗新着情報
          </span>
        </nav>

        {/* ページ別ヒーロー画像（/admin のページ別ヒーロー画像設定「新着情報」から設定・未設定は非表示） */}
        <PageHero url={hero} alt="新着情報" fullBleedMobile />

        {/* 見出しはトップのブロックと同じグラデ帯（角丸なし＝直角方針） */}
        <div className="px-4 py-1.5 mb-1 flex items-center gap-2.5" style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          <h1 className="text-xl font-bold text-slate-600 leading-none">
            店舗新着情報
          </h1>
        </div>
        <p className="text-xs text-slate-400 mb-4">最新50件を表示しています</p>

        {items.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400 rounded-2xl border border-slate-200 bg-white">
            新着情報はまだありません
          </div>
        ) : (
          <SalonNewsList items={items} />
        )}
      </main>
    </div>
  );
}
