// セラピスト一覧の並び順（/mypage の出勤ページ・セラピストページで共有）。
//
// ★★★ なぜ要るか
//   DB（therapists）に order を付けていないため、返ってくる順は【保存順】でしかない。
//   ★ 行を更新すると、その行だけ末尾へ動くことがある。★ 店舗様には原因不明の並び替えに見える。
//   → ★ 並びは画面側で決める。★ 決め方はこの1か所だけに置く（2か所に同じ式を書かない）。
//
// ★★ 決め方（2026-09-06・カッキーさんの指示）
//   上から: ① 今日の出勤あり・写真あり
//           ② 今日の出勤あり・写真なし
//           ③ 出勤なし・写真あり
//           ④ 出勤なし・写真なし
//   ★ 同じ組の中は元の順のまま（★ JSの sort は安定なので、余計な並べ替えをしない）。
//
// ★ 「出勤あり」は【今日の出勤スイッチがON】で見る。★ 時刻は見ない
//   （★ 朝いちの時点で、その日に出る人が上に来ていてほしいため）。

import { searchNormalize } from './searchNormalize';

/** 並び順の点数。★ 小さいほど上。 */
export function therapistOrderRank(working: boolean, hasPhoto: boolean): number {
  return (working ? 0 : 2) + (hasPhoto ? 0 : 1);
}

/** ★★ あいうえお順（出勤ページ・2026-09-11 カッキーさんの指示）。
 *   ★ 上から: ① 公開の方を【あいうえお順】／② そのあとに非公開の方（★ 中はやはりあいうえお順）。
 *   ★ 出勤あり／写真あり は見ない（★ 出勤ページだけの決め。★ セラピスト・写メ日記は今までどおり）。
 *
 *   ★ 読みの揃え方は検索と同じ searchNormalize:
 *     ★ ひらがな→カタカナ／半角カナ→全角／濁点・長音・中黒・空白は無視。
 *   ★★ できないこと: 漢字の読み（「桜」は「さくら」の位置に来ない）。★ 検索バーと同じ限界。
 *     ★ 直すなら therapists に【読みがな】の列を足すしかない。
 *   ★ 名前が空の方はいちばん下（★ 先頭に空文字が並ぶと事故に見える）。
 */
export function sortTherapistsByKana<T>(
  list: readonly T[],
  getName: (t: T) => string | null | undefined,
  isHidden: (t: T) => boolean,
): T[] {
  return [...list].sort((a, b) => {
    const ha = isHidden(a) ? 1 : 0;
    const hb = isHidden(b) ? 1 : 0;
    if (ha !== hb) return ha - hb;            // ★ 非公開は下へ
    const na = searchNormalize(getName(a));
    const nb = searchNormalize(getName(b));
    if (!na && !nb) return 0;
    if (!na) return 1;                        // ★ 名前なしは下へ
    if (!nb) return -1;
    return na.localeCompare(nb, 'ja');        // ★ かなの並び＝あいうえお順
  });
}

/** ★★ 店舗様が決めた順（コネックエフ・第1384便・2026-10-10・カッキーさんの決定）。
 *   コネックエフのセラピスト一覧で、つまんで並べ替えた順。セラピスト登録状況一覧・週間スケジュールも同じ順。
 *   ★ 上から: ① 公開の方で、並びに【入っていない】方（＝新しく登録した方。中は あいうえお順）
 *            ② 公開の方を、店舗様が決めた順
 *            ③ 非公開の方（★ 今までどおり下にまとめる。中は あいうえお順。並びは見ない）
 *   ★ order が空（まだ並べ替えたことが無い店・表が無い）なら、sortTherapistsByKana と同じ結果（今までどおり）。
 *   ★ order にあって一覧に無い id（消した方）は無視する。同じ id が2回あれば、先のほうを使う。
 *   ★ 元の配列は変えない。
 */
export function sortTherapistsByManual<T>(
  list: readonly T[],
  getId: (t: T) => number,
  getName: (t: T) => string | null | undefined,
  isHidden: (t: T) => boolean,
  order: readonly number[] | null | undefined,
): T[] {
  const kana = sortTherapistsByKana(list, getName, isHidden);
  if (!order || order.length === 0) return kana;
  const pos = new Map<number, number>();
  order.forEach((id, i) => { if (!pos.has(id)) pos.set(id, i); });
  // ★ 組: 0 = 公開・並びに無い／1 = 公開・並びにある／2 = 非公開。★ 同じ組の中は kana の順のまま（sort は安定）
  const keyOf = (t: T): [number, number] => {
    if (isHidden(t)) return [2, 0];
    const p = pos.get(getId(t));
    return p === undefined ? [0, 0] : [1, p];
  };
  return [...kana].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
}

/** 並べ替えたあとに保存する並び（公開の方の id を、いまの画面の上から順に）。★ 非公開の方は入れない＝公開に戻したら、いちばん上に出る */
export function manualOrderToSave<T>(list: readonly T[], getId: (t: T) => number, isHidden: (t: T) => boolean): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const t of list) {
    if (isHidden(t)) continue;
    const id = getId(t);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 一覧の中で、id の方を target の方の位置へ動かす（つまんで動かす途中の並び）。★ 元の配列は変えない。動かせないときは同じ配列を返す */
export function moveInList<T>(list: readonly T[], getId: (t: T) => number, id: number, targetId: number): T[] {
  const from = list.findIndex((t) => getId(t) === id);
  const to = list.findIndex((t) => getId(t) === targetId);
  if (from < 0 || to < 0 || from === to) return list as T[];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 一覧を並べ替える。★ 元の配列は変えない。 */
export function sortTherapistsForList<T>(
  list: readonly T[],
  isWorkingToday: (t: T) => boolean,
  hasPhoto: (t: T) => boolean,
): T[] {
  return [...list].sort(
    (a, b) =>
      therapistOrderRank(isWorkingToday(a), hasPhoto(a)) -
      therapistOrderRank(isWorkingToday(b), hasPhoto(b)),
  );
}
