// 順位変動マーク（前回＝先週比）。スタイルB：三角。
//   ▲ 上昇=緑 / ▼ 下降=赤 / ▬ 同じ=灰 / NEW=前週データ無し（新規ランクイン）。
// prev が undefined のときは前週ランク外＝NEW 扱い。
export function RankDelta({ current, prev }: { current: number; prev?: number }) {
  if (prev == null) {
    return (
      <span
        className="flex-shrink-0 inline-flex items-center text-[9px] font-bold text-white bg-pink-500 rounded px-1 py-0.5 leading-none"
        title="今週から新登場"
      >
        NEW
      </span>
    );
  }
  if (current < prev) {
    return (
      <span className="flex-shrink-0 text-[11px] leading-none" style={{ color: '#dc2626' }} title={`前回${prev}位から上昇`} aria-label="前回より上昇">▲</span>
    );
  }
  if (current > prev) {
    return (
      <span className="flex-shrink-0 text-[11px] leading-none" style={{ color: '#2563eb' }} title={`前回${prev}位から下降`} aria-label="前回より下降">▼</span>
    );
  }
  return (
    <span className="flex-shrink-0 text-[11px] leading-none" style={{ color: '#16a34a' }} title="前回と同じ" aria-label="前回と同じ">▬</span>
  );
}
