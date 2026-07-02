import Link from 'next/link';
import type { Metadata } from 'next';
import { areaLabel } from '@/app/lib/areaLabel';
import { fetchActiveJobs, employmentTypeLabel, formatJobDate } from '@/app/lib/jobs';

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

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-slate-500 text-sm shadow-sm">
          現在募集中の求人はありません
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="block rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all"
              >
                {/* 雇用形態バッジ＋掲載日 */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}>
                    {employmentTypeLabel(job.employmentType)}
                  </span>
                  {job.publishedAt && (
                    <span className="text-[11px] text-slate-400 flex-shrink-0">{formatJobDate(job.publishedAt)}</span>
                  )}
                </div>

                {/* 求人タイトル */}
                <h2 className="font-bold text-slate-900 leading-snug break-words">{job.title}</h2>

                {/* 店名＋エリア */}
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-slate-600 break-words">{job.salon.name}</span>
                  {job.salon.area && (
                    <span className="inline-flex items-center gap-0.5 text-slate-400">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                      {areaLabel(job.salon.area)}
                    </span>
                  )}
                </p>

                {/* 給与 */}
                {job.salaryText && (
                  <p className="text-sm font-bold mt-2 break-words" style={{ color: '#059669' }}>{job.salaryText}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
