// セラピスト編集の「まだ保存していない」を見つける（第173便・2026-09-06）。
//
// ★★★ このファイルは通信もDBも触らない。★ 判断だけ。
//
// ★★★ なぜ要るか（★ 2026-09-05 に実際に起きた）
//   ・「保存ボタンを押してなかったです」（カッキーさん）→ ★ 30分ぶんの作業が消えた
//   ・第37便でも同じことが起きている:
//       「1画面に保存ボタンが2種類あり、【保存したつもりで実際は入っていない】」
//   ★★ 2度起きたことは3度起きる。★ 画面が黙っているのが原因。
//
// ★★★ 決めごと
//   ① **設定も概念も増やさない。** ★ 見つけて言うだけ。★ 勝手に保存もしない
//   ② **保存したあと「まだ未保存」と言わない。** ★ 保存時と同じ形にそろえてから比べる
//      ★ 例）キャッチは保存のとき trim して16字で切る → ★ 比べるときも同じにする
//      ★★ ここがずれると、保存しても警告が消えず、★ 店舗様は警告を信じなくなる
//   ③ **どこが未保存かを言う。** ★ 「変更があります」だけでは、どこを直したか思い出せない

import { sanitizeBadges } from './therapistBadges';

/** ★ キャッチは保存のとき trim して16字で切る。★ 比べるときも同じにする */
export const CATCHPHRASE_MAX = 16;

export type TherapistSnapshot = {
  age: string | null;
  bodyType: string | null;
  profileText: string | null;
  catchphrase: string | null;
  badges: string[] | null;
  images: string[] | null;
};

/** ★ null・undefined・空文字を1つに寄せる。★ 「空」と「未設定」を未保存扱いしない */
function norm(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** ★ 保存されるのと同じ形にしてから比べる（★ 決めごと②） */
function normCatch(v: unknown): string {
  return norm(v).trim().slice(0, CATCHPHRASE_MAX);
}

function sameList(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  if (x.length !== y.length) return false;
  // ★ 並びも中身のうち（★ 写真は1枚目が正面に出る。並べ替えは立派な変更）
  return x.every((v, i) => v === y[i]);
}

/**
 * ★★★ どこが未保存か（★ 店舗様の言葉で・★ 画面に出す順）。
 *
 * @param forwardDirtyCount 写メ日記の転送先のうち、まだ保存していない行の数
 * @returns 未保存の場所の名前。★ 空配列なら未保存なし
 */
export function therapistDirtyFields(
  saved: TherapistSnapshot | null,
  draft: TherapistSnapshot,
  forwardDirtyCount = 0,
): string[] {
  const out: string[] = [];
  // ★★ まだ読み込めていないときは【分からない】。★ 「変更あり」に倒さない（作法3-5）
  //   ★ ここで倒すと、開いただけで警告が出る
  if (saved === null) return out;

  if (norm(saved.age) !== norm(draft.age)) out.push('年齢');
  if (norm(saved.bodyType) !== norm(draft.bodyType)) out.push('身長・スリーサイズ');
  if (normCatch(saved.catchphrase) !== normCatch(draft.catchphrase)) out.push('キャッチコピー');
  if (norm(saved.profileText) !== norm(draft.profileText)) out.push('プロフィール');
  // ★ バッジも保存のとき正規化される。★ 同じ形にしてから比べる
  if (!sameList(sanitizeBadges(saved.badges ?? []), sanitizeBadges(draft.badges ?? []))) out.push('特徴タグ');
  if (!sameList(saved.images, draft.images)) out.push('写真');

  const n = Number.isFinite(forwardDirtyCount) ? Math.trunc(forwardDirtyCount) : 0;
  if (n > 0) out.push('写メ日記の転送先');
  return out;
}

/**
 * ★ 画面に出す1行。★ 文言はここで作る（★ 画面で作らない・第167便で直した作法）。
 * @returns 未保存が無ければ null（★ 空文字と分ける）
 */
export function therapistDirtyNote(fields: readonly string[]): string | null {
  const list = Array.isArray(fields) ? fields.filter((f) => typeof f === 'string' && f.length > 0) : [];
  if (list.length === 0) return null;
  // ★★ どこを直したかを必ず言う。★ 「変更があります」だけでは思い出せない
  return 'まだ保存していない変更があります（' + list.join('・') + '）。';
}

/** ★ ページを離れようとしたときに出す短い文。★ ブラウザが文言を無視することもある（それでも出す） */
export function therapistLeaveWarning(): string {
  return 'まだ保存していない変更があります。このページを離れると消えます。';
}
