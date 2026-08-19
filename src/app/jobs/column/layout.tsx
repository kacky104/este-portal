import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// 求人コラム（/jobs/column 配下）の背景レイヤー（2026-08-19 第24便）。
// 本体コラム layout.tsx（ホワイトテーマ＋壁紙）の【グリーンテーマ版】。
//
// ★ ヘッダー・フッター・metadata はこのファイルでは持たない。
//   それらは親の /jobs/layout.tsx（フクエスワーク共通シェル）のまま＝ここは背景を敷くだけ。
//   ここにヘッダーを足すと二重ヘッダーになる。
//
// ★ 壁紙は theme_wallpapers の green（/admin「テーマ壁紙設定」で設定・未設定なら無地の
//   グリーンテーマ背景 #f0fdf4）。本体コラムと同じく theme.bg の85%不透明（D9）を重ねて
//   記事カード・文字の可読性を保つ。係数を変えるときは本体 /column/layout.tsx とそろえること。
//
// ★ min-h-screen は「記事が短いページで壁紙が途切れ、親の無地グラデが見える」のを防ぐため。
//   外すと一覧0件時などに背景が二段に見える。

export default async function JobsColumnLayout({ children }: { children: React.ReactNode }) {
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
        }
      : {}),
  };

  return (
    <div className="min-h-screen" style={bgStyle}>
      {children}
    </div>
  );
}
