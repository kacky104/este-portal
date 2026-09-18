import Link from 'next/link';
import Image from 'next/image';
import type { CSSProperties } from 'react';
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
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchLatestWorkNews, WORK_NEWS_FEED_TOP } from '@/app/lib/workNewsFeed';
import { WorkNewsFeedList } from './WorkNewsFeedList';
import { fetchAreaHeroBanner, JOBS_TOP_BANNER_AREA } from '@/app/lib/areaBanners';

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
  const [jobs, pickupJobs, columnArticles, workNews, topBanner] = await Promise.all([
    fetchActiveJobs(),
    getFeaturedJobs(),
    fetchPublishedArticles(3),
    // ★ 店舗新着情報（第275便・2026-09-11・カッキーさんの指示）。
    //   ★ トップは【1店舗1件】に間引く（第3引数 true）。★ 間引かないと自動配信で1店に埋まる。
    fetchLatestWorkNews(createPublicClient(), WORK_NEWS_FEED_TOP, true),
    // ★ 第482便: トップのヒーロー画像（管理画面「エリアバナー設定」の TOP 行）。★ 無ければ今までの固定画像
    fetchAreaHeroBanner(JOBS_TOP_BANNER_AREA).catch(() => null),
  ]);
  // ★ 第484便（カッキーさん）: PC は横長（2109×746・約2.8:1）の新しい画像。★ 管理画面で PC を入れていればそちらが優先
  const heroPc = topBanner?.pc ?? '/hero-fukuwork-pc-wide.jpg';
  const heroSp = topBanner?.sp ?? '/hero-fukuwork-sp.png';

  // バナーカード：jobs（このページの条件＝全公開求人）からバナー画像ありを抽出し30分バケットでシャッフル（別クエリ無し）。
  const heroBanners = deriveHeroBanners(jobs);

  // メイン求人一覧のみ30分バケットでシード付きシャッフル（おすすめ pickupJobs・バナー heroBanners は別扱い）。
  // バナー設置特典：job_boost=true の求人は重み JOB_BOOST_WEIGHT で一覧の上側に来やすくする（false は従来どおり一様）。
  const shuffledJobs = shuffleJobs(jobs, (j) => (j.jobBoost ? JOB_BOOST_WEIGHT : 1));

  return (
    <>
      {/* ★ 第483便（2026-09-18・カッキーさん）: ヒーロー画像は PC/SP とも【画面の横幅いっぱい】・角は直角。
          ★ そのため <main>（max-w-3xl）の外に出した。 */}
      {/* ヒーロー画像（PC／SP 出し分け）。旧ウェルカム画面のENTERゲートは廃止し、TOP最上部に直接表示。
          server component 内での描画のため localStorage/state は使わず、SSRとクライアントで一致（ハイドレーション不整合なし）。
          .hero-shine-loop：斜めの白帯が画像上を4秒に1回横切る（純CSS・reduced-motionで無効）。 */}
      <div className="hero-shine-loop">
        {/* PC */}
        <Image
          src={heroPc}
          alt="フクエスワーク｜福岡メンズエステのセラピスト求人サイト"
          width={2109}
          height={746}
          priority
          sizes="100vw"
          className="hidden md:block w-full h-auto"
        />
        {/* SP */}
        <Image
          src={heroSp}
          alt="フクエスワーク｜福岡メンズエステのセラピスト求人サイト"
          width={1080}
          height={1920}
          priority
          sizes="100vw"
          className="md:hidden w-full h-auto"
        />
      </div>

    <main className="max-w-3xl mx-auto px-4 py-8">

      {/* お仕事マッチングへの導線（/jobs/matching）。希望を入力→運営が合うお店を無料で紹介・斡旋する入口。
          ★ 第351便（2026-09-13・カッキーさんの指示）: コードで組んだグラデのカードをやめ、
            画像バナー（PC／SP 出し分け）に差し替えた。文言（公式マッチング・相談無料・未経験OK・
            条件から探せる・無料で相談）は画像の中にあるので、alt に同じ言葉を入れて読み上げと検索に残す。
          ★ 画像は角丸を透明にした WebP（public/matching-banner-pc.webp・-sp.webp）。
            角の外側が透けるので、背景色が変わっても白い角が浮かない。
          ★ .hero-shine-loop（白帯スイープ）は残す。直上のヒーローと同時に光らないよう周期は 6s のまま。
          ★ 出し分けの境目は md（ヒーローと同じ）。 */}
      <Link
        href="/jobs/matching"
        className="hero-shine-loop group relative block mb-6 overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-1"
        style={{ '--hero-shine-duration': '6s' } as CSSProperties}
      >
        {/* PC */}
        <Image
          src="/matching-banner-pc.webp"
          alt="フクエスワーク公式マッチング｜あなたとお店をマッチング！希望のエリアや条件から、あなたにぴったりのお店探しをお手伝いします。相談無料・未経験OK・条件から探せる。無料で相談"
          width={2172}
          height={724}
          sizes="(max-width: 768px) 100vw, 768px"
          className="hidden md:block w-full h-auto"
        />
        {/* SP */}
        <Image
          src="/matching-banner-sp.webp"
          alt="フクエスワーク公式マッチング｜あなたとお店をマッチング！希望のエリアや条件から、あなたにぴったりのお店探しをお手伝いします。相談無料・未経験OK・条件から探せる。無料で相談"
          width={1495}
          height={1052}
          sizes="100vw"
          className="md:hidden w-full h-auto"
        />
      </Link>

      {/* ★★ 店舗新着情報（第275便・2026-09-11・カッキーさんの指示）。
          ★ 置き場所は【マッチングのブロックの下】。★ フクエス本体のTOPと同じ形。
          ★ 1行タップで、その店の【求人詳細】へ（/jobs/<求人ID>）。
          ★ ここは1店舗1件に間引いている（トップが1店で埋まらないように）。
            ★ 全部見たいときは「もっと見る」→ /jobs/news（最新50件・間引かない）。
          ★ 0件のときはセクションごと出さない。 */}
      {workNews.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
              <h2 className="font-bold text-slate-900">店舗新着情報</h2>
            </div>
            <Link href="/jobs/news" className="flex-shrink-0 text-xs font-bold hover:opacity-80 transition-opacity" style={{ color: '#059669' }}>
              もっと見る →
            </Link>
          </div>
          <WorkNewsFeedList items={workNews} />
        </section>
      )}

      {/* おすすめ求人（運営が featured_jobs に登録した求人のスライダー）。0件時はセクションごと非表示。 */}
      <PickupSlider jobs={pickupJobs} title="おすすめ求人ピックアップ店舗" />

      {/* エリアから探す → 特徴から探す（おすすめ求人の直下）。求職者の探索順（まず勤務地エリア→次に条件）に
          合わせてエリアを特徴の直上に置く。おすすめ求人が0件（PickupSlider 非表示）でもこの位置に表示される。 */}
      <div className="mb-6 space-y-4">
        <AreaBrowse />
        <FeatureBrowse />
      </div>

      {/* 注目の求人（オーナー設定のバナー画像）。おすすめスライダーと既存求人一覧の間に配置。
          見出し(h1)はバナー0件でも常に描画し、バナー画像のみ0件なら省略（コンポーネント側で分岐）。
          /jobsトップのみ見出しを「福岡メンズエステのセラピスト求人」に差し替え（他ページで使う場合の既定は「注目の求人」）。
          h1 に主要KW「福岡メンズエステ」を含める（/reviews・/diary・/x-shops と同方針）。16字のため
          JobHeroBanners の段階縮小（15〜20字＝SPのみ text-base・nowrap）で1行に収まる。 */}
      <JobHeroBanners banners={heroBanners} title="福岡メンズエステのセラピスト求人" />

      {/* パンくず：フクエスワーク › 求人一覧（本体トップへの導線はヘッダー/フッターに任せる） */}
      {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエスワーク', path: '/jobs' },
        { name: '求人一覧', path: '/jobs' },
      ])) }} />
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
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
    </>
  );
}
