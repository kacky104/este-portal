// ★ 第1552便（2026-10-18・カッキーさん）: ヘッダーのポイント表示に「残高が変わった」を知らせる合図。
//   受け取り・利用の直後に呼ぶと、ヘッダーの数字がその場で変わる（delta があれば +50 などを一瞬出す）。
//   ★ ブラウザ内だけの合図。権限や残高の正しさには使わない（正しい残高はいつも DB）。
export const POINTS_EVENT = 'fukues:points';
export type PointsEventDetail = { balance: number; delta?: number };

export function notifyPointsChanged(balance: number, delta?: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<PointsEventDetail>(POINTS_EVENT, { detail: { balance, delta } }));
  } catch { /* 何もしない */ }
}
