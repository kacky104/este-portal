import type { ReviewStats } from '@/app/lib/reviews';
import { Stars } from './Stars';

// 3軸内訳の1行（ラベル＋小さい星＋数値）。
function AxisRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-14 flex-shrink-0">{label}</span>
      <Stars value={value ?? 0} size={13} />
      <span className="text-xs font-bold text-slate-600 tabular-nums">
        {value === null ? '–' : value.toFixed(1)}
      </span>
    </div>
  );
}

// 口コミの集計表示（サーバーコンポーネント）。
// 総合平均（大きめ星）＋3軸内訳（接客/施術/受付対応）＋件数。0件なら「まだ口コミはありません」。
export function ReviewSummary({ stats }: { stats: ReviewStats }) {
  if (stats.count === 0 || stats.avgOverall === null) {
    return <p className="text-sm text-slate-400">まだ口コミはありません</p>;
  }

  return (
    <div className="space-y-3">
      {/* 総合 */}
      <div className="flex items-center gap-3">
        <Stars value={stats.avgOverall} size={22} />
        <span className="text-2xl font-bold text-slate-900 leading-none">
          {stats.avgOverall.toFixed(1)}
        </span>
        <span className="text-sm text-slate-500">（{stats.count}件）</span>
      </div>

      {/* 3軸内訳 */}
      <div className="space-y-1">
        <AxisRow label="接客" value={stats.avgService} />
        <AxisRow label="施術" value={stats.avgTechnique} />
        <AxisRow label="受付対応" value={stats.avgReception} />
      </div>
    </div>
  );
}
