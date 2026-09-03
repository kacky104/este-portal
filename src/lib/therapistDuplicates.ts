// 同じ名前のセラピストが2人以上いないか（第119便・2026-09-03・純粋関数）。
//
// ★★★ なぜ要るか（カッキーさん・2026-09-03）
//   フクエスは【送る側】だけでなく【受け取る側】にもなった（2026-08-31 にベンリーの取扱サイトへ追加）。
//   ★ 外から登録が入るということは、**同じ人が二重に作られる**ことが起こりうる。
//   ★★ 原因が外にあっても、**見た目が崩れるのはフクエスの公開ページ**。
//   → こちらは【気づける】ようにするだけ。★ 消さない・止めない・原因を決めつけない。
//     ★ 店舗様が気づいて、ご利用中のサービスの窓口に問い合わせられれば、それでよい。
//
// ★★★ 対象は【公開中の方】だけ。
//   ★ 目的は公開ページに2人並ぶのを防ぐこと。★ 非公開の方（退店・作られたまま）まで数えると、
//     「退店した人と同じ名前の新人が入った」だけで毎回警告が出て、誰も読まなくなる。
//
// ★★ 名前の揃え方は【空白と全角半角だけ】（mediaMatch.normalizeName と同じ）。
//   ★ 読みでは揃えない。★ 「レミ」と「れみ」は別人のことがある（媒体の突き合わせと同じ決め）。
//   ★ 揃えすぎると、別人を「重複です」と言ってしまう。★ こちらの誤りのほうが害が大きい。

import { normalizeName } from './mediaMatch';

export type DupPerson = { id: string; name: string; isActive: boolean };
export type DupGroup = { name: string; people: DupPerson[] };

/**
 * 同じ名前の公開中セラピストをまとめる。★ 2人以上のときだけ返す。
 * ★ 並びは「人数の多い順 → 名前順」。★ 毎回同じ並びにする（点検で固定できる形）。
 */
export function findDuplicateNames(therapists: readonly DupPerson[]): DupGroup[] {
  const byKey = new Map<string, DupPerson[]>();
  for (const t of therapists) {
    if (!t || t.isActive !== true) continue;
    const key = normalizeName(String(t.name ?? ''));
    // ★ 名前が空の人は数えない。★ 空同士を「同じ名前」と言わない
    if (key.length === 0) continue;
    const list = byKey.get(key);
    if (list) list.push(t); else byKey.set(key, [t]);
  }
  return [...byKey.entries()]
    .filter(([, people]) => people.length >= 2)
    .map(([name, people]) => ({ name, people }))
    .sort((a, b) => b.people.length - a.people.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * 店舗様に出す1行。★ 原因を決めつけない（「ベンリー」と書かない）。
 * ★ 0件のときは空文字（★ 呼び出し側は、空なら何も出さない）。
 */
export function duplicateNotice(groups: readonly DupGroup[]): string {
  if (groups.length === 0) return '';
  const names = groups.map((g) => `${g.name}（${g.people.length}名）`).join('・');
  return `同じ名前で公開中の方がいます：${names}。同じ方が二重に登録されている場合、公開ページにも2人分が並びます。`;
}

/** 重複している人数の合計（★ 組の数ではない）。 */
export function duplicateCount(groups: readonly DupGroup[]): number {
  return groups.reduce((n, g) => n + g.people.length, 0);
}
