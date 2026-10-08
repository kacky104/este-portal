// 文字の飾り（色・大きさ・太字）の「印」。★ 純粋関数だけ。通信もDBも触らない。
//   第1320便（2026-10-08）でココア店長ブログ用に作り、第1321便で駅ちか新着情報でも使うため、ここへ出した。
//
// ★★ なぜ「印」で持つか
//   本文欄は文字だけ。店舗様にタグを打ってもらうのは難しいので、本文には [赤]…[/赤] のような短い印で入れ、
//   送るときに相手サイトへ通る形のタグへ置き換える。画面のボタンは、選んだ文字の前後にこの印を足すだけ。
//
// ★★★ 相手サイトごとに、通るタグの書き方が違う（どちらもラビリンス様の試し投稿で確かめた・2026-10-08）
//   ・ココア（メールで投稿）… 属性の値を " で囲むと、メールの入口で壊れる → 囲まない（quote: false）
//   ・駅ちか新着情報（管理画面のフォームへ書く）… " で囲んだ形がそのまま載る。囲まない形も通る → 囲む（quote: true）
//
// ★ 対にならない印（[赤] だけ・[/赤] だけ）は、置き換えずに文字のまま残す（＝見え方の確認で気づける。壊れたタグを送らない）。
// ★ 中身が空の印（[赤][/赤]）は捨てる。

export type TextMarkKind = 'color' | 'size' | 'bold';
export type TextMark = { key: string; kind: TextMarkKind; css: string | null };

/** 使える飾り。★ key が本文に入る印の名前（[赤]…[/赤]）。色を足すときは、ここに1行足すだけ（ボタン・送る形・見え方が全部ここから作られる） */
export const TEXT_MARKS: readonly TextMark[] = [
  { key: '赤', kind: 'color', css: 'color:#FF0000' },
  { key: 'ピンク', kind: 'color', css: 'color:#FF4F9A' },
  { key: 'オレンジ', kind: 'color', css: 'color:#FF7A00' },
  { key: '青', kind: 'color', css: 'color:#1E6FFF' },
  { key: '緑', kind: 'color', css: 'color:#1A9E4B' },
  { key: '大', kind: 'size', css: 'font-size:20px' },
  { key: '特大', kind: 'size', css: 'font-size:26px' },
  { key: '太字', kind: 'bold', css: null },
];

const MARK_OF = new Map(TEXT_MARKS.map((m) => [m.key, m] as const));
const MARK_KEYS = TEXT_MARKS.map((m) => m.key).join('|');
/** 印を探す形。★ [ と ] で挟んだ名前がぴったり一致するものだけ（「大」と「特大」は取り違えない） */
const MARK_RE_SRC = '\\[(\\/?)(' + MARK_KEYS + ')\\]';

export type MarkNode = { t: 'text'; v: string } | { t: 'mark'; k: string; c: MarkNode[] };

/** 本文を「文字」と「飾りの付いたまとまり」の木にする。★ 送る形（タグ）と、画面の見え方の確認が、同じこの木から作る */
export function parseTextMarks(body: string): MarkNode[] {
  const src = String(body ?? '');
  type Frame = { key: string | null; open: string; nodes: MarkNode[] };
  const stack: Frame[] = [{ key: null, open: '', nodes: [] }];
  const top = (): Frame => stack[stack.length - 1];
  const pushText = (nodes: MarkNode[], v: string): void => {
    if (!v) return;
    const last = nodes[nodes.length - 1];
    if (last && last.t === 'text') last.v += v;
    else nodes.push({ t: 'text', v });
  };
  // 閉じられなかった印は、文字に戻して親へ流す
  const spill = (): void => {
    const f = stack.pop() as Frame;
    const p = top();
    pushText(p.nodes, f.open);
    for (const n of f.nodes) {
      if (n.t === 'text') pushText(p.nodes, n.v);
      else p.nodes.push(n);
    }
  };
  const re = new RegExp(MARK_RE_SRC, 'g');
  let at = 0;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    pushText(top().nodes, src.slice(at, m.index));
    at = m.index + m[0].length;
    const key = m[2];
    if (m[1] !== '/') { stack.push({ key, open: m[0], nodes: [] }); continue; }
    let idx = -1;
    for (let i = stack.length - 1; i >= 1; i--) { if (stack[i].key === key) { idx = i; break; } }
    if (idx < 0) { pushText(top().nodes, m[0]); continue; }   // 開きの無い閉じ → 文字のまま
    while (stack.length - 1 > idx) spill();
    const f = stack.pop() as Frame;
    if (f.nodes.length > 0) top().nodes.push({ t: 'mark', k: key, c: f.nodes });
  }
  pushText(top().nodes, src.slice(at));
  while (stack.length > 1) spill();
  return stack[0].nodes;
}

