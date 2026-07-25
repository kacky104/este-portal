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

// マッチング導線ブロックの訴求チップ。文言は「無料・未経験可・条件で探せる」の3点に絞る
// （増やすと1行に収まらず折り返してブロックが縦に伸びるため）。
const MATCHING_POINTS = ['相談無料', '未経験OK', 'エリア・条件から'] as const;

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

      {/* お仕事マッチングへの導線（/jobs/matching）。希望を入力→運営が合うお店を無料で紹介・斡旋する入口。
          求人一覧を自分で探す前に「運営に探してもらう」選択肢を最上部で提示する。
          直上のヒーローに埋もれないよう華やかな見た目にしている：
            ・多色グラデ（emerald→lime→yellow）＋白のぼかし円で奥行き
            ・.hero-shine-loop（ヒーローと共用の白帯スイープ）。直上のヒーローと同時に光ると機械的に見えるため
              --hero-shine-duration で周期を6sにずらす（ヒーローは既定4s）。reduced-motion では globals.css 側で停止。
            ・装飾は aria-hidden／pointer-events-none。読み上げとタップ判定はリンク本体のまま。 */}
      <Link
        href="/jobs/matching"
        className="hero-shine-loop group relative block mb-6 overflow-hidden rounded-3xl px-4 py-5 sm:px-6 sm:py-6 ring-1 ring-white/50 transition-transform duration-300 hover:-translate-y-1"
        style={{
          background:
            'linear-gradient(115deg,#059669 0%,#10B981 30%,#4ADE80 55%,#A3E635 80%,#FDE047 100%)',
          boxShadow: '0 10px 25px -5px rgba(16,185,129,0.45)',
          '--hero-shine-duration': '6s',
        } as CSSProperties}
      >
        {/* 背景装飾（白のぼかし円）。テキストより背面・クリックは透過。 */}
        <span aria-hidden className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-white/25 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-14 left-6 h-36 w-36 rounded-full bg-white/20 blur-2xl" />

        {/* z-10＝白帯スイープ（::after は z-5）より前面。光がテキストの裏を通る。 */}
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2.5 py-1 text-[10px] sm:text-xs font-bold text-white ring-1 ring-white/40 backdrop-blur-sm">
            🐾 フクエスワーク公式マッチング
          </span>

          {/* SPは縦積み（見出しが2行に折れず、CTAを横幅いっぱいの押しやすいボタンにできる）。
              sm以上は横並びでCTAを右端に置く。 */}
          <div className="mt-2.5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-white font-black text-lg sm:text-2xl leading-tight tracking-tight drop-shadow-[0_2px_4px_rgba(4,90,70,0.35)]">
                あなたとお店をマッチング！<span aria-hidden>✨</span>
              </p>
              <p className="mt-1.5 text-white/95 text-xs sm:text-sm font-medium leading-relaxed">
                掲載店舗から得た情報とあなたのご希望の条件で、ピッタリなお店選びをお手伝いします！
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {MATCHING_POINTS.map((t) => (
                  <li
                    key={t}
                    className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-700"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            {/* CTA。SPは幅いっぱい（親指で押しやすい）、sm以上は右端で内容幅。 */}
            <span className="block w-full flex-shrink-0 rounded-full bg-white px-4 py-3 text-center text-sm font-black text-emerald-700 shadow-md transition-all group-hover:bg-emerald-50 group-hover:shadow-lg whitespace-nowrap sm:w-auto sm:self-center sm:px-5 sm:py-3">
              無料で相談 →
            </span>
          </div>
        </div>
      </Link>

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
  );
}
