// ★★ 自動の周で、店舗ごとに相手サイトへ行く時刻を少しずらす（第1247便・2026-10-06・カッキーさんの決定）。
//
// ★ なぜ: 周（cron）は全店舗ぶんを同じ瞬間に積む。中継（VPS・毎分）は積まれた順に続けて送るので、
//   相手サイトから見ると同じ IP から何店舗ぶんものログインが数秒おきに並ぶ。★ 店舗が増えるほど目立つ。
//   → 店舗ごとに 0〜3分ずらして積む（中継は not_before を過ぎるまで引き取らない）。
// ★ これは「人のふり」ではない（クリックの揺らぎ・不規則な待ちは入れない・カッキーさんと合意）。
//   同じ瞬間に集中させないための礼儀。★ 決まった間隔（30秒刻み）で、乱数は使わない＝再現できる。
// ★ 純粋関数（通信も DB も触らない）。

/** 1店舗ごとの間隔（秒） */
export const STAGGER_STEP_SEC = 30;
/** これ以上はずらさない（秒）＝ 0〜3分 */
export const STAGGER_MAX_SEC = 180;

/**
 * その周で n 番目（0 始まり）に始める店舗の「この時刻まで引き取らない」（ISO）。
 * ★ 0番目は null（＝今までどおり、すぐ）。★ 上限を超えたぶんは上限で止める（店舗が多くても反映は3分以上遅れない）。
 */
export function staggerNotBefore(index: number, now: Date): string | null {
  if (!Number.isInteger(index) || index <= 0) return null;
  const sec = Math.min(index * STAGGER_STEP_SEC, STAGGER_MAX_SEC);
  return new Date(now.getTime() + sec * 1000).toISOString();
}
