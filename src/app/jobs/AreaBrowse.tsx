import Link from 'next/link';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, jobsAreaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

// 「エリアから探す」チップ群（/jobs/area/[slug] 下部の回遊で使用）。サーバーコンポーネント。
// 各チップは /jobs/area/<slug> への内部リンク（内部リンク網の形成）。FeatureBrowse のエリア版。
// 対象は通常5エリアのみ（全域センチネル ALL_AREA と 出張 DISPATCH_AREA は除外）。
// currentArea を渡すと、そのエリアを強調表示する（エリアページ下部での現在地表示用）。
export function AreaBrowse({
  title = 'エリアから探す',
  currentArea,
}: {
  title?: string;
  currentArea?: string;
}) {
  const areas = AREA_ORDER.filter((a) => a !== ALL_AREA && a !== DISPATCH_AREA);
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {areas.map((area) => {
          const active = area === currentArea;
          return (
            <Link
              key={area}
              href={jobsAreaHref(area)}
              aria-current={active ? 'page' : undefined}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors"
              style={
                active
                  ? { background: 'linear-gradient(95deg,#10B981,#84CC16)', color: '#ffffff', borderColor: 'transparent' }
                  : { borderColor: '#A7F3D0', color: '#059669' }
              }
            >
              {areaLabel(area)}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
