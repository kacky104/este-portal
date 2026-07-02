import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchActiveJobs } from '@/app/lib/jobs';
import { JobCard } from './JobCard';
import { FeatureBrowse } from './FeatureBrowse';

// ISR：10分ごとに再生成（SEO目的。求人は頻繁に変わらないためキャッシュで十分）。
export const revalidate = 600;

// ヘッダー/フッター/背景/共通OGPは jobs/layout.tsx（フクエスワーク）が担う。
// タイトルは layout の template「%s｜フクエスワーク」に合成される。
export const metadata: Metadata = {
  title: '求人一覧',
  description:
    '福岡のメンズエステで働くセラピスト求人をまとめて掲載。エリア・給与・雇用形態から気になるお店の求人をチェックできます。未経験歓迎のメンズエステ求人も掲載中。',
};

export default async function JobsPage() {
  const jobs = await fetchActiveJobs();

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
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

      {/* 特徴から探す（タグ絞り込みページへの内部リンク網） */}
      <div className="mb-6">
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
