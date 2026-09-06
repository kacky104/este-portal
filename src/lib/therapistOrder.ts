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

/** 並び順の点数。★ 小さいほど上。 */
export function therapistOrderRank(working: boolean, hasPhoto: boolean): number {
  return (working ? 0 : 2) + (hasPhoto ? 0 : 1);
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
