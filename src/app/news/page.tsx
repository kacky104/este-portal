import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchLatestSalonNews } from '@/app/lib/salonNews';
import { SalonNewsList } from '@/app/components/SalonNewsList';

// 全サロン横断の新着情報一覧（トップ「サロン新着情報」の「もっと見る」先）。最新50件・ページングなし。
// 件数が増えてページングが必要になったら limit+offset か published_at カーソルで拡張する。

export const revalidate = 600;

export const metadata = {
  title: 'サロン新着情報｜フクエス - 福岡メンズエステポータル',
  description: '福岡のメンズエステサロンの最新お知らせ一覧。新人入店・イベント・割引情報などサロンの新着情報をまとめてチェックできます。',
};

export default async function SalonNewsIndexPage() {
  const supabase = createPublicClient();
  const items = await fetchLatestSalonNews(supabase, 50);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ─── Header（トップと同一構成） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* パンくずリスト：トップ › サロン新着情報 */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap text-pink-500">
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0 text-slate-400">
            ›
          </span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap font-semibold text-slate-600">
            サロン新着情報
          </span>
        </nav>

        {/* 見出しはトップのブロックと同じグラデ帯（角丸なし＝直角方針） */}
        <div className="px-4 py-2 mb-1.5" style={{ background: 'linear-gradient(to right, #f97316, #ec4899)' }}>
          <h1 className="text-xl font-bold text-white leading-none" style={{ transform: 'translateY(1px)' }}>
            サロン新着情報
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
