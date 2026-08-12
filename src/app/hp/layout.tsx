// /hp/ 配下（掲載店舗の公式ホームページ）の共通レイアウト（2026-08-08 段階2）。
//
// フクエス本体のヘッダー・フッター・壁紙は一切載せない（店舗の独立したHPとして見せる）。
// 壁紙は components/Wallpaper.tsx の EXCLUDED_PREFIXES に '/hp/' を追加して除外済み。
// 背景・文字色はひな形（_templates/）が自分で塗る。
//
// 明朝体（しっぽり明朝）は styles.ts の TYPE_A 冒頭で CSS @import している（2026-08-08 磨き込み）。
// Android は端末に明朝が無いため、Webフォントなしだとひな形A（LUXE）がゴシックに化けてしまう。
// ※ next/font は使わない：ビルド時に Google Fonts へ接続できない環境（tsccheck 用サンドボックス）で
//   ビルドが落ちるため。@import 方式なら実行時にブラウザが取得する（display=swap 指定済み）。

export default function HpLayout({ children }: { children: React.ReactNode }) {
  // 額縁背景: /hp はひな形が自分の背景を塗るが、PCでひな形の最大幅より外側に見える領域は
  // ここの濃色が受け持つ（ひな形A/B/C いずれでも破綻しない無彩色）。
  // overflow-x-clip: ひな形が「額縁より外へ食い破る」演出（タイプAのヘッダー・ヒーロー全幅）で
  // 100vw を使うため、スクロールバーぶんの横はみ出しをここで受ける。
  // ★ overflow-x-hidden は不可（他方の軸が auto になり、sticky のトップバーが効かなくなる）。
  return <div className="min-h-screen bg-[#101014] overflow-x-clip">{children}</div>;
}
