import type { Metadata } from 'next';
import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// 店舗ドメイン/admin（公式HPの管理画面）の共通レイアウト。
// 親の /hp/layout.tsx が暗い額縁背景を敷いているので、管理画面はここで明るい背景に戻す。
// 管理画面は絶対に検索へ出さない（店舗ドメインの robots.txt でも Disallow: /admin を出している）。
//
// ★★★ 2026-09-12（カッキーさんの指示）: 地の色を【レッドのテーマ壁紙】にした。
//   ★ マイページ本体＝シルバー、フクエスワーク＝グリーン、ここ＝レッド。
//     ★ 別の画面に居ることを、地の色だけで分かるようにする（★ フクエスワークと同じ考え）。
//   ★ 作りは /mypage/jobs/layout.tsx と同じ（theme_wallpapers の red ＋ theme.bg の85%不透明）。
//     ★ 壁紙が未設定なら、ただの地色（#ffe4e4）になる。★ 読めなくても画面は止めない。
//   ★ 色の正は lib/themes.ts の SALON_THEMES（★ ここで色を作らない）。

export const metadata: Metadata = {
  title: 'ホームページ管理',
  robots: { index: false, follow: false },
};

export default async function HpAdminLayout({ children }: { children: React.ReactNode }) {
  const theme = getTheme('red');
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

  return <div className="min-h-screen" style={bgStyle}>{children}</div>;
}
