// エリアのDB値（フィルタ判定キー）→ 画面表示用ラベルの変換を一元管理する。
// 値そのものは絶対に変えず、表示だけを差し替えるためのマップ。
// フィルタや保存は元の値（キー）で行い、表示時のみ areaLabel() を通す。
const AREA_LABELS: Record<string, string> = {
  // ★ 第1376便（2026-10-10・カッキーさん）: 「福岡全域」は表示も「福岡全域」（前は「福岡市全域」に言い換えていた）。値と同じなので行は置かない。
  // ★ 第1379便（2026-10-10・カッキーさん）: 「その他福岡市県」→「その他福岡」（スマホのエリアタブを上3つ・下3つに収めるため、短く）
  '福岡県その他': 'その他福岡',
};

// ★ 第1373便: まとめる前の値（areas.ts の LEGACY_AREA_KEYS と同じ）。DB に古い値が残っていても、今のエリア名で出す。
//   ★ areas.ts から import しない（このファイルは client からも読まれる小さな部品のまま置く）。値を変えるときは両方直すこと。
const LEGACY_AREA_KEYS: Record<string, string> = {
  '博多・住吉': '博多・天神・中洲',
  '中洲・天神・薬院': '博多・天神・中洲',
};

/** DBのエリア値を画面表示用ラベルに変換する（未定義はそのまま返す）。 */
export function areaLabel(area: string | null | undefined): string {
  if (!area) return '';
  const key = LEGACY_AREA_KEYS[area] ?? area;
  return AREA_LABELS[key] ?? key;
}
