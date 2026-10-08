// コネックエフ「ココア店長ブログ」の決めごと（第404便・2026-09-17）。★ 純粋関数だけ。通信もDBも触らない。
//
// ★★ ココア側の制限（実物・2026-09-17 調査）
//   ・タイトル：全角48文字 ／ 本文：全角3333・半角9950文字 ／ 外部リンク不可 ／ 3ヶ月で自動削除 ／ 投稿・編集あわせて残り回数あり
// ★ 1日の区切り・自動投稿の時刻は announceAuto（駅ちか新着と同じ・朝6時／店舗IDから割り当て）に合わせる。

import { dayKeyJST, autoPostMinuteOfDay } from './announceAuto';

/** 1店が持てるテンプレの上限（駅ちか新着の1枠と同じ10本） */
export const COCOA_TEMPLATES_MAX = 10;
/** タイトルの全角上限（ココア） */
export const COCOA_TITLE_MAX = 48;
/** 本文の全角上限（ココア） */
export const COCOA_BODY_MAX = 3333;

/** 全角=2・半角=1 で数える（ざっくり。ココアの数え方に寄せる） */
export function widthCount(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) <= 0xff || (ch >= 'ｦ' && ch <= 'ﾟ') ? 1 : 2;
  return n;
}

/** タイトルが長すぎないか（全角48＝幅96まで） */
export function titleTooLong(title: string): boolean { return widthCount(title) > COCOA_TITLE_MAX * 2; }
/**
 * 本文が長すぎないか（全角3333＝幅6666、半角9950 の緩いほう）。
 * ★ 第1318便: ココアへ【送る形】（改行を <br> にしたあと）で数える。1改行につき半角4文字ぶん増える。
 */
export function bodyTooLong(body: string): boolean {
  const sent = cocoaMailBody(body);
  return widthCount(sent) > COCOA_BODY_MAX * 2 && sent.length > 9950;
}

/**
 * ★★★ 第1318便（2026-10-08・カッキーさん）: ココアへ送る本文。★ 入力した改行を <br> にして送る。
 *
 * ★★ なぜ要るか（ラビリンス様の公開ページで確かめた・2026-10-08）
 *   ココアの店長ブログは本文を HTML として表示する。メールで送った改行（\n）は本文にそのまま入るが、
 *   HTML ではただの改行は空白になるので、公開ページでは1段落につながって見えていた（本文に改行23個・タグ0個）。
 *   ココアの管理画面で書いた記事は、改行が <br> で入っている。
 *   ★ メールの本文に <br> と書けば、タグのまま通って改行される（カッキーさんがテンプレに手で打って確かめた）。
 *   → 店舗様は今までどおり普通に改行して書くだけ。送るときにここで <br> にする。
 *
 * ★ 決めごと
 *   ・改行1つ → <br> 1つ（空の行は空の行のまま＝段落の間があく）。★ 改行そのものも残す（HTML では空白・害は無い）
 *   ・行の終わりにもう <br> や </p> などが書いてあれば、足さない（手で打ったテンプレを二重に改行しない）
 *   ・頭の空行と、末尾の空白・改行は落とす（記事の終わりに空の行を作らない）
 *   ・★ ほかの文字（< や &）には触らない。本文はココアが HTML として読むので、タグを打てばタグとして出る（今までと同じ）
 *
 * ★★★ 第1319便（2026-10-08）: 絵文字は「番号の書き方」（&#128184; の形）にして送る。
 *   ★ ココアのメール投稿は、本文の絵文字（💸 など・U+10000 以上の文字）を落とす。番号の書き方ならそのまま通って、絵文字で表示される。
 *     ラビリンス様の試し投稿で確かめた（10/8 19:58・blogid39652698: 「💸🌟📋」は消え、「&#128184;&#127775;&#128203;」は出た）。
 *   ★ 変えるのは U+10000 以上の文字だけ。✨ や ⭐ のような U+FFFF までの記号は、今までどおりそのまま送る（タイトルでは出ている）。
 *   ★ タイトル（メールの件名）は変えない。HTML ではないので、番号の書き方はそのまま文字で出てしまう。
 *   ★ 同じ試し投稿で分かったこと: <strong> は通る。style="…" や color="…" は、メールの入口で " の前に \ が付いて壊れる（色・大きさが効かない）。
 *     <font color> は <span style="color:…"> に直される（＝色そのものは受け付ける作り）。" を使わない書き方は未確認。
 */
