// 求人コラム（/jobs/column 配下）の背景（2026-08-19 第24便）。
// ★ 第502便: フクエスワーク全体（/jobs/layout.tsx）が テーマ壁紙の green を敷くようになったので、
//   ここでは重ねない（重ねると壁紙が二重に薄まる）。★ 中身をそのまま通すだけ。
// ★ ヘッダー・フッター・metadata は親の /jobs/layout.tsx のまま＝ここに足すと二重になる。

export default function JobsColumnLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
