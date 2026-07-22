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
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { getTheme } from '@/app/lib/themes';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';

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
  // 新着情報50件・ヒーロー画像・テーマ壁紙を並列取得（未設定はそれぞれ非表示／無地）。
  const [items, hero, wallpapers, adBanners] = await Promise.all([
    fetchLatestSalonNews(supabase, 50),
    fetchPageHero('news'),
    fetchThemeWallpapers(),
    fetchActiveAdBanners(),
  ]);

  // gold テーマ壁紙を固定レイヤーで敷く（/reviews・/x-shops と同方式）。
  const theme = getTheme('gold');
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgStyle = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
        }
      : {}),
  };

  return (
    <div className="min-h-screen text-slate-900">
      {/* 背景：gold テーマ壁紙を固定レイヤーで敷く */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgStyle} />
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

      <main className="max-w-4xl mx-auto px-4 py-8">
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

        {/* Heading：カードを外し、ゴールドの壁紙背景に直接（神秘的なレイアウト・/reviews と同方式）。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-amber-600/80">FUKUES NEWS</p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-black tracking-[0.06em] bg-gradient-to-r from-amber-700 via-yellow-500 to-amber-700 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(202,158,42,0.3)]">
            店舗新着情報
          </h1>
          <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-amber-500/70 to-transparent" />
          {/* 説明文（2段落でボリュームを持たせる） */}
          <p className="mx-auto mt-4 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-600">
            福岡のメンズエステ各店から届いた最新のお知らせを新着順で掲載しています。
            新人セラピストの入店速報、期間限定の割引・イベント、本日の出勤情報など、お店の「今」がひと目でわかります。
          </p>
          <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-600">
            気になるお知らせをタップすると各店舗のページへ。料金メニューや口コミ、写メ日記もあわせてチェックできます。
          </p>
        </div>

        {/* 細い広告バナー（公開中からランダム1枚・ページを開くたびに入れ替わり） */}
        <AdBanner banners={adBanners} />

        {items.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-400 rounded-3xl border border-dashed border-amber-200 bg-amber-50/20">
            新着情報はまだありません
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sm:p-5">
            <SalonNewsList items={items} />
          </div>
        )}
      </main>
    </div>
  );
}