export function cocoaMailBody(body: string): string {
  const plain = String(body ?? '').replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
  if (plain === '') return '';
  // ★ 第1320便: 文字の飾りの印（[赤]…[/赤] など）をタグにし、手で打ったタグの " を外す（どちらも下の「文字の飾り」）
  const src = cocoaUnquoteAttrs(cocoaMarksToHtml(plain));
  const lines = src.split('\n');
  const hasBreak = (line: string) => /<br\s*\/?>\s*$/i.test(line) || /<\/(p|div|li|ul|ol|h[1-6]|blockquote)>\s*$/i.test(line);
  const withBreaks = lines.map((line, i) => (i === lines.length - 1 || hasBreak(line) ? line : line + '<br>')).join('\n');
  // ★ 第1319便: U+10000 以上の文字（絵文字）は番号の書き方にする（そのままではココアのメール投稿で落ちる）
  return withBreaks.replace(/[\u{10000}-\u{10FFFF}]/gu, (ch) => '&#' + String(ch.codePointAt(0)) + ';');
}

export type CocoaTemplate = { id: number; title: string; body: string; imageUrl: string | null; isActive: boolean; sortOrder: number; lastPostedAt: string | null };

/**
 * ★ いま自動投稿すべきか（1日1回）。
 * @returns post=true なら「この店を今回出す」。★ 出すテンプレは pickCocoaTemplate で選ぶ。
 */
export function shouldPostCocoa(input: {
  now: Date; salonId: number; enabled: boolean; activeCount: number; lastAutoDay: string | null;
}): { post: boolean; reason: string } {
  if (!input.enabled) return { post: false, reason: 'disabled' };
  if (input.activeCount <= 0) return { post: false, reason: 'no-template' };
  const dayKey = dayKeyJST(input.now);
  const minute = autoPostMinuteOfDay(input.salonId);
  if (dayKey === null || minute === null) return { post: false, reason: 'bad-time' };
  if (input.lastAutoDay === dayKey) return { post: false, reason: 'already-today' };
  // ★ その店の割り当て時刻を過ぎているか（区切り＝朝6時 からの経過分）
  const elapsed = elapsedMinSinceDayStart(input.now);
  if (elapsed < minute) return { post: false, reason: 'before-time' };
  return { post: true, reason: 'ok' };
}

/** 区切り（朝6時）からの経過分（0〜1439） */
export function elapsedMinSinceDayStart(now: Date): number {
  const JST = 9 * 60, DAY_START = 6 * 60;
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return ((utcMin + JST - DAY_START) % 1440 + 1440) % 1440;
}

/** 最後に投稿した時刻が古い順（null＝未投稿を先に）→ sort_order → id で1本選ぶ */
export function pickCocoaTemplate(temps: readonly CocoaTemplate[]): CocoaTemplate | null {
  const act = temps.filter((t) => t.isActive);
  if (act.length === 0) return null;
  const t = (x: string | null) => (x ? Date.parse(x) || 0 : 0);
  return [...act].sort((a, b) => (t(a.lastPostedAt) - t(b.lastPostedAt)) || (a.sortOrder - b.sortOrder) || (a.id - b.id))[0];
}

// ── ★★★ 第1320便（2026-10-08・カッキーさん）: 文字の飾り（色・大きさ・太字）─────────────────────
//
// ★★ なぜ「印」で持つか
//   コネックエフの本文欄は文字だけ。店舗様にタグを打ってもらうのは難しいので、本文には [赤]…[/赤] のような短い印で入れ、
//   送るときにココアへ通る形のタグへ置き換える。画面のボタンは、選んだ文字の前後にこの印を足すだけ。
//
// ★★★ ココアのメール投稿で確かめたこと（ラビリンス様の試し投稿・2026-10-08）
//   ・属性の値を " で囲むと、メールの入口で " の前に \ が付いて壊れる（色・大きさが効かない）… 19:58・blogid39652698
//   ・" を使わない書き方（style=color:#FF0000;font-size:20px）は通る。ココアが " を付け直して載せる … 20:05・blogid39652926
//   ・<strong> は通る。<strong style=color:…> も通る。<font color=… size=…> は <span style> に直されて通る
//   → ★ ここで作るタグは、属性の値を " で囲まない・値に空白を入れない。
//
// ★ 対にならない印（[赤] だけ・[/赤] だけ）は、置き換えずに文字のまま残す（＝見え方の確認で気づける。壊れたタグを送らない）。
// ★ 中身が空の印（[赤][/赤]）は捨てる。

export type CocoaMarkKind = 'color' | 'size' | 'bold';
export type CocoaMark = { key: string; kind: CocoaMarkKind; css: string | null };

/** 使える飾り。★ key が本文に入る印の名前（[赤]…[/赤]）。色を足すときは、ここに1行足すだけ */
export const COCOA_MARKS: readonly CocoaMark[] = [
  { key: '赤', kind: 'color', css: 'color:#FF0000' },
  { key: 'ピンク', kind: 'color', css: 'color:#FF4F9A' },
  { key: 'オレンジ', kind: 'color', css: 'color:#FF7A00' },
  { key: '青', kind: 'color', css: 'color:#1E6FFF' },
  { key: '緑', kind: 'color', css: 'color:#1A9E4B' },
  { key: '大', kind: 'size', css: 'font-size:20px' },
  { key: '特大', kind: 'size', css: 'font-size:26px' },
  { key: '太字', kind: 'bold', css: null },
];

