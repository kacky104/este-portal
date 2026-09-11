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
