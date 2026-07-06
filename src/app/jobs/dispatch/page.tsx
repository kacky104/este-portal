import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchActiveDispatchJobs, getFeaturedJobs } from '@/app/lib/jobs';
import { shuffleJobs } from '@/app/lib/shuffleJobs';
import { fetchAreaHeroBanner } from '@/app/lib/areaBanners';
import { DISPATCH_AREA } from '@/app/lib/areas';
import { JobCard } from '../JobCard';
import { PickupSlider } from '../PickupSlider';
import { AreaBrowse } from '../AreaBrowse';
import { FeatureBrowse } from '../FeatureBrowse';
import { AreaHeroBanner } from '../area/AreaHeroBanner';
import { JobHeroBanners } from '../JobHeroBanners';
import { JobListHeading } from '../JobListHeading';
import { deriveHeroBanners } from '@/app/lib/heroBanners';

// ISR：10分ごとに再生成（エリア単独ページと同じ流儀）。
export const revalidate = 600;

// 出張専門は静的ルート（/jobs/dispatch・動的params無し）のため generateStaticParams は不要。
// title/description はエリアページ generateMetadata のフォーマットを踏襲し「出張専門」で静的に定義。
const BASE_TITLE = '出張専門のメンズエステセラピスト求人【福岡】';
const BRANDED_TITLE = `${BASE_TITLE}｜フクエスワーク`;
const DESCRIPTION =
  '福岡・出張専門のメンズエステ セラピスト求人を掲載。出張専門で働けるお店の求人情報をフクエスワークでチェックできます。';

export const metadata: Metadata = {
  // 文書<title>は layout の template「%s｜フクエスワーク」が末尾を付与するため、ここでは
  // ブランド名を含めない。og:title / twitter:title には template が効かないため別途明示する。
  title: BASE_TITLE,
  description: DESCRIPTION,
  openGraph: { title: BRANDED_TITLE, description: DESCRIPTION },
  twitter: { title: BRANDED_TITLE, description: DESCRIPTION },
};

export default async function JobDispatchPage() {
  // 出張専門の求人一覧／おすすめ（featured_jobs.area='出張'）／ヒーローバナー（area_hero_banners）を並列取得。
  // おすすめ・バナーとも該当行が無ければ空/null＝非表示（各コンポーネントの return null に任せる）。
  const [jobs, pickupJobs, heroBanner] = await Promise.all([
    fetchActiveDispatchJobs(),
    getFeaturedJobs(DISPATCH_AREA),
    fetchAreaHeroBanner(DISPATCH_AREA),
  ]);

  // メイン求人一覧のみ30分バケットでシード付きシャッフル（おすすめ pickupJobs は対象外）。
  const shuffledJobs = shuffleJobs(jobs);
  // 出張専門の求人からバナーカードを派生（画像あり・先頭最大10件・30分バケットでシャッフル）。
  const heroBanners = deriveHeroBanners(jobs);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › 求人一覧 › 出張専門 */}
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
          出張専門
        </span>
      </nav>

      {/* 出張専門ヒーローバナー（area_hero_banners の area='出張' 行・行があるときのみ表示）。パンくず直下・スライダー上。 */}
      <AreaHeroBanner banner={heroBanner} areaLabel="出張専門" />

      {/* 出張専門のおすすめ求人（featured_jobs.area='出張'）。0件時はセクションごと非表示。
          見出しは「出張専門のおすすめ求人」。トップの並びと同順で一覧の上に置く。 */}
      <PickupSlider jobs={pickupJobs} title="出張専門のおすすめ求人" />

      {/* バナーカードブロック（キーワード見出し h1・一覧の直上）。バナー0件なら非表示。 */}
      <JobHeroBanners banners={heroBanners} title="出張専門のセラピスト求人" />

      {/* 一覧見出し「セラピスト求人」。バナーがあれば h2、無ければ h1（h1消失防止）。 */}
      <JobListHeading subtitle="福岡のメンズエステ・出張専門の求人" asH1={heroBanners.length === 0} h1Title="出張専門のセラピスト求人" />

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
          {shuffledJobs.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      )}

      {/* 特徴タグ絞り込み（/jobs/tag/[slug]）＋他エリアへの回遊。出張は掛け合わせページを持たないため
          FeatureBrowse に areaSlug は渡さない（/jobs/tag/<slug> への通常リンク＝404にならない）。 */}
      <div className="mt-8 space-y-4">
        <FeatureBrowse title="特徴から探す" />
        <AreaBrowse title="他のエリアから探す" currentArea={DISPATCH_AREA} />
      </div>
    </main>
  );
}
