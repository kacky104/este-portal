// /embed/ 配下（iframe 埋め込みウィジェット）の共通レイアウト（2026-08-06 新設）。
//
// サイト共通の body 背景は薄いグレー（globals.css の #f8fafc）。iframe の高さが
// 中身より大きいと余白にこのグレーが見えてしまう（白背景の公式サイトに貼ると
// 「灰色の空白」になる）ため、埋め込みページは常に画面いっぱい白で塗りつぶす。
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
