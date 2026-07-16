import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  JOB_FEATURES,
  featureLabel,
  isValidFeatureSlug,
  fetchActiveJobsByFeature,
  JOB_BOOST_WEIGHT,
} from '@/app/lib/jobs';
import { shuffleJobs } from '@/app/lib/shuffleJobs';
import { deriveHeroBanners } from '@/app/lib/heroBanners';
import { JobCard } from '../../JobCard';
import { JobHeroBanners } from '../../JobHeroBanners';
import { JobListHeading } from '../../JobListHeading';
import { FeatureBrowse } from '../../FeatureBrowse';
import { AreaBrowse } from '../../AreaBrowse';

// ISR：10分ごとに再生成。
export const revalidate = 600;

// 固定マスタなので全slugをビルド時生成（paramsが有限固定＝空配列鉄則の例外）。
export async function generateStaticParams() {
  return JOB_FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidFeatureSlug(slug)) return {};
  const label = featureLabel(slug);
  // 文書<title>は layout の template「%s｜フクエスワーク」が末尾を付与するため、ここでは
  // ブランド名を含めない（含めると「…｜フクエスワーク｜フクエスワーク」と二重化する）。
  // og:title / twitter:title には template が効かないため、ブランド付きを別途明示する。
  const baseTitle = `${label}のメンズエステセラピスト求人【福岡】`;
  const brandedTitle = `${baseTitle}｜フクエスワーク`;
  const description = `福岡で「${label}」のメンズエステ セラピスト求人を掲載。${label}の条件で働けるお店の求人情報をフクエスワークでチェックできます。`;

  // 0件のタグページは薄いページのため noindex（1件以上は通常index）。
  const jobs = await fetchActiveJobsByFeature(slug);
  const robots = jobs.length === 0 ? { index: false, follow: true } : undefined;

  // noindex（0件）ページには canonical を付けず、indexさせる正常系のみ自己参照 canonical を付与。
  return {
    title: baseTitle,
    description,
    ...(robots ? { robots } : { alternates: { canonical: `/jobs/tag/${slug}` } }),
    openGraph: { title: brandedTitle, description },
    twitter: { title: brandedTitle, description },
  };
}

export default async function JobTagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // マスタ外slugは404。
  if (!isValidFeatureSlug(slug)) notFound();

  const label = featureLabel(slug);
  const jobs = await fetchActiveJobsByFeature(slug);
  // メイン求人一覧を30分バケットでシード付きシャッフル（このページはおすすめ枠なし）。
  const shuffledJobs = shuffleJobs(jobs, (j) => (j.jobBoost ? JOB_BOOST_WEIGHT : 1));
  // このタグの求人からバナーカードを派生（画像あり・30分バケットでシャッフル→先頭最大 HERO_BANNER_LIMIT=30 件）。
  const heroBanners = deriveHeroBanners(jobs);

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

      {/* バナーカードブロック（キーワード見出し h1・一覧の直上）。見出し(h1)はバナー0件でも常に描画し、
          バナー画像のみ0件なら省略（コンポーネント側で分岐）。
          タグページはこのブロックが最上部の大画像＝LCPのため、先頭バナーに priority を付与。 */}
      <JobHeroBanners banners={heroBanners} title={`${label}のセラピスト求人`} priority />

      {/* 他タグへの回遊＋「エリア×この特徴」掛け合わせページへの逆方向リンク（掛け合わせページ末尾と同じ並び） */}
      <div className="mt-8 space-y-4">
        <FeatureBrowse title="他の特徴から探す" currentSlug={slug} />
        <AreaBrowse title={`エリア別に「${label}」を探す`} tagSlug={slug} />
      </div>

      {/* セラピスト求人（テキスト一覧）：ページ最下部＝回遊ブロックより下に配置。
          見出しは常に h2（h1 は上部の JobHeroBanners が常設で担う）。 */}
      <div className="mt-10">
        <JobListHeading subtitle={`福岡のメンズエステ・${label}の求人`} />

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center shadow-sm">
            <p className="text-slate-500 text-sm">現在この条件の求人はありません</p>
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
            {shuffledJobs.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
