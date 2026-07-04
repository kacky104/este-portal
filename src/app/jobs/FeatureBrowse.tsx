import Link from 'next/link';
import { JOB_FEATURE_GROUPS, featureLabel } from '@/app/lib/jobs';

// 「特徴から探す」チップ群（/jobs のトップと /jobs/tag/[slug] 下部の回遊で共用）。サーバーコンポーネント。
// 各チップは /jobs/tag/[slug] への内部リンク（内部リンク網の形成）。
// currentSlug を渡すと、そのタグを強調表示する（タグページ下部での現在地表示用）。
// areaSlug を渡すと、リンク先を /jobs/area/<areaSlug>/tag/<slug>（エリア×タグ掛け合わせ）に切替える
//（エリアページ／掛け合わせページで「このエリアの特徴から探す」導線として使う。未指定なら従来の /jobs/tag/<slug>）。
export function FeatureBrowse({
  title = '特徴から探す',
  currentSlug,
  areaSlug,
}: {
  title?: string;
  currentSlug?: string;
  areaSlug?: string;
}) {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
      </div>
      <div className="space-y-3">
        {JOB_FEATURE_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-[11px] font-bold text-slate-400 mb-1.5">{g.title}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.slugs.map((slug) => {
                const active = slug === currentSlug;
                const href = areaSlug ? `/jobs/area/${areaSlug}/tag/${slug}` : `/jobs/tag/${slug}`;
                return (
                  <Link
                    key={slug}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors"
                    style={
                      active
                        ? { background: 'linear-gradient(95deg,#10B981,#84CC16)', color: '#ffffff', borderColor: 'transparent' }
                        : { borderColor: '#A7F3D0', color: '#059669' }
                    }
                  >
                    {featureLabel(slug)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
