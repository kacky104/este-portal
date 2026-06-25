import type { ReviewStats } from '@/app/lib/reviews';
import { Stars } from './Stars';

// 3軸内訳の1項目（ラベル＋小さい星＋数値）。PC（md以上）で横並び表示に使う。
// 横並びのためラベルの固定幅（w-14）は付けない。
function AxisRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <Stars value={value ?? 0} size={13} />
      <span className="text-xs font-bold text-slate-600 tabular-nums">
        {value === null ? '–' : value.toFixed(1)}
      </span>
    </div>
  );
}

// スマホ（md未満）の数字のみ横並び1項目（ラベル＋数値、星なし）。
function AxisInline({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-bold text-slate-600 tabular-nums">
        {value === null ? '–' : value.toFixed(1)}
      </span>
    </span>
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

      {/* 3軸内訳：PC（md以上）は星付き・横並び。スマホは数字のみ・横並び。 */}
      <div className="hidden md:flex md:flex-row md:flex-wrap md:items-center gap-x-4 gap-y-1">
        <AxisRow label="接客" value={stats.avgService} />
        <AxisRow label="施術" value={stats.avgTechnique} />
        <AxisRow label="受付対応" value={stats.avgReception} />
      </div>
      <div className="md:hidden flex items-center flex-wrap gap-x-4 gap-y-1">
        <AxisInline label="接客" value={stats.avgService} />
        <AxisInline label="施術" value={stats.avgTechnique} />
        <AxisInline label="受付対応" value={stats.avgReception} />
      </div>
    </div>
  );
}
