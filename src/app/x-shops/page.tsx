import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { VerifiedBadge } from '@/app/x/VerifiedBadge';
import { fetchShopShowcases } from '@/app/x/xShops';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';

const TITLE = '福岡メンズエステの承認店舗一覧｜フクエス';
const DESCRIPTION =
  '福岡メンズエステ専用SNS「fukuX」に参加する承認店舗の一覧です。各店のショーケース画像をまとめてチェックできます。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/x-shops' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/x-shops', siteName: 'フクエス', type: 'website' },
};

// ISR：10分ごとに再生成（並びは30分シードシャッフルなのでゆるめでOK）。
export const revalidate = 600;

export default async function XShopsPage() {
  // 青テーマ壁紙を固定レイヤーで敷く（/therapists と同方式）。ショップ・ヒーロー・壁紙を同時取得。
  const [shops, hero, wallpapers, adBanners] = await Promise.all([
    fetchShopShowcases(),
    fetchPageHero('xshops'),
    fetchThemeWallpapers(),
    fetchActiveAdBanners(),
  ]);
  const theme = getTheme('blue');
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
      {/* 背景：blue テーマ壁紙を固定レイヤーで敷く（サロン詳細/therapists と同方式）。 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgStyle} />
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <Breadcrumb current="fukuX承認店舗" currentColor={breadcrumbCurrentColor(theme.key)} />
        <PageHero url={hero} alt="SNS" fullBleedMobile />

        {/* Heading：カードを外し、青の壁紙背景に直接（神秘的なレイアウト・/therapists と同方式）。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-blue-500/80">FUKUES SNS</p>
          <h1 className="mt-2 text-xl sm:text-3xl font-black tracking-[0.06em] bg-gradient-to-r from-blue-700 via-sky-600 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(59,130,246,0.25)]">
            fukuX〜フクエックス〜承認店舗
          </h1>
          {shops.length > 0 && (
            <div className="mt-3">
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-white/80 px-2.5 py-0.5 text-xs font-bold text-blue-600">
                全{shops.length}件
              </span>
            </div>
          )}
          <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
          {/* 説明文（fukuXの説明。神秘的レイアウトの中央寄せで表示）。 */}
          <p className="mx-auto mt-4 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-600">
            「fukuX（フクエックス）」は、福岡のメンズエステに特化した専用SNS。ここに掲載しているのは運営が承認した店舗のみ。気になるお店をフォローすれば、割引や当日の空き状況、写メ日記などの最新情報をいち早く受け取れます。
          </p>
        </div>

        {/* 細い広告バナー（公開中からランダム1枚・ページを開くたびに入れ替わり） */}
        <AdBanner banners={adBanners} />

        {/* Shop list */}
        {shops.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-blue-100 rounded-3xl bg-blue-50/10">
            表示できるお店がまだありません
          </div>
        ) : (
          <div className="space-y-4">
            {shops.map((s) => (
              <Link
                key={s.id}
                href={`/x/u/${encodeURIComponent(s.handle)}`}
                className="block rounded-2xl shadow-sm border p-3 hover:shadow-md hover:brightness-110 transition-all"
                style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)', borderColor: '#7dd3fc' }}
              >
                {/* 店名＋アバター＋認証バッジ（このページ専用の青基調配色。fukuX本体の紫テーマは変えない） */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-9 h-9 rounded-full overflow-hidden border border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {s.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-sm">{s.displayName.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <span className="font-bold text-white truncate">{s.displayName}</span>
                  {s.isVerified && <VerifiedBadge kind="shop" />}
                </div>

                {/* 地域（x_profiles.address）。空なら非表示。 */}
                {s.address && (
                  <p className="text-xs mb-3 flex items-center gap-1" style={{ color: '#dbeafe' }}>📍{s.address}</p>
                )}

                {/* ショーケース画像（最大8枚・4列グリッド）。0枚ならグリッドごと非表示。 */}
                {s.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-0.5">
                    {s.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`${s.displayName}-${i + 1}`}
                        className="aspect-square w-full object-cover rounded-sm"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
