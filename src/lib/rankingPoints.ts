// ★ 第1093便（2026-10-02・カッキーさん）: セラピストランキングの「毎週の加点」のうち、画面の説明文にも出す点数。
//   点数の計算（src/app/lib/ranking.ts）と、説明文（マイページ・コネックエフの「セラピストページ連携」）が
//   同じ数字を見るように、ここに1か所だけ書く。★ ブラウザ側の部品からも読むので、ここには数字だけを置く。

/** お店と連携してセラピストページを開設している（therapists.user_id あり・公開中）セラピストに、毎週上乗せする点数。 */
export const CAST_LINK_BONUS = 5;

/**
 * ★ 第1183便（2026-10-05・カッキーさん）: お店の「おすすめランキング」に毎週足す点 ＝ セラピストページ連携率（％）÷ この数（小数は切り捨て）。
 *   例: 12% → 6点、100% → 50点。
 * ★★ 計算の正本は DB（supabase/migrations/20260928_recommend_cast_link_points.sql・第948便）。ここは【説明文に出す数字】だけ。
 *   ★ SQL の割る数を変えたら、ここも同じ数に直すこと（説明文と実際の点がずれる）。
 * ★ 実際に使う連携率は、毎週月曜0時（JST）に記録した数字（週の途中の連携は翌週から）。
 */
export const RECOMMEND_CAST_LINK_DIVISOR = 2;

/** 連携率（％）から、おすすめランキングの点数を出す（説明文用・SQL と同じ切り捨て）。 */
export function recommendCastLinkPoints(pct: number): number {
  return Math.floor(pct / RECOMMEND_CAST_LINK_DIVISOR);
}
