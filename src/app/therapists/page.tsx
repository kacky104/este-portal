import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { NotificationBell } from '@/app/components/NotificationBell';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { TherapistSearch } from '@/app/components/TherapistSearch';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { POPULAR_BADGES, badgeToSlug } from '@/lib/therapistBadgeSlugs';
import { getBadgeColors } from '@/lib/therapistBadges';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { fetchTherapistPool } from '@/app/lib/therapistPool';
import { thirtyMinSeed } from '@/lib/shuffle';

const TITLE = '特徴からセラピストを探す｜福岡メンズエステ【フクエス】';
const DESCRIPTION =
  '福岡のメンズエステのセラピストを「特徴バッジ」やエリアで絞り込み検索。癒し系・妹系・密着施術など、好みに合うセラピストを見つけられます。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/therapists' },
  // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
  // （og:image も消える）。そのため images まで全て明示する。
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/therapists',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/ogp.png'] },
};

// ISR：ヒーロー画像・テーマ壁紙（purple）を反映するため定期再生成する。
export const revalidate = 300;

export default async function TherapistsPage() {
  const [hero, wallpapers, adBanners, pool] = await Promise.all([
    fetchPageHero('therapists'),
    fetchThemeWallpapers(),
    fetchActiveAdBanners(),
    // 全アクティブセラピストをサーバーで取得し、初期HTMLに全カード（リンク）を焼き込む（2026-08-05）。
    fetchTherapistPool({ activeOnly: true }),
  ]);
  // シャッフルseedもサーバーで確定（SSRとhydrationの並び不一致を防ぐ。ISR再生成ごとに更新）。
  const listSeed = thirtyMinSeed();
  // ランキングと同じ方式：purple テーマ壁紙をテーマ色の半透明オーバーレイ越しに敷く。
  const theme = getTheme('purple');
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
      {/* 背景：purple テーマ壁紙を固定レイヤーで敷く（サロン詳細と同方式・モバイルの fixed 無視対策）。 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgStyle} />
      {/* シンプルヘッダー */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Breadcrumb current="特徴からセラピストを探す" currentColor={breadcrumbCurrentColor(theme.key)} />
        <PageHero url={hero} alt="特徴で探す" fullBleedMobile />
        {/* タイトル＋説明：カードを外し、紫の壁紙背景に直接（神秘的なレイアウト）。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-fuchsia-500/80">FUKUES THERAPIST</p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-black tracking-[0.06em] bg-gradient-to-r from-purple-700 via-fuchsia-600 to-violet-700 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(168,85,247,0.25)]">
            特徴からセラピストを探す
          </h1>
          <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-purple-400/70 to-transparent" />
          <p className="mx-auto mt-4 max-w-md text-xs sm:text-sm leading-relaxed text-slate-600">
            癒し系・妹系・密着施術など、好みの特徴やエリアで<br />福岡のメンズエステセラピストを絞り込み検索
          </p>
        </div>

        {/* 細い広告バナー（公開中からランダム1枚・ページを開くたびに入れ替わり） */}
        <AdBanner banners={adBanners} />

        {/* 人気の特徴から探す：バッジ別ランディングページ（/therapists/badge/[slug]）への内部リンク。
            サーバー描画の <Link> なのでクローラに辿られ、各ランディングの発見性・評価を底上げする。 */}
        <nav aria-label="人気の特徴から探す" className="mb-6">
          <p className="text-xs font-bold text-purple-700 mb-2">人気の特徴から探す</p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_BADGES.map((label) => {
              const slug = badgeToSlug(label);
              if (!slug) return null;
              const c = getBadgeColors(label);
              return (
                <Link
                  key={label}
                  href={`/therapists/badge/${slug}`}
                  className="px-3 py-1 rounded-full text-xs font-bold border hover:opacity-80 transition-opacity"
                  style={c ? { background: c.fill, color: c.text, borderColor: c.border } : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* サーバー取得の initialList を渡してSSR描画（フィルタ復元はマウント後の location 読み取り。
            useSearchParams をやめたので Suspense 境界は不要になった：2026-08-05）。 */}
        <TherapistSearch initialList={pool.list} initialSalonAreaMap={pool.salonAreaMap} initialSeed={listSeed} />
        {/* ルックバナー（ページ下部）。上部の枠とは独立にランダム抽選。 */}
        <AdBanner banners={adBanners} />
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
