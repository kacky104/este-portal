// 埋め込みウィジェット（/embed/salon/[id]/*）の共通定数・部品（2026-08-06 新設）。
//
// 埋め込みページの共通ルール:
//  - 白基調ニュートラル（埋め込み先の公式サイトのデザインを邪魔しない。ピンクはリンク程度）
//  - リンクは必ず「絶対URL＋target="_blank"」（iframe 内で相対リンクを踏むと枠内でフクエスが開く）
//  - サイト共通のヘッダー/フッター/壁紙は載せない（Wallpaper は /embed/ を除外済み）
//  - noindex（本体ページが正規。各 page.tsx の metadata で指定）
//  - iframe 許可は next.config.ts の headers() で /embed/ 配下のみ frame-ancestors 全許可

// 埋め込みは外部サイトに貼られるため、リンクは常に本番の絶対URLにする。
export const EMBED_SITE_URL = 'https://fukues.com';
// ※ revalidate は各 page.tsx にリテラルで 600 と書く（Next の制約で定数 import 不可）。

/** 「もっと見る」リンク＋Powered by フクエス の共通フッター。 */
export function EmbedFooter({ moreHref, moreLabel }: { moreHref: string; moreLabel: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <a
        href={moreHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-bold text-pink-500 hover:text-pink-600"
      >
        {moreLabel} →
      </a>
      <a
        href={EMBED_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-slate-400 hover:text-slate-500"
      >
        Powered by フクエス
      </a>
    </div>
  );
}
