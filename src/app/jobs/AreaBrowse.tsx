import Link from 'next/link';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, jobsAreaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

// 「エリアから探す」チップ群（/jobs/area/[slug] 下部の回遊で使用）。サーバーコンポーネント。
// 各チップは /jobs/area/<slug> への内部リンク（内部リンク網の形成）。FeatureBrowse のエリア版。
// 対象は通常5エリア＋出張専門（/jobs/dispatch）。全域センチネル ALL_AREA のみ除外。
// currentArea を渡すと、そのエリアを強調表示する（エリアページ下部での現在地表示用）。
// tagSlug を渡すと、リンク先を /jobs/area/<slug>/tag/<tagSlug>（同タグ×他エリア）に切替える
//（掛け合わせページで「他のエリアでこの特徴を探す」導線として使う。未指定なら従来の /jobs/area/<slug>）。
// 出張（DISPATCH_AREA）だけは例外：掛け合わせページを持たない単独ページのため href は常に /jobs/dispatch 固定
//（tagSlug が渡されても /jobs/dispatch/tag/... は生成しない＝404回避）。表示名も「出張専門」を用いる。
export function AreaBrowse({
  title = 'エリアから探す',
  currentArea,
  tagSlug,
}: {
  title?: string;
  currentArea?: string;
  tagSlug?: string;
}) {
  const areas = AREA_ORDER.filter((a) => a !== ALL_AREA);
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {areas.map((area) => {
          const active = area === currentArea;
          const isDispatch = area === DISPATCH_AREA;
          // 通常エリア: jobsAreaHref(area) が /jobs/area/<slug> を返す。tagSlug 指定時はその配下の掛け合わせへ。
          // 出張: 掛け合わせページを持たないため tagSlug に関わらず /jobs/dispatch 固定・表示名は「出張専門」。
          const href = isDispatch
            ? '/jobs/dispatch'
            : tagSlug
              ? `${jobsAreaHref(area)}/tag/${tagSlug}`
              : jobsAreaHref(area);
          return (
            <Link
              key={area}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors"
              style={
                active
                  ? { background: 'linear-gradient(95deg,#10B981,#84CC16)', color: '#ffffff', borderColor: 'transparent' }
                  : { borderColor: '#A7F3D0', color: '#059669' }
              }
            >
              {isDispatch ? '出張専門' : areaLabel(area)}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