const MARK_OF = new Map(COCOA_MARKS.map((m) => [m.key, m] as const));
/** 印を探す形。★ [ と ] で挟んだ名前がぴったり一致するものだけ（「大」と「特大」は取り違えない） */
const MARK_RE_SRC = '\\[(\\/?)(' + COCOA_MARKS.map((m) => m.key).join('|') + ')\\]';

export type CocoaNode = { t: 'text'; v: string } | { t: 'mark'; k: string; c: CocoaNode[] };

/** 本文を「文字」と「飾りの付いたまとまり」の木にする。★ 送る形（タグ）と、画面の見え方の確認が、同じこの木から作る */
export function parseCocoaMarks(body: string): CocoaNode[] {
  const src = String(body ?? '');
  type Frame = { key: string | null; open: string; nodes: CocoaNode[] };
  const stack: Frame[] = [{ key: null, open: '', nodes: [] }];
  const top = (): Frame => stack[stack.length - 1];
  const pushText = (nodes: CocoaNode[], v: string): void => {
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

function markOpenTag(key: string): string {
  const m = MARK_OF.get(key);
  if (!m) return '';
  return m.kind === 'bold' ? '<strong>' : '<span style=' + String(m.css) + '>';   // ★ " で囲まない（上の「確かめたこと」）
}
function markCloseTag(key: string): string {
  const m = MARK_OF.get(key);
  if (!m) return '';
  return m.kind === 'bold' ? '</strong>' : '</span>';
}
function nodesToHtml(nodes: readonly CocoaNode[]): string {
  return nodes.map((n) => (n.t === 'text' ? n.v : markOpenTag(n.k) + nodesToHtml(n.c) + markCloseTag(n.k))).join('');
}

/** 印をココアへ通る形のタグにする（対になった印だけ）。 */
export function cocoaMarksToHtml(body: string): string {
  return nodesToHtml(parseCocoaMarks(body));
}

/** 印を全部はずして、文字だけにする（画面の「飾りを外す」）。 */
export function stripCocoaMarks(text: string): string {
  return String(text ?? '').replace(new RegExp(MARK_RE_SRC, 'g'), '');
}

/** 画面の見え方の確認で使う、飾り1つぶんの見た目。★ 送る形（css）と同じ値から作る */
export function cocoaMarkStyle(key: string): { color?: string; fontSize?: string; fontWeight?: 'bold' } {
  const m = MARK_OF.get(key);
  if (!m) return {};
  if (m.kind === 'bold') return { fontWeight: 'bold' };
  const v = String(m.css).split(':')[1] ?? '';
  return m.kind === 'color' ? { color: v } : { fontSize: v };
}

/**
 * 手で打ったタグの、" や ' で囲んだ属性を、囲まない形に直す（style="color: #FF0000;" → style=color:#FF0000）。
 * ★ " のままだとココアのメールの入口で壊れる。★ 直せるのは、空白を詰めたあとの値に空白・引用符・= < > が残らないものだけ。
 *   それ以外（空白の要る値・リンクの URL など）は触らない（今までと同じ結果になる）。
 */
export function cocoaUnquoteAttrs(html: string): string {
  return String(html ?? '').replace(/<[a-zA-Z][^<>]*>/g, (tag) =>
    tag.replace(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (all: string, name: string, dq?: string, sq?: string) => {
      const v = (dq ?? sq ?? '').replace(/\s*([:;,])\s*/g, '$1').trim().replace(/;$/, '');
      return /^[^\s"'=<>`]+$/.test(v) ? name + '=' + v : all;
    }));
}

/**
 * 選んだ範囲を、すぐ外側にくっついている印まで広げる（画面の「飾りを外す」用）。
 * ★ 色の付いた文字だけを選んで押しても、前後の [赤] と [/赤] ごと外せるようにする。
 */
export function expandCocoaSelection(text: string, s: number, e: number): { s: number; e: number } {
  const keys = COCOA_MARKS.map((m) => m.key).join('|');
  const openAtEnd = new RegExp('\\[(' + keys + ')\\]$');
  const closeAtStart = new RegExp('^\\[\\/(' + keys + ')\\]');
  let a = Math.max(0, Math.min(s, e));
  let b = Math.min(text.length, Math.max(s, e));
  for (let m = openAtEnd.exec(text.slice(0, a)); m !== null; m = openAtEnd.exec(text.slice(0, a))) a -= m[0].length;
  for (let m = closeAtStart.exec(text.slice(b)); m !== null; m = closeAtStart.exec(text.slice(b))) b += m[0].length;
  return { s: a, e: b };
}
