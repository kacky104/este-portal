import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  JOB_FEATURES,
  featureLabel,
  isValidFeatureSlug,
  fetchActiveJobsByFeature,
} from '@/app/lib/jobs';
import { JobCard } from '../../JobCard';
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

  return {
    title: baseTitle,
    description,
    ...(robots ? { robots } : {}),
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
          {jobs.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      )}

      {/* 他タグへの回遊＋「エリア×この特徴」掛け合わせページへの逆方向リンク（掛け合わせページ末尾と同じ並び） */}
      <div className="mt-8 space-y-4">
        <FeatureBrowse title="他の特徴から探す" currentSlug={slug} />
        <AreaBrowse title={`エリア別に「${label}」を探す`} tagSlug={slug} />
      </div>
    </main>
  );
}
