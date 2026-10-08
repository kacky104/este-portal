// コネックエフ「ココア店長ブログ」の決めごと（第404便・2026-09-17）。★ 純粋関数だけ。通信もDBも触らない。
//
// ★★ ココア側の制限（実物・2026-09-17 調査）
//   ・タイトル：全角48文字 ／ 本文：全角3333・半角9950文字 ／ 外部リンク不可 ／ 3ヶ月で自動削除 ／ 投稿・編集あわせて残り回数あり
// ★ 1日の区切り・自動投稿の時刻は announceAuto（駅ちか新着と同じ・朝6時／店舗IDから割り当て）に合わせる。

import { dayKeyJST, autoPostMinuteOfDay } from './announceAuto';
import {
  TEXT_MARKS, parseTextMarks, textMarksToHtml, stripTextMarks, textMarkStyle, expandMarkSelection, astralToEntities,
  type MarkNode, type TextMark, type TextMarkKind,
} from './textMarks';

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
  return astralToEntities(withBreaks);
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

// ── ★★★ 文字の飾り（色・大きさ・太字）─────────────────────────────────────
//   第1320便で作り、第1321便で lib/textMarks.ts へ出した（駅ちか新着情報でも使うため）。★ 印の決まり・木の作り方はあちら。
//   ここに残すのは、ココアだけの決まり（メールで送るので、属性の値を " で囲まない）。
//
// ★★★ ココアのメール投稿で確かめたこと（ラビリンス様の試し投稿・2026-10-08）
//   ・属性の値を " で囲むと、メールの入口で " の前に \ が付いて壊れる（色・大きさが効かない）… 19:58・blogid39652698
//   ・" を使わない書き方（style=color:#FF0000;font-size:20px）は通る。ココアが " を付け直して載せる … 20:05・blogid39652926
//   ・<strong> は通る。<strong style=color:…> も通る。<font color=… size=…> は <span style> に直されて通る
//   → ★ ここで作るタグは、属性の値を " で囲まない・値に空白を入れない。

export type CocoaMarkKind = TextMarkKind;
export type CocoaMark = TextMark;
export type CocoaNode = MarkNode;
/** ★ 名前を残してあるだけ。中身は lib/textMarks.ts と同じもの */
export const COCOA_MARKS = TEXT_MARKS;
export const parseCocoaMarks = parseTextMarks;
export const stripCocoaMarks = stripTextMarks;
export const cocoaMarkStyle = textMarkStyle;
export const expandCocoaSelection = expandMarkSelection;

/** 印をココアへ通る形のタグにする（対になった印だけ）。★ 属性の値を " で囲まない */
export function cocoaMarksToHtml(body: string): string {
  return textMarksToHtml(body, { quote: false });
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
