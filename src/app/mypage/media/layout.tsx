import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// フクエスリンク（/mypage/media 配下）の地の色（第296便・2026-09-12・カッキーさんの指示）。
//
// ★★ 地の色だけで「いまどの画面に居るか」が分かるようにする、という決めごとの続き。
//   ★ マイページ本体＝シルバー／フクエスワーク＝グリーン／公式HP管理＝レッド／ここ＝【イエロー】（第674便）。
// ★ 作りは /mypage/jobs/layout.tsx・/hp/[slug]/admin/layout.tsx と同じ
//   （theme_wallpapers の yellow ＋ theme.bg の85%不透明・第674便で blue から）。
//   ★ 壁紙が未設定なら、ただの地色（#f0f5ff）になる。★ 読めなくても画面は止めない。
// ★ 色の正は lib/themes.ts の SALON_THEMES（★ ここで色を作らない）。
// ★ ログインの見張りは親（/mypage/layout.tsx）が済ませているので、ここでは見ない。

const FUKUES_LINK_COLORS = {
  '--color-indigo-50': '#fffbeb',
  '--color-indigo-100': '#fef3c7',
  '--color-indigo-200': '#fde68a',
  '--color-indigo-300': '#fcd34d',
  '--color-indigo-400': '#f59e0b',
  '--color-indigo-500': '#d97706',
  '--color-indigo-600': '#b45309',
  '--color-indigo-700': '#92400e',
  '--color-indigo-800': '#78350f',
  '--color-indigo-900': '#451a03',
} as React.CSSProperties;

export default async function MypageMediaLayout({ children }: { children: React.ReactNode }) {
  // ★★ 第674便（2026-09-22・カッキーさんの指示）: フクエスリンクは【黄色】を基調に（★ ブルー → イエロー）。
  //   ★ コネックエフ（紺）と見分けがつくように。★ 地の色は lib/themes.ts の yellow。
  const theme = getTheme('yellow');
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

  // ★★ 第674便: 画面の中の indigo（ボタン・左の並び・見出しの色）を、この中だけ琥珀色に置き換える。
  //   ★ Tailwind v4 の色は CSS 変数（--color-indigo-600 など）を読むので、ここで変数を上書きすれば全部の部品が黄色系になる。
  //   ★ 部品（MediaShell・MediaHome など）はコネックエフと共用なので、クラス名は書き換えない（★ コネックエフは紺のまま）。
  //   ★ 白い文字を載せる 600・700 は濃いめの琥珀（白文字が読める濃さ）。
  return <div className="min-h-screen" style={{ ...bgStyle, ...FUKUES_LINK_COLORS }}>{children}</div>;
}
