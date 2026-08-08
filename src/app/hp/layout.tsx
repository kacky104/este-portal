// /hp/ 配下（掲載店舗の公式ホームページ）の共通レイアウト（2026-08-08 段階2）。
//
// フクエス本体のヘッダー・フッター・壁紙は一切載せない（店舗の独立したHPとして見せる）。
// 壁紙は components/Wallpaper.tsx の EXCLUDED_PREFIXES に '/hp/' を追加して除外済み。
// 背景・文字色はひな形（_templates/）が自分で塗る。
export default function HpLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
