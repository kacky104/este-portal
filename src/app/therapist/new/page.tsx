import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchNewFaceTherapists } from '@/app/lib/newFaceTherapists';
import { NewFaceList } from './NewFaceList';
import type { Metadata } from 'next';

// 新人セラピスト一覧ページ（トップ「新人セラピスト一覧」の「一覧を見る →」先）。/working の構成に倣う。
// 新人リストは変動が遅い（30日ウィンドウ）ため ISR（10分）と相性が良い。全件を新しい順で表示。
// 静的セグメント "new" は動的 /therapist/[id] より優先されるため衝突しない（実IDは "new" と非衝突）。
export const revalidate = 600;

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。
const NEWFACE_TITLE = '新人セラピスト一覧｜福岡メンズエステ【フクエス】';
const NEWFACE_DESCRIPTION =
  '福岡のメンズエステに新しく入店した新人セラピスト一覧。博多・天神・北九州・久留米など福岡全域の新人情報をフクエスでチェックできます。';

export const metadata: Metadata = {
  title: NEWFACE_TITLE,
  description: NEWFACE_DESCRIPTION,
  alternates: { canonical: '/therapist/new' },
  openGraph: {
    title: NEWFACE_TITLE,
    description: NEWFACE_DESCRIPTION,
    url: '/therapist/new',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: NEWFACE_TITLE,
    description: NEWFACE_DESCRIPTION,
    images: ['/ogp.png'],
  },
};

export default async function NewFacePage() {
  const supabase = createPublicClient();
  // 緑テーマ壁紙を固定レイヤーで敷く（/therapists と同方式）。新人一覧・ヒーロー・壁紙を同時取得。
  const [therapists, hero, wallpapers] = await Promise.all([
    fetchNewFaceTherapists(supabase), // limit 無指定＝全件
    fetchPageHero('newface'),
    fetchThemeWallpapers(),
  ]);
  const theme = getTheme('green');
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
      {/* 背景：green テーマ壁紙を固定レイヤーで敷く（サロン詳細/therapists と同方式）。 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Back link */}
        <Breadcrumb current="新人セラピスト一覧" currentColor={breadcrumbCurrentColor(theme.key)} />
        <PageHero url={hero} alt="新人セラピスト" fullBleedMobile />

        {/* Heading：神秘的レイアウト（緑）・/therapists と同方式。壁紙背景の上に直接。 */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-emerald-500/80">FUKUES NEWFACE</p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-black tracking-[0.06em] bg-gradient-to-r from-emerald-600 via-green-500 to-lime-500 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(16,185,129,0.25)]">
            新人セラピスト一覧
          </h1>
          <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
          <p className="mx-auto mt-4 max-w-md text-xs sm:text-sm leading-relaxed text-slate-600">
            入店から1ヶ月以内のフレッシュな新人セラピストをご紹介<br />福岡全域から、デビューした新しい出会いを新着順でチェック
          </p>
        </div>

        <NewFaceList therapists={therapists} />
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
