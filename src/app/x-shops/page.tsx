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
import { fetchShopShowcases, fetchVerifiedTherapists } from '@/app/x/xShops';
import { XShopsTabs } from './XShopsTabs';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';

const TITLE = '福岡メンズエステの承認店舗一覧【フクエス】';
const DESCRIPTION =
  '福岡メンズエステ専用SNS「fukuX」に参加する承認店舗の一覧です。各店のショーケース画像をまとめてチェックできます。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/x-shops' },
  // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
  // （og:image も消える）。そのため images まで全て明示する。
  // /x-shops は /x 配下ではなく root layout 側なので、画像は本体の /ogp.png に揃える。
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/x-shops',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/ogp.png'] },
};

// ISR：10分ごとに再生成（並びは30分シードシャッフルなのでゆるめでOK）。
export const revalidate = 600;

export default async function XShopsPage() {
  // 青テーマ壁紙を固定レイヤーで敷く（/therapists と同方式）。ショップ・ヒーロー・壁紙を同時取得。
  // ★ 第941便: 認証セラピスト（赤バッジ）も同時に取る。★ 読めなくても店舗タブは出す（空配列）。
  const [shops, therapists, hero, wallpapers, adBanners] = await Promise.all([
    fetchShopShowcases(),
    fetchVerifiedTherapists().catch(() => []),
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
        <PageHero url={hero} alt="SNS" fullBleedMobile contentMax={768} />

        {/* Heading：カードを外し、青の壁紙背景に直接（神秘的なレイアウト・/therapists と同方式）。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-blue-500/80">FUKUES SNS</p>
          <h1 className="mt-2 text-xl sm:text-3xl font-black tracking-[0.06em] bg-gradient-to-r from-blue-700 via-sky-600 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(59,130,246,0.25)]">
            fukuX〜フクエックス〜承認店舗
          </h1>
          {/* ★ 第941便: 件数（全n件）はタブの名前に入れた */}
          <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
          {/* 説明文（fukuXの説明。神秘的レイアウトの中央寄せで表示）。 */}
          <p className="mx-auto mt-4 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-600">
            「fukuX（フクエックス）」は、福岡のメンズエステに特化した専用SNS。ここに掲載しているのは運営が承認した店舗のみ。気になるお店をフォローすれば、割引や当日の空き状況、写メ日記などの最新情報をいち早く受け取れます。
          </p>
        </div>

        {/* 細い広告バナー（公開中からランダム1枚・ページを開くたびに入れ替わり） */}
        <AdBanner banners={adBanners} />

        {/* ★ 第941便: 承認店舗／認証セラピスト の切り替えタブ（人気ランキングと同じ形） */}
        <XShopsTabs
          shopCount={shops.length}
          therapistCount={therapists.length}
          colors={{ heading: theme.heading, body: theme.body, card: theme.card, cardBorder: theme.cardBorder }}
          therapists={
            <>
            {/* ★ 第942便（カッキーさん）: タブ名を「赤バッジセラピスト」に＋赤バッジの説明を1行 */}
            <p className="mb-4 flex items-center justify-center gap-1.5 text-center text-xs sm:text-sm leading-relaxed text-slate-600">
              <VerifiedBadge kind="therapist" size={16} />
              <span>赤バッジは、fukuX（フクエックス）で活躍しているセラピストに付与されるバッジです。</span>
            </p>
            {therapists.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-blue-100 rounded-3xl bg-blue-50/10">
                赤バッジセラピストはまだいません
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {therapists.map((t) => (
                  <Link
                    key={t.id}
                    href={`/x/u/${encodeURIComponent(t.handle)}`}
                    className="block rounded-2xl overflow-hidden bg-white border border-blue-100 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="aspect-square w-full bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center">
                      {t.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.avatarUrl} alt={t.displayName} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-blue-400 font-bold text-3xl">{t.displayName.charAt(0) || '?'}</span>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-bold text-[14px] text-slate-800 truncate">{t.displayName}</span>
                        <VerifiedBadge kind="therapist" />
                        {t.age != null && <span className="flex-none text-[12px] text-slate-500">（{t.age}）</span>}
                      </div>
                      {t.shopName && <p className="mt-0.5 text-[11px] text-slate-500 truncate">{t.shopName}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
            </>
          }
          shops={
        shops.length === 0 ? (
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
        )
          }
        />
        {/* ルックバナー（ページ下部）。上部の枠とは独立にランダム抽選。 */}
        <AdBanner banners={adBanners} />
      </main>

      {/* Footer */}
      <SiteFooter inner="max-w-3xl" />
    </div>
  );
}
