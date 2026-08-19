// Markdown 本文を <meta description>・OGP 用のプレーンテキストに落とす。
//
// なぜ必要か（2026-08-19 第24便）:
//   コラム詳細の description は「抜粋（excerpt）が空なら本文の先頭を使う」フォールバックを
//   持っているが、従来の truncatePlain は空白を畳むだけで Markdown 記法を落とさなかった。
//   本文は「## 見出し」で始まる決まりなので、抜粋を空のまま公開すると検索結果・SNSカードに
//   「## メンズエステはこんなところ **重要** …」のような記号つきの文字列がそのまま出る。
//   ここで記号だけを外し、読める日本語に戻してから切り詰める。
//
// 対応する記法は ArticleBody の ALLOWED（h2・h3・p・ul・ol・li・a・strong・em・blockquote・br）に
// 対応するものを中心に、保険としてコード・画像・水平線・HTMLコメントも落とす。
// ★ 記号を外すだけで、文章そのものは1文字も削らない（要約はしない）。

// コードフェンス（``` 〜 ```）を丸ごと落とす。
function stripFencedCode(md: string): string {
  return md.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, ' ');
}

// 行頭の記法（見出し・引用・リスト・水平線）を落とす。
function stripBlockMarkers(line: string): string {
  let s = line;
  // 水平線（--- / *** / ___）は行ごと消す。
  if (/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(s)) return '';
  // 引用は入れ子（>>）も含めて外す。
  s = s.replace(/^[ \t]*(?:>[ \t]?)+/, '');
  // 見出し（# 〜 ######）。閉じ側の # も外す。
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/, '').replace(/[ \t]+#+[ \t]*$/, '');
  // 箇条書き（- * +）と番号つき（1. 1)）。
  s = s.replace(/^[ \t]*[-*+][ \t]+/, '');
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/, '');
  return s;
}

// 行内の記法（画像・リンク・強調・インラインコード）を落とす。
function stripInlineMarkers(text: string): string {
  let s = text;
  // HTMLコメント。
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // 画像 ![alt](url) → alt（alt が空なら消える）。リンクより先に処理する。
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // リンク [text](url) → text。
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // インラインコード `code` → code。
  s = s.replace(/`+([^`]*)`+/g, '$1');
  // 強調 **text** / *text* / ***text***（記号だけ外す）。
  s = s.replace(/\*{1,3}/g, '');
  // アンダースコアの強調は、単語の中の _ を壊さないよう境界のあるものだけ外す。
  s = s.replace(/(^|[\s(（「『【"'])_{1,3}(?=\S)/g, '$1');
  s = s.replace(/(?<=\S)_{1,3}(?=[\s)）」』】"'.,、。!?！？]|$)/g, '');
  return s;
}

/** Markdown 本文を1行のプレーンテキストにする（切り詰めはしない）。 */
export function markdownToPlain(md: string | null | undefined): string {
  if (!md) return '';
  const lines = stripFencedCode(md).split(/\r?\n/).map(stripBlockMarkers);
  return stripInlineMarkers(lines.join('\n')).replace(/\s+/g, ' ').trim();
}

/**
 * Markdown 本文を description 用に max 字で切り詰める。
 * 切り詰めた場合は末尾に「…」を付ける（truncatePlain と同じ作法）。
 */
export function truncateMarkdown(md: string | null | undefined, max: number): string {
  const flat = markdownToPlain(md);
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
