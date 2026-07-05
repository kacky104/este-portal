import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchActiveJobsByArea, getFeaturedJobs } from '@/app/lib/jobs';
import { fetchAreaHeroBanner } from '@/app/lib/areaBanners';
import { areaFromSlug, AREA_SLUGS_LIST, DISPATCH_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { JobCard } from '../../JobCard';
import { PickupSlider } from '../../PickupSlider';
import { AreaBrowse } from '../../AreaBrowse';
import { FeatureBrowse } from '../../FeatureBrowse';
import { AreaHeroBanner } from '../AreaHeroBanner';

// ISR：10分ごとに再生成（タグページと同じ流儀）。
export const revalidate = 600;

// 通常5エリアをビルド時生成（出張 dispatch は今回対象外・下の notFound で404）。
export async function generateStaticParams() {
  return AREA_SLUGS_LIST.filter((s) => s !== 'dispatch').map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const area = areaFromSlug(slug);
  // 未知slug・出張は空メタ（本文側で notFound）。
  if (!area || area === DISPATCH_AREA) return {};
  const label = areaLabel(area);
  // 文書<title>は layout の template「%s｜フクエスワーク」が末尾を付与するため、ここでは
  // ブランド名を含めない。og:title / twitter:title には template が効かないため別途明示する。
  const baseTitle = `${label}のメンズエステセラピスト求人【福岡】`;
  const brandedTitle = `${baseTitle}｜フクエスワーク`;
  const description = `福岡・${label}のメンズエステ セラピスト求人を掲載。${label}エリアで働けるお店の求人情報をフクエスワークでチェックできます。`;

  // 0件のエリアページは薄いページのため noindex（1件以上は通常index）。
  const jobs = await fetchActiveJobsByArea(area);
  const robots = jobs.length === 0 ? { index: false, follow: true } : undefined;

  return {
    title: baseTitle,
    description,
    ...(robots ? { robots } : {}),
    openGraph: { title: brandedTitle, description },
    twitter: { title: brandedTitle, description },
  };
}

export default async function JobAreaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const area = areaFromSlug(slug);
  // 未知slug・出張（今回対象外）は404。
  if (!area || area === DISPATCH_AREA) notFound();

  const label = areaLabel(area);
  // このエリアの求人一覧／おすすめ（featured_jobs.area）／ヒーローバナー（area_hero_banners）を並列取得。
  // おすすめ・バナーとも該当行が無ければ空/null＝非表示（各コンポーネントの return null に任せる）。
  const [jobs, pickupJobs, heroBanner] = await Promise.all([
    fetchActiveJobsByArea(area),
    getFeaturedJobs(area),
    fetchAreaHeroBanner(area),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › 求人一覧 › {label} */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          求人一覧
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          {label}
        </span>
      </nav>

      {/* 見出し */}
      <div className="mb-6">
        <h1
          className="text-2xl sm:text-3xl font-extrabold inline-block"
          style={{
            background: 'linear-gradient(95deg,#10B981,#84CC16)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          {label}のセラピスト求人
        </h1>
        <p className="text-sm text-slate-500 mt-1.5">福岡のメンズエステ・{label}の求人</p>
      </div>

      {/* エリア専用ヒーローバナー（area_hero_banners から fetch・行があるエリアのみ表示）。見出し直下・スライダー上。 */}
      <AreaHeroBanner banner={heroBanner} areaLabel={label} />

      {/* このエリア専用のおすすめ求人（featured_jobs.area = このエリア）。0件時はセクションごと非表示。
          見出しは表示名（areaLabel経由）で「{エリア名}のおすすめ求人」。トップの並びと同順で一覧の上に置く。 */}
      <PickupSlider jobs={pickupJobs} title={`${label}のおすすめ求人`} />

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center shadow-sm">
          <p className="text-slate-500 text-sm">現在このエリアの求人はありません</p>
          <Link
            href="/jobs"
            className="inline-block mt-4 text-sm font-bold px-5 py-2.5 rounded-xl border transition-colors hover:bg-emerald-50"
            style={{ borderColor: '#6EE7B7', color: '#059669' }}
          >
            すべての求人を見る →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      )}

      {/* このエリア×特徴タグの掛け合わせページへの入口（内部リンク網の主経路）＋他エリアへの回遊 */}
      <div className="mt-8 space-y-4">
        <FeatureBrowse title={`${label}の特徴から探す`} areaSlug={slug} />
        <AreaBrowse title="他のエリアから探す" currentArea={area} />
      </div>
    </main>
  );
}
