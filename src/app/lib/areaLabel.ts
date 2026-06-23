// エリアのDB値（フィルタ判定キー）→ 画面表示用ラベルの変換を一元管理する。
// 値そのものは絶対に変えず、表示だけを差し替えるためのマップ。
// フィルタや保存は元の値（キー）で行い、表示時のみ areaLabel() を通す。
const AREA_LABELS: Record<string, string> = {
  '福岡全域': '福岡市全域',
  '博多・住吉': '博多駅周辺',
};

/** DBのエリア値を画面表示用ラベルに変換する（未定義はそのまま返す）。 */
export function areaLabel(area: string | null | undefined): string {
  if (!area) return '';
  return AREA_LABELS[area] ?? area;
}
