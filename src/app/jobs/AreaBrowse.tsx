import Link from 'next/link';
import Image from 'next/image';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, jobsAreaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { fetchAreaBrowseIcons } from '@/app/lib/areaIcons';

// 「エリアから探す」画像アイコンタイル群（/jobs トップ・/jobs/area 下部の回遊で使用）。async サーバーコンポーネント。
// 各タイルは /jobs/area/<slug>（出張は /jobs/dispatch）への内部リンク（内部リンク網の形成）。FeatureBrowse のエリア版。
// 対象は通常5エリア＋出張専門（/jobs/dispatch）＝6枚。全域センチネル ALL_AREA のみ除外。
// アイコン画像は area_browse_icons（fetchAreaBrowseIcons）で DB 管理。画像未設定エリアは同セルにチップ相当の
// テキストリンクをフォールバック表示する（グリッド配置・セルサイズは維持。全未設定でも6セルとして成立）。
// currentArea を渡すと、そのエリアを強調表示する（エリアページ下部での現在地表示用）。
// tagSlug を渡すと、リンク先を /jobs/area/<slug>/tag/<tagSlug>（同タグ×他エリア）に切替える
//（掛け合わせページで「他のエリアでこの特徴を探す」導線として使う。未指定なら従来の /jobs/area/<slug>）。
// 出張（DISPATCH_AREA）だけは例外：掛け合わせページを持たない単独ページのため href は常に /jobs/dispatch 固定
//（tagSlug が渡されても /jobs/dispatch/tag/... は生成しない＝404回避）。表示名も「出張専門」を用いる。
export async function AreaBrowse({
  title = 'エリアから探す',
  currentArea,
  tagSlug,
}: {
  title?: string;
  currentArea?: string;
  tagSlug?: string;
}) {
  const areas = AREA_ORDER.filter((a) => a !== ALL_AREA);
  const icons = await fetchAreaBrowseIcons();
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
      </div>
      {/* スマホ2列×3段／PC(md以上)3列×2段。各セルは横長 2:1 で行高を揃える。 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
          const label = isDispatch ? '出張専門' : areaLabel(area);
          const iconUrl = icons[area];

          // 画像あり：写真タイル（下部グラデ＋白ラベル）。アクティブはリングで現在地を明示。
          if (iconUrl) {
            return (
              <Link
                key={area}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative block aspect-[2/1] rounded-xl overflow-hidden border transition-shadow ${
                  active ? 'border-transparent ring-2 ring-emerald-500' : 'border-emerald-100'
                }`}
              >
                <Image
                  src={iconUrl}
                  alt={label}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                <span className="absolute bottom-1.5 left-2 right-2 text-white font-bold text-xs leading-tight drop-shadow line-clamp-1">
                  {label}
                </span>
              </Link>
            );
          }

          // 画像なし：現行チップ相当のテキストリンクを同セル（2:1）で表示。グリッド配置・行高を維持。
          return (
            <Link
              key={area}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center justify-center text-center aspect-[2/1] rounded-xl border text-xs font-bold px-2 transition-colors ${
                active ? 'text-white border-transparent' : ''
              }`}
              style={
                active
                  ? { background: 'linear-gradient(95deg,#10B981,#84CC16)', borderColor: 'transparent' }
                  : { borderColor: '#A7F3D0', color: '#059669' }
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
