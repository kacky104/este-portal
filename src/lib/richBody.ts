// 駅ちか新着情報の本文（飾り付きの HTML）の、画面に依らない部分（第1966便・2026-11-12・カッキーさん「ベンリーと同じ機能を」）。
// ★ 純粋関数だけ（DOM を使わない）。DOM を使う掃除は components/RichBodyEditor.tsx の中。
//
// ★ 「全体の色」＝本文をまるごと包む1つの枠（背景の色と文字の色）。
//   駅ちかのお店ページは、お店ごとに地の色・文字の色が違う（オイルクエスト様は、白い地に白い文字＝色を付けていない本文は読めない）。
//   枠で背景と文字の色を決めておけば、どのお店ページでも同じに見える。
//   ★ 枠の書き方はこの1通りだけ（wrapRichBody が作る形）。読むとき（splitRichBody）も、この形だけを枠として扱う。

export type RichWrap = { bg: string; fg: string };

const HEX = /^#[0-9a-f]{6}$/i;
const WRAP_RE = /^<div style="background-color:(#[0-9a-f]{6});color:(#[0-9a-f]{6});padding:10px;">([\s\S]*)<\/div>$/i;

/** 中の <div> と </div> がつり合っているか（外側の枠の閉じが、本当に最後の </div> か） */
function divsBalanced(inner: string): boolean {
  let depth = 0;
  const re = /<(\/?)div\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** 本文を「全体の色の枠」と「中身」に分ける。枠が無ければ wrap は null */
export function splitRichBody(html: string): { wrap: RichWrap | null; inner: string } {
  const m = WRAP_RE.exec(html);
  if (!m || !divsBalanced(m[3])) return { wrap: null, inner: html };
  return { wrap: { bg: m[1].toLowerCase(), fg: m[2].toLowerCase() }, inner: m[3] };
}

/** 中身を「全体の色の枠」で包む。枠が無い・色が読めない・中身が空なら、中身のまま */
export function wrapRichBody(inner: string, wrap: RichWrap | null): string {
  if (!wrap || !HEX.test(wrap.bg) || !HEX.test(wrap.fg) || inner === '') return inner;
  return `<div style="background-color:${wrap.bg.toLowerCase()};color:${wrap.fg.toLowerCase()};padding:10px;">${inner}</div>`;
}

/** style の中身から、送らない書き方を落とす（inherit だらけの貼り付け・位置の指定・外の画像・危ない書き方） */
export function cleanStyleText(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!prop || !val) continue;
    if (!/^[a-z-]+$/.test(prop)) continue;
    if (/^(inherit|initial|unset|revert)$/i.test(val.replace(/\s*!important$/i, ''))) continue;
    if (/url\s*\(|expression\s*\(|javascript:|@import|[<>]/i.test(val)) continue;
    if (/^(position|top|left|right|bottom|z-index|user-select|-webkit-user-select|cursor|pointer-events|content|behavior)$/.test(prop)) continue;
    out.push(`${prop}:${val}`);
  }
  return out.join(';');
}

/** ソースの欄に出すとき、読みやすいように改行を入れる（保存するときは sourceToHtml で外す） */
export function htmlToSource(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '<br>\n').replace(/<\/(div|p|li|ul|ol|blockquote|h[1-6])>/gi, '</$1>\n').replace(/\n+$/, '');
}

/** ソースの欄の文字を、1行の HTML に戻す（改行は改行にならない。改行したい所は <br> か <div>） */
export function sourceToHtml(source: string): string {
  return source.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).join('');
}
