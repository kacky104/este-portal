import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  JOB_FEATURES,
  featureLabel,
  isValidFeatureSlug,
  fetchActiveJobsByAreaAndFeature,
} from '@/app/lib/jobs';
import { shuffleJobs } from '@/app/lib/shuffleJobs';
import { deriveHeroBanners } from '@/app/lib/heroBanners';
import { fetchAreaHeroBanner } from '@/app/lib/areaBanners';
import { areaFromSlug, AREA_SLUGS_LIST, DISPATCH_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { JobCard } from '../../../../JobCard';
import { JobHeroBanners } from '../../../../JobHeroBanners';
import { JobListHeading } from '../../../../JobListHeading';
import { AreaHeroBanner } from '../../../AreaHeroBanner';
import { FeatureBrowse } from '../../../../FeatureBrowse';
import { AreaBrowse } from '../../../../AreaBrowse';

// ISR：10分ごとに再生成（タグ・エリアページと同じ流儀）。
export const revalidate = 600;

// 通常5エリア × 特徴タグ18個 = 90ペアを全事前生成（出張 dispatch は対象外）。
export async function generateStaticParams() {
  const slugs = AREA_SLUGS_LIST.filter((s) => s !== 'dispatch');
  return slugs.flatMap((slug) => JOB_FEATURES.map((f) => ({ slug, tag: f.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; tag: string }>;
}): Promise<Metadata> {
  const { slug, tag } = await params;
  const area = areaFromSlug(slug);
  // 未知slug・出張・マスタ外タグは空メタ（本文側で notFound）。
  if (!area || area === DISPATCH_AREA || !isValidFeatureSlug(tag)) return {};
  const areaLbl = areaLabel(area);
  const tagLbl = featureLabel(tag);
  // 文書<title>は layout の template「%s｜フクエスワーク」が末尾を付与するため、ここでは
  // ブランド名を含めない。og:title / twitter:title には template が効かないため別途明示する。
  const baseTitle = `${areaLbl}×${tagLbl}のメンズエステセラピスト求人【福岡】`;
  const brandedTitle = `${baseTitle}｜フクエスワーク`;
  const description = `福岡・${areaLbl}で「${tagLbl}」のメンズエステ セラピスト求人を掲載。${areaLbl}エリア×${tagLbl}の条件で働けるお店の求人をフクエスワークでチェックできます。`;

  // 0件の掛け合わせページは薄いページのため noindex（1件以上は通常index）。
  const jobs = await fetchActiveJobsByAreaAndFeature(area, tag);
  const robots = jobs.length === 0 ? { index: false, follow: true } : undefined;

  return {
    title: baseTitle,
    description,
    ...(robots ? { robots } : {}),
    openGraph: { title: brandedTitle, description },
    twitter: { title: brandedTitle, description },
  };
}

export default async function JobAreaTagPage({
  params,
}: {
  params: Promise<{ slug: string; tag: string }>;
}) {
  const { slug, tag } = await params;
  const area = areaFromSlug(slug);
  // 未知slug・出張（対象外）は404。
  if (!area || area === DISPATCH_AREA) notFound();
  // マスタ外タグは404（タグページと同じ流儀）。
  if (!isValidFeatureSlug(tag)) notFound();

  const areaLbl = areaLabel(area);
  const tagLbl = featureLabel(tag);
  // 掛け合わせ求人一覧と、このエリアのヒーローバナー（エリア単位・タグ別画像はなし）を並列取得。
  // バナー未設定エリアは null＝非表示（AreaHeroBanner の return null に任せる）。
  const [jobs, heroBanner] = await Promise.all([
    fetchActiveJobsByAreaAndFeature(area, tag),
    fetchAreaHeroBanner(area),
  ]);

  // メイン求人一覧を30分バケットでシード付きシャッフル（このページはおすすめ枠なし）。
  const shuffledJobs = shuffleJobs(jobs);
  // このエリア×タグの求人からバナーカードを派生（画像あり・先頭最大10件・30分バケットでシャッフル）。
  const heroBanners = deriveHeroBanners(jobs);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：求人一覧 › {エリアlabel} › {タグlabel}（3階層） */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          求人一覧
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <Link href={`/jobs/area/${slug}`} className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          {areaLbl}
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          {tagLbl}
        </span>
      </nav>

      {/* エリア専用ヒーローバナー（area_hero_banners・エリア単位）。エリア単独ページと同位置・同props。 */}
      <AreaHeroBanner banner={heroBanner} areaLabel={areaLbl} />

      {/* バナーカードブロック（キーワード見出し h1・一覧の直上）。バナー0件なら非表示。 */}
      <JobHeroBanners banners={heroBanners} title={`${areaLbl}×${tagLbl}のセラピスト求人`} />

      {/* 一覧見出し「セラピスト求人」。バナーがあれば h2、無ければ h1（h1消失防止）。 */}
      <JobListHeading subtitle={`福岡のメンズエステ・${areaLbl}／${tagLbl}の求人`} asH1={heroBanners.length === 0} />

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center shadow-sm">
          <p className="text-slate-500 text-sm">現在この条件の求人はありません</p>
          <Link
            href={`/jobs/area/${slug}`}
            className="inline-block mt-4 text-sm font-bold px-5 py-2.5 rounded-xl border transition-colors hover:bg-emerald-50"
            style={{ borderColor: '#6EE7B7', color: '#059669' }}
          >
            {areaLbl}の求人をすべて見る →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {shuffledJobs.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      )}

      {/* 回遊：同エリアの他タグ（掛け合わせ）／同タグの他エリア（掛け合わせ） */}
      <div className="mt-8 space-y-4">
        <FeatureBrowse title={`${areaLbl}の他の特徴から探す`} areaSlug={slug} currentSlug={tag} />
        <AreaBrowse title={`他のエリアで「${tagLbl}」を探す`} tagSlug={tag} currentArea={area} />
      </div>
    </main>
  );
}
