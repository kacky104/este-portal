import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { fetchActiveJobs, getFeaturedJobs } from '@/app/lib/jobs';
import { BRAND_TITLE } from './layout';
import { JobCard } from './JobCard';
import { FeatureBrowse } from './FeatureBrowse';
import { AreaBrowse } from './AreaBrowse';
import { PickupSlider } from './PickupSlider';
import { JobHeroBanners } from './JobHeroBanners';

// 「注目の求人」バナーの初期表示上限。件数が増えた場合はここを調整、または将来的に
// 「もっと見る」/ページングを追加する拡張ポイント。
const HERO_BANNER_LIMIT = 10;

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
};

export default async function JobsPage() {
  const [jobs, pickupJobs] = await Promise.all([fetchActiveJobs(), getFeaturedJobs()]);

  // 「注目の求人」バナー：既存の jobs（published_at 降順）からバナー画像1枚以上ありを抽出（別クエリ無し）。
  // 表示は先頭[0]のメイン画像のみ（表示仕様は不変。複数枚は詳細ページのスライダーで見せる）。
  const heroBanners = jobs
    .filter((j) => j.heroImageUrls.length > 0)
    .slice(0, HERO_BANNER_LIMIT)
    .map((j) => ({ id: j.id, title: j.title, heroImageUrl: j.heroImageUrls[0], salonName: j.salon.name }));

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

      {/* 注目の求人（オーナー設定のバナー画像）。おすすめスライダーと既存求人一覧の間に配置。0件時は非表示。 */}
      <JobHeroBanners banners={heroBanners} />

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

      {/* 見出し（ブランドグラデ グリーン→ライム） */}
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
          セラピスト求人
        </h1>
        <p className="text-sm text-slate-500 mt-1.5">福岡のメンズエステで働くセラピスト求人</p>
      </div>

      {/* エリアから探す（エリア別求人ページへの内部リンク網）→ 特徴から探す（タグ絞り込み）の順。
          求職者の探索順（まず勤務地エリア→次に条件）に合わせてエリアを特徴の直上に置く。 */}
      <div className="mb-6 space-y-4">
        <AreaBrowse />
        <FeatureBrowse />
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
          現在募集中の求人はありません
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
    </main>
  );
}
