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
/** 本文が長すぎないか（全角3333＝幅6666、半角9950 の緩いほう） */
export function bodyTooLong(body: string): boolean { return widthCount(body) > COCOA_BODY_MAX * 2 && body.length > 9950; }

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
