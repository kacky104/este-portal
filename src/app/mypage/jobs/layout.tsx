import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// フクエスワーク（/mypage/jobs 配下）の地の色（第220便・2026-09-08・カッキーさんの指示）。
//
// ★★ /mypage 本体はシルバーのテーマ壁紙。★ ここは【グリーン】のテーマ壁紙にして、
//   別サイトであることを地の色でも分かるようにする。
// ★ 作りは /mypage/layout.tsx と同じ（theme_wallpapers の green＋theme.bg の85%不透明）。
//   ★ 壁紙が未設定なら、ただの地色（#f0fdf4）になる。★ 読めなくても画面は止めない。
// ★ ログインの見張りは親（/mypage/layout.tsx）が済ませているので、ここでは見ない。

export default async function MypageJobsLayout({ children }: { children: React.ReactNode }) {
  const theme = getTheme('green');
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
