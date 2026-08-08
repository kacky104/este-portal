// 複数のリンクバナータグを1本の貼り付けスニペットにまとめる（/banner・/jobs/banner・/mypage 共用）。
//
// 貼り先は店舗様の公式サイトのサイドバー／フッターの「カスタムHTML」ウィジェットが大半なので、
//   ・縦積み（幅の狭い場所でも崩れない）
//   ・左寄せ・8px間隔
//   ・先方サイトのCSSに一切依存しないようインラインスタイルで完結
// を満たす <div> で包む。並びやレイアウトを変えるときはこの1関数だけ直せば3ページに反映される。
//
// ※ 個別タグ側（<a><img></a>）の組み立ては各ページの bannerTag() が持つ（URL・ファイル名の一元管理）。
export function bannerStackSnippet(tags: readonly string[]): string {
  return [
    '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start;">',
    ...tags,
    '</div>',
  ].join('\n');
}
