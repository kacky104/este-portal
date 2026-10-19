import Link from 'next/link';
import Image from 'next/image';
import { ResponsivePicture } from '@/app/components/ResponsivePicture';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { fetchActiveJobs, getFeaturedJobs, JOB_BOOST_WEIGHT } from '@/app/lib/jobs';
import { shuffleJobs } from '@/app/lib/shuffleJobs';
import { JobCard } from './JobCard';
import { FeatureBrowse } from './FeatureBrowse';
import { AreaBrowse } from './AreaBrowse';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA, normalizeAreaKey, jobsAreaHref } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { PickupSlider } from './PickupSlider';
import { JobHeroBanners } from './JobHeroBanners';
import { JobListHeading } from './JobListHeading';
import { deriveHeroBanners } from '@/app/lib/heroBanners';
import { fetchPublishedArticles } from '@/app/lib/workArticles';
import { ArticleCard } from './column/ArticleCard';
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
// ★ 第1494便（2026-10-15・カッキーさん・Search Console）: /jobs は3か月で表示 約3,200回・平均29位。
//   タイトルを探される言葉（福岡 メンズエステ 求人）から始める。共有用の OGP は layout の BRAND_TITLE のまま。
// ★ 第1572便（2026-10-20・カッキーさん）: GSC で「福岡 メンズエステ 求人」「福岡 メンズエステ セラピスト求人」の表示が増えたのにクリックがほぼ 0。
//   検索語の並び（福岡／メンズエステ／求人／セラピスト）を先頭 30 字に収め、条件語は後ろへ。
const JOBS_TOP_TITLE = '福岡のメンズエステ求人・セラピスト募集｜未経験歓迎・日払い【フクエスワーク】';

// ★ 第1573便（2026-10-20・カッキーさん・SEO）: エリア別の求人数と短い案内文。
//   「福岡 メンズエステ 求人」「博多／中洲 メンズエステ 求人」で表示は出るのに 20〜45 位のため、本文に地名入りの説明を足す。
//   ★ 件数は一覧用に取った jobs（salons.area / area2）から数える＝追加のクエリは無い。
//   ★ 言い回しは TOP（areaSeoContent）やエリアページの文と変える（求人＝「働く人」の目線で書く）。
//   ★ 出張専門は salons.dispatch_type でしか判定できないため、この表には入れない（「エリアから探す」のタイルに任せる）。
const AREA_JOB_GUIDE: Record<string, string> = {
  '博多・天神・中洲':
    '福岡でいちばん求人が多いエリア。博多駅や天神駅から歩ける店が多く、仕事終わりの終電や、昼だけ・夜だけの短時間でも組みやすいのが特徴です。中洲は深夜帯の需要があり、ダブルワークや掛け持ちで入る人も見られます。',
  '北九州・小倉':
    '小倉駅周辺に店が集まり、北九州市内から通う人が中心です。福岡市内より競合が少ないぶん、新人のうちから指名を取りやすいという声もあります。',
  '久留米':
    '西鉄久留米駅・JR久留米駅の周辺に店があり、筑後エリアや佐賀方面から通う人もいます。地元で落ち着いて長く働きたい人に向いたエリアです。',
  '福岡県その他':
    '糸島・春日・大野城・宗像など、福岡市と北九州市の外側のエリア。店の数は少なめですが、車通勤できる店や、寮・住み込みに対応する店が含まれます。',
};

