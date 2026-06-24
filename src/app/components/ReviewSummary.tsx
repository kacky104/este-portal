import { Stars } from './Stars';

// 口コミの集計表示（サーバーコンポーネント）。
// 平均★（0.5刻み）＋平均値＋件数を表示。0件なら「まだ口コミはありません」。
export function ReviewSummary({ average, count }: { average: number | null; count: number }) {
  if (count === 0 || average === null) {
    return <p className="text-sm text-slate-400">まだ口コミはありません</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <Stars value={average} size={22} />
      <span className="text-2xl font-bold text-slate-900 leading-none">{average.toFixed(1)}</span>
      <span className="text-sm text-slate-500">（{count}件）</span>
    </div>
  );
}
