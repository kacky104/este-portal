import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { fetchActiveJobs, getFeaturedJobs, JOB_BOOST_WEIGHT } from '@/app/lib/jobs';
import { shuffleJobs } from '@/app/lib/shuffleJobs';
import { BRAND_TITLE } from './layout';
import { JobCard } from './JobCard';
import { FeatureBrowse } from './FeatureBrowse';
import { AreaBrowse } from './AreaBrowse';
import { PickupSlider } from './PickupSlider';
import { JobHeroBanners } from './JobHeroBanners';
import { JobListHeading } from './JobListHeading';
import { deriveHeroBanners } from '@/app/lib/heroBanners';
import { fetchPublishedArticles } from '@/app/lib/workArticles';
import { ArticleCard } from './column/ArticleCard';

// ISR：10分ごとに再生成（SEO目的。求人は頻繁に変わらないためキャッシュで十分）。
export const revalidate = 600;

// ヘッダー/フッター/背景/共通OGPは jobs/layout.tsx（フクエスワーク）が担う。
// タイトルは /jobs トップ＝ブランドタイトルそのもの（title.absolute で親テンプレートを無効化）。
// ※ layout の title.template は子セグメント（/jobs/[id]・/jobs/tag/[slug]）にのみ効き、
//   同一セグメントのこの page.tsx には適用されない。未指定/生文字列だと Google が
//   ドメイン由来の「- フクエス」を付与してしまうため、ブランド名を明示する。
export const metadata: Metadata = {
  title: { absolute: BRAND_TITLE },
  description:
    '福岡のメンズエステで働くセラピスト求人をまとめて掲載。エリア・給与・こだわり条件から気になるお店の求人をチェックできます。未経験歓迎のメンズエステ求人も掲載中。',
  alternates: { canonical: '/jobs' },
};

export default async function JobsPage() {
  const [jobs, pickupJobs, columnArticles] = await Promise.all([
    fetchActiveJobs(),
    getFeaturedJobs(),
    fetchPublishedArticles(3),
  ]);

  // バナーカード：jobs（このページの条件＝全公開求人）からバナー画像ありを抽出し30分バケットでシャッフル（別クエリ無し）。
  const heroBanners = deriveHeroBanners(jobs);

  // メイン求人一覧のみ30分バケットでシード付きシャッフル（おすすめ pickupJobs・バナー heroBanners は別扱い）。
  // バナー設置特典：job_boost=true の求人は重み JOB_BOOST_WEIGHT で一覧の上側に来やすくする（false は従来どおり一様）。
  const shuffledJobs = shuffleJobs(jobs, (j) => (j.jobBoost ? JOB_BOOST_WEIGHT : 1));

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* ヒーロー画像（PC／SP 出し分け）。旧ウェルカム画面のENTERゲートは廃止し、TOP最上部に直接表示。
          server component 内での描画のため localStorage/state は使わず、SSRとクライアントで一致（ハイドレーション不整合なし）。
          .hero-shine-loop：斜めの白帯が画像上を4秒に1回横切る（純CSS・reduced-motionで無効）。 */}
      <div className="mb-8 -mt-2 rounded-2xl hero-shine-loop">
        {/* PC */}
        <Image
          src="/hero-fukuwork-pc.png"
          alt="フクエスワーク｜福岡メンズエステのセラピスト求人サイト"
          width={1920}
          height={1080}
          priority
          className="hidden md:block w-full h-auto rounded-2xl"
        />
        {/* SP */}
        <Image
          src="/hero-fukuwork-sp.png"
          alt="フクエスワーク｜福岡メンズエステのセラピスト求人サイト"
          width={1080}
          height={1920}
          priority
          className="md:hidden w-full h-auto rounded-2xl"
        />
      </div>

      {/* おすすめ求人（運営が featured_jobs に登録した求人のスライダー）。0件時はセクションごと非表示。 */}
      <PickupSlider jobs={pickupJobs} />

      {/* エリアから探す → 特徴から探す（おすすめ求人の直下）。求職者の探索順（まず勤務地エリア→次に条件）に
          合わせてエリアを特徴の直上に置く。おすすめ求人が0件（PickupSlider 非表示）でもこの位置に表示される。 */}
      <div className="mb-6 space-y-4">
        <AreaBrowse />
        <FeatureBrowse />
      </div>

      {/* 注目の求人（オーナー設定のバナー画像）。おすすめスライダーと既存求人一覧の間に配置。0件時は非表示。
          /jobsトップのみ見出しを「福岡のセラピスト求人」に差し替え（他ページで使う場合の既定は「注目の求人」）。 */}
      <JobHeroBanners banners={heroBanners} title="福岡のセラピスト求人" />

      {/* パンくず：フクエスワーク › 求人一覧（本体トップへの導線はヘッダー/フッターに任せる） */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          求人一覧
        </span>
      </nav>

      {/* お仕事コラム（work_articles の新着3件）。0件時はセクションごと非表示。見出しは h2（h1は上部バナーブロック）。 */}
      {columnArticles.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
              <h2 className="font-bold text-slate-900">お仕事コラム</h2>
            </div>
            <Link href="/jobs/column" className="flex-shrink-0 text-xs font-bold hover:opacity-80 transition-opacity" style={{ color: '#059669' }}>
              すべて見る →
            </Link>
          </div>
          <ul className="space-y-3">
            {columnArticles.map((a) => (
              <li key={a.id}>
                <ArticleCard article={a} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── セラピスト求人（テキスト一覧）：ページ最下部＝コラム枠より下に配置 ──
          見出しは常に h2（h1 は上部の JobHeroBanners が常設で担うため、ここを昇格させない）。 */}
      <div className="mt-10">
        <JobListHeading subtitle="福岡のメンズエステで働くセラピスト求人" />

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
            現在募集中の求人はありません
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
