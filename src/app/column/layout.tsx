import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// フクエス本体コラム（/column 配下）の共通シェル。
// 本体の他ページ（エリアページ等）と同じヘッダー構成＋シンプルなフッター。
// metadata の title.template は子セグメント（[slug]・category/[key]）にのみ適用される
// Next 仕様のため、/column トップは page.tsx 側でフルタイトルを明示する（/jobs layout と同方式）。
//
// 背景はホワイトテーマ＋テーマ壁紙（theme_wallpapers の white）。/salons のシルバーと同方式で、
// 壁紙の上に theme.bg の85%不透明（D9）を重ねて可読性を保つ（2026-08-07。従来は bg-slate-50 無地）。
// 壁紙の取得はこの layout で1回だけ行い、配下（一覧・記事・カテゴリ）すべてに効かせる。

export const metadata: Metadata = {
  title: {
    default: 'メンズエステコラム｜フクエス',
    template: '%s｜フクエス',
  },
};

export default async function ColumnLayout({ children }: { children: React.ReactNode }) {
  const theme = getTheme('white');
  const wallpapers = await fetchThemeWallpapers();
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
    <div className="min-h-screen text-slate-900 flex flex-col" style={bgStyle}>
      {/* ─── Header（本体共通構成） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <div className="flex-1">{children}</div>

      {/* ─── Footer（本体共通・ロゴ＋サイト名つき） ─── */}
      <SiteFooter inner="max-w-5xl" showBrand />
    </div>
  );
}
