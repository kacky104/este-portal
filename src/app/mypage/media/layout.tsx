import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// フクエスリンク（/mypage/media 配下）の地の色（第296便・2026-09-12・カッキーさんの指示）。
//
// ★★ 地の色だけで「いまどの画面に居るか」が分かるようにする、という決めごとの続き。
//   ★ マイページ本体＝シルバー／フクエスワーク＝グリーン／公式HP管理＝レッド／ここ＝【ブルー】。
// ★ 作りは /mypage/jobs/layout.tsx・/hp/[slug]/admin/layout.tsx と同じ
//   （theme_wallpapers の blue ＋ theme.bg の85%不透明）。
//   ★ 壁紙が未設定なら、ただの地色（#f0f5ff）になる。★ 読めなくても画面は止めない。
// ★ 色の正は lib/themes.ts の SALON_THEMES（★ ここで色を作らない）。
// ★ ログインの見張りは親（/mypage/layout.tsx）が済ませているので、ここでは見ない。

export default async function MypageMediaLayout({ children }: { children: React.ReactNode }) {
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

  return <div className="min-h-screen" style={bgStyle}>{children}</div>;
}