function openTag(key: string, quote: boolean): string {
  const m = MARK_OF.get(key);
  if (!m) return '';
  if (m.kind === 'bold') return '<strong>';
  // ★ quote: true は CKEditor が出す形（style="color:#FF0000;"）。false は " を使わない形（style=color:#FF0000）
  return quote ? '<span style="' + String(m.css) + ';">' : '<span style=' + String(m.css) + '>';
}
function closeTag(key: string): string {
  const m = MARK_OF.get(key);
  if (!m) return '';
  return m.kind === 'bold' ? '</strong>' : '</span>';
}
function nodesToHtml(nodes: readonly MarkNode[], quote: boolean): string {
  return nodes.map((n) => (n.t === 'text' ? n.v : openTag(n.k, quote) + nodesToHtml(n.c, quote) + closeTag(n.k))).join('');
}

/** 印をタグにする（対になった印だけ）。★ quote は相手サイトで決まる（このファイルの頭） */
export function textMarksToHtml(body: string, opt: { quote: boolean }): string {
  return nodesToHtml(parseTextMarks(body), opt.quote);
}

/** 印を全部はずして、文字だけにする（画面の「飾りを外す」）。 */
export function stripTextMarks(text: string): string {
  return String(text ?? '').replace(new RegExp(MARK_RE_SRC, 'g'), '');
}

/** 画面の見え方の確認で使う、飾り1つぶんの見た目。★ 送る形（css）と同じ値から作る */
export function textMarkStyle(key: string): { color?: string; fontSize?: string; fontWeight?: 'bold' } {
  const m = MARK_OF.get(key);
  if (!m) return {};
  if (m.kind === 'bold') return { fontWeight: 'bold' };
  const v = String(m.css).split(':')[1] ?? '';
  return m.kind === 'color' ? { color: v } : { fontSize: v };
}

/**
 * 選んだ範囲を、すぐ外側にくっついている印まで広げる（画面の「飾りを外す」用）。
 * ★ 色の付いた文字だけを選んで押しても、前後の [赤] と [/赤] ごと外せるようにする。
 */
export function expandMarkSelection(text: string, s: number, e: number): { s: number; e: number } {
  const openAtEnd = new RegExp('\\[(' + MARK_KEYS + ')\\]$');
  const closeAtStart = new RegExp('^\\[\\/(' + MARK_KEYS + ')\\]');
  let a = Math.max(0, Math.min(s, e));
  let b = Math.min(text.length, Math.max(s, e));
  for (let m = openAtEnd.exec(text.slice(0, a)); m !== null; m = openAtEnd.exec(text.slice(0, a))) a -= m[0].length;
  for (let m = closeAtStart.exec(text.slice(b)); m !== null; m = closeAtStart.exec(text.slice(b))) b += m[0].length;
  return { s: a, e: b };
}

/** 絵文字（U+10000 以上の文字）が入っているか */
export function hasAstral(text: string): boolean {
  return /[\u{10000}-\u{10FFFF}]/u.test(String(text ?? ''));
}

/**
 * 絵文字（U+10000 以上の文字）を外す。★ 後ろに付く「つなぎ」（U+200D）と「異体字の印」（U+FE0F）も一緒に外す。
 * ★ ✨ ⭐ ❤ など U+FFFF までの記号は残す。
 */
export function stripAstral(text: string): string {
  return String(text ?? '').replace(/[\u{10000}-\u{10FFFF}][️‍]*/gu, '').replace(/‍/g, '');
}
