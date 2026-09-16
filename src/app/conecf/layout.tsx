import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { conecfBaseFor } from '@/lib/conecfHost';
import { ConecfBaseProvider } from './ConecfBase';

// コネックエフ（conecf.com）の共通レイアウト（第395便・1a・2026-09-17・カッキーさん）。
//
// ★ 入口は conecf.com。src/proxy.ts が https://conecf.com/xxx → /conecf/xxx へ rewrite する。
// ★ 色はフクエスリンクの紺を引き継ぐ（カッキーさんの決定）。★ 地はブルーのテーマ壁紙（/mypage/media と同じ作り）。
// ★★ 表向きフクエスのサイトではないので、タイトル・OGP にフクエスの名前を出さない。
// ★ 管理画面なので検索に出さない。

export const metadata: Metadata = {
  title: { default: 'コネックエフ', template: '%s｜コネックエフ' },
  description: 'メンズエステ店舗向けの媒体一括更新ツール',
  robots: { index: false, follow: false },
  alternates: {},
  openGraph: { title: 'コネックエフ', siteName: 'コネックエフ', description: 'メンズエステ店舗向けの媒体一括更新ツール', images: [] },
  twitter: { card: 'summary', title: 'コネックエフ', images: [] },
};

export const dynamic = 'force-dynamic';

export default async function ConecfLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const base = conecfBaseFor(h.get('x-forwarded-host') ?? h.get('host'));

  const theme = getTheme('blue');
  const wallpapers = await fetchThemeWallpapers();
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgStyle = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
          backgroundAttachment: 'fixed' as const,
        }
      : {}),
  };

  return (
    <ConecfBaseProvider base={base}>
      <div className="min-h-screen" style={bgStyle}>{children}</div>
    </ConecfBaseProvider>
  );
}
