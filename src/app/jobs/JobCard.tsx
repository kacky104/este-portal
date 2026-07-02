import Link from 'next/link';
import { areaLabel } from '@/app/lib/areaLabel';
import { employmentTypeLabel, featureLabel, type JobListItem } from '@/app/lib/jobs';

// 求人一覧カード（/jobs と /jobs/tag/[slug] で共用）。サーバーコンポーネント。
// カード肥大化を防ぐため特徴タグは最大3個＋「+n」。
const MAX_CARD_FEATURES = 3;

export function JobCard({ job }: { job: JobListItem }) {
  const shown = job.features.slice(0, MAX_CARD_FEATURES);
  const overflow = job.features.length - shown.length;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all"
    >
      {/* 雇用形態バッジ */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}>
          {employmentTypeLabel(job.employmentType)}
        </span>
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

      {/* 特徴タグ（最大3個＋「+n」・グリーン枠の小バッジ） */}
      {job.features.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {shown.map((slug) => (
            <span key={slug} className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50" style={{ color: '#059669' }}>
              {featureLabel(slug)}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200 text-slate-400">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