/** 一覧用の jobs から、エリアごとの求人数を数える（第1エリア・第2エリアのどちらかに含まれれば 1 件）。 */
function countJobsByArea(jobs: { salon: { area: string; area2: string } }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const j of jobs) {
    const keys = new Set([j.salon.area, j.salon.area2].filter(Boolean).map((a) => normalizeAreaKey(a)));
    for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

// ★ 第1494便: ページ下の「よくある質問」（画面と構造化データ FAQPage で同じ文を使う）。
//   ★ 答えはお店ごとに違うことを言い切らない（「お店によって違います」・各求人の特徴で確かめる）。
const JOBS_FAQ: { q: string; a: string; links: { href: string; label: string }[] }[] = [
  {
    q: '未経験でも働けますか？',
    a: '働けます。「未経験歓迎」のお店の求人がたくさんあります。施術の教え方はお店ごとに違うので、面接や体験入店で確かめると安心です。',
    links: [{ href: '/jobs/tag/mikeiken', label: '未経験歓迎の求人を見る' }],
  },
  {
    q: '日払いはできますか？',
    a: '「日払いOK」のお店では、働いたその日にお給料を受け取れます。受け取り方はお店によって違うので、求人の内容で確かめてください。',
    links: [{ href: '/jobs/tag/hibarai', label: '日払いOKの求人を見る' }],
  },
  {
    q: '体験入店はできますか？',
    a: '「体験入店OK」のお店では、本格的に働く前にお試しで働けます。お店の雰囲気やお客様の層を知ってから決められます。',
    links: [
      { href: '/jobs/tag/taiken', label: '体験入店OKの求人を見る' },
      { href: '/jobs/glossary/taiken-nyuten', label: '用語集「体験入店」' },
    ],
  },
  {
    q: '寮や住む所はありますか？',
    a: 'お店によっては寮や住む所を用意しています。遠方から働きたい方は、求人の内容を見るか、お店に問い合わせてみてください。',
    links: [{ href: '/jobs/glossary/ryo-sumikomi', label: '用語集「寮・住み込み」' }],
  },
  {
    q: 'どのエリアの求人がありますか？',
    a: '博多・天神・中洲、北九州・小倉、久留米など、福岡県内のメンズエステの求人を掲載しています。ページ上の「エリアから探す」から選べます。',
    links: [],
  },
  {
    q: 'お給料（バック率）はどれくらいですか？',
    a: 'メンズエステのお給料は、コース料金のうち決まった割合（バック率）を受け取る形が一般的です。割合や指名料の扱いはお店ごとに違うので、求人の給与欄と、面接でのすり合わせで確かめてください。',
    links: [
      { href: '/jobs/glossary/back-ritsu', label: '用語集「バック率」' },
      { href: '/jobs/column/salary-back-rate', label: 'コラム「バック率の見方」' },
    ],
  },
  {
    q: '週1日・短時間でも働けますか？',
    a: '「自由出勤」のお店では、週1日や数時間だけの出勤も相談できます。学校や本業と両立している人も多いので、希望のシフトを面接で伝えてみてください。',
    links: [
      { href: '/jobs/glossary/jiyu-shukkin', label: '用語集「自由出勤」' },
      { href: '/jobs/glossary/kakemochi', label: '用語集「掛け持ち」' },
    ],
  },
  {
    q: '面接では何を聞かれますか？持ち物は？',
    a: '希望の出勤日数・時間帯・経験の有無・通える範囲などを聞かれることが多いです。身分証（年齢確認）は必ず要ります。服装や持ち物はお店から案内があるので、事前に確認しておくと安心です。',
    links: [
      { href: '/jobs/column/interview-preparation', label: 'コラム「面接の準備」' },
      { href: '/jobs/glossary/nenrei-kakunin', label: '用語集「年齢確認」' },
    ],
  },
  {
    q: '身バレが心配です。対策はありますか？',
    a: '源氏名で働く・写真の顔出しをしない・出勤エリアを選ぶなど、できる対策はいくつかあります。写メ日記や写真の出し方はお店ごとに相談できるので、応募のときに伝えておくとスムーズです。',
    links: [
      { href: '/jobs/glossary/mibare-taisaku', label: '用語集「身バレ対策」' },
      { href: '/jobs/column/privacy-guide', label: 'コラム「プライバシーの守り方」' },
    ],
  },
  {
    q: 'お店選びに迷ったら？',
    a: 'フクエスワークの公式マッチングに希望のエリアや条件を伝えると、合いそうなお店を無料でご紹介します。',
    links: [{ href: '/jobs/matching', label: '公式マッチングで相談する（無料）' }],
  },
];

export const metadata: Metadata = {
  title: { absolute: JOBS_TOP_TITLE },
  description:
    '福岡（博多・天神・中洲・北九州・久留米）のメンズエステ セラピスト求人を掲載。未経験歓迎・日払い・高収入・寮あり・出稼ぎなどの条件から探せます。各店の新着情報や体験入店の流れも。福岡のメンエス求人ならフクエスワーク。',
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
  // ★ 第1573便: エリア別の求人数（追加クエリなし）
  const areaCounts = countJobsByArea(jobs);
  const guideAreas = AREA_ORDER.filter((a) => a !== ALL_AREA && a !== DISPATCH_AREA && AREA_JOB_GUIDE[a]);

  return (
    <>
      {/* ★ 第483便（2026-09-18・カッキーさん）: ヒーロー画像は PC/SP とも【画面の横幅いっぱい】・角は直角。
          ★ そのため <main>（max-w-3xl）の外に出した。 */}
      {/* ヒーロー画像（PC／SP 出し分け）。旧ウェルカム画面のENTERゲートは廃止し、TOP最上部に直接表示。
          server component 内での描画のため localStorage/state は使わず、SSRとクライアントで一致（ハイドレーション不整合なし）。
          .hero-shine-loop：斜めの白帯が画像上を4秒に1回横切る（純CSS・reduced-motionで無効）。 */}
      <div className="hero-shine-loop">
        {/* ★ 第1054便: PC／SP の2枚出し（hidden md:block）をやめ、<picture> で片方だけ転送する。 */}
        <ResponsivePicture
          pc={{ src: heroPc, width: 2109, height: 746 }}
          sp={{ src: heroSp, width: 1080, height: 1920 }}
          alt="フクエスワーク｜福岡メンズエステのセラピスト求人サイト"
          priority
          sizes="100vw"
          className="w-full h-auto"
        />
      </div>

    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* ★ 第1056便: h1 をページ上部に（以前は「店舗新着情報」など h2 が4つ先に来てから h1 だった）。
          見た目は変えない（ヒーロー画像がその役を担うので sr-only）。下の JobHeroBanners は h2 に落とした。 */}
      <h1 className="sr-only">福岡メンズエステのセラピスト求人｜フクエスワーク</h1>

      {/* ★ 第1494便（カッキーさん・SEO）: 見える紹介文（2〜3行）。本文に説明の文章がほとんど無かったため */}
      <p className="mb-6 text-[13px] leading-relaxed text-slate-600">
        フクエスワークは、福岡のメンズエステで働きたい方のための求人サイトです。
        博多・天神・中洲、北九州・小倉、久留米など福岡県内のお店のセラピスト求人を、
        日払いOK・未経験歓迎・体験入店OKなどの条件から探せます。
      </p>


      {/* お仕事マッチングへの導線（/jobs/matching）。希望を入力→運営が合うお店を無料で紹介・斡旋する入口。
          ★ 第351便（2026-09-13・カッキーさんの指示）: コードで組んだグラデのカードをやめ、
            画像バナー（PC／SP 出し分け）に差し替えた。文言（公式マッチング・相談無料・未経験OK・
            条件から探せる・無料で相談）は画像の中にあるので、alt に同じ言葉を入れて読み上げと検索に残す。
          ★ 画像は WebP（public/matching-banner-pc-v4.webp・-sp-v4.webp・第503便で新デザイン・第925便で左下のロゴを新ロゴに）。角は親の rounded-3xl で丸める。
            角の外側が透けるので、背景色が変わっても白い角が浮かない。
          ★ .hero-shine-loop（白帯スイープ）は残す。直上のヒーローと同時に光らないよう周期は 6s のまま。
          ★ 出し分けの境目は md（ヒーローと同じ）。 */}
      <Link
        href="/jobs/matching"
        className="hero-shine-loop group relative block mb-6 overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-1"
        style={{ '--hero-shine-duration': '6s' } as CSSProperties}
      >
        {/* ★ 第1054便: PC／SP の2枚出しをやめ、<picture> で片方だけ転送する。 */}
        <ResponsivePicture
          pc={{ src: '/matching-banner-pc-v4.webp', width: 2172, height: 724 }}
          sp={{ src: '/matching-banner-sp-v4.webp', width: 1495, height: 1052 }}
          alt="フクエスワーク公式マッチング｜あなたとお店をマッチング！希望のエリアや条件から、あなたにぴったりのお店探しをお手伝いします。相談無料・未経験OK・条件から探せる。無料で相談"
          sizes="(max-width: 768px) 100vw, 768px"
          className="w-full h-auto"
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

      {/* ★ 第1573便（2026-10-20・カッキーさん・SEO）: エリア別の求人数と案内文（地名入りの本文）。
          ★ 「エリアから探す」のタイルの直下。各行はエリアの求人ページへの内部リンク。
          ★ 件数は 0 でも行は出す（「現在は募集準備中」）。リンク先は noindex のままなので検索には出ない。 */}
      <section className="mb-6 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900 text-sm mb-1">福岡のエリア別メンズエステ求人</h2>
        <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
          現在、福岡県内で{jobs.length}件のセラピスト求人を掲載しています。エリアごとの件数と特徴です。
        </p>
        <ul className="divide-y divide-emerald-50">
          {guideAreas.map((area) => {
            const n = areaCounts[area] ?? 0;
            return (
              <li key={area} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={jobsAreaHref(area)} className="text-[14px] font-bold hover:underline" style={{ color: '#059669' }}>
                    {areaLabel(area)}のメンズエステ求人
                  </Link>
                  <span className="flex-none text-[12px] font-bold text-slate-700">
                    {n > 0 ? `${n}件` : '募集準備中'}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{AREA_JOB_GUIDE[area]}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 注目の求人（オーナー設定のバナー画像）。おすすめスライダーと既存求人一覧の間に配置。
          見出し(h1)はバナー0件でも常に描画し、バナー画像のみ0件なら省略（コンポーネント側で分岐）。
          /jobsトップのみ見出しを「福岡メンズエステのセラピスト求人」に差し替え（他ページで使う場合の既定は「注目の求人」）。
          h1 に主要KW「福岡メンズエステ」を含める（/reviews・/diary・/x-shops と同方針）。16字のため
          JobHeroBanners の段階縮小（15〜20字＝SPのみ text-base・nowrap）で1行に収まる。 */}
      <JobHeroBanners banners={heroBanners} title="福岡メンズエステのセラピスト求人" headingLevel="h2" />


      {/* お仕事コラム（work_articles の新着3件）。0件時はセクションごと非表示。見出しは h2（h1は上部バナーブロック）。 */}
      {columnArticles.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
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

      {/* ★ 第978便（カッキーさん）: セラピスト用語集（/jobs/glossary）へのバナー。お仕事コラムのすぐ下。
          ★ 写真は用語集のタイトル部分と同じ public/work-glossary/hero-bg.webp（右に女性）。文字は左に HTML で重ねる。 */}
      <Link
        href="/jobs/glossary"
        className="group relative mt-8 block overflow-hidden rounded-2xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow"
        aria-label="セラピスト用語集を見る"
      >
        <div className="relative h-[150px] sm:h-[180px]">
          <Image
            src="/work-glossary/hero-bg.webp"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            style={{ objectPosition: 'right 20%' }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 45%, rgba(255,255,255,0) 72%)' }}
          />
          <div className="absolute inset-y-0 left-0 flex w-[66%] sm:w-[64%] flex-col justify-center px-4 sm:px-7">
            <p className="text-[9px] sm:text-[10px] font-bold tracking-[0.3em]" style={{ color: '#047857' }}>THERAPIST GLOSSARY</p>
            <p className="mt-1 text-xl sm:text-2xl font-black text-slate-900 leading-tight">セラピスト用語集</p>
            <p className="mt-1.5 text-[11px] sm:text-[13px] leading-snug text-slate-600">
              バック率・日払い・体験入店など、<br />働く前に知りたい言葉をやさしく解説
            </p>
            <span
              className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-[11px] sm:text-xs font-bold text-white group-hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
            >
              用語集を見る →
            </span>
          </div>
        </div>
      </Link>

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

      {/* ★ 第1494便（カッキーさん・SEO）: よくある質問。構造化データ（FAQPage）も同じ文で出す */}
      <section className="mt-12">
        <h2 className="mb-3 font-bold text-slate-900">よくある質問</h2>
        <div className="space-y-2">
          {JOBS_FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-bold text-slate-800">
                <span>Q. {f.q}</span>
                <span className="flex-none text-emerald-600 transition-transform group-open:rotate-45" aria-hidden>＋</span>
              </summary>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{f.a}</p>
              {f.links.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {f.links.map((l) => (
                    <Link key={l.href} href={l.href} className="text-[12.5px] font-bold hover:underline" style={{ color: '#059669' }}>{l.label} →</Link>
                  ))}
                </p>
              )}
            </details>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: JOBS_FAQ.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            }).replace(/</g, '\\u003c'),
          }}
        />
      </section>
    </main>
    </>
  );
}
