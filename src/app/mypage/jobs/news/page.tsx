'use client';

import Link from 'next/link';
import { JobNewsManager } from '@/app/mypage/JobNewsManager';
import { useJobsGate } from '../useJobsGate';
import { useMyJob } from '../useMyJob';
import { WorkShell } from '../WorkShell';
import { useToast } from '@/app/components/useToast';

// 新着情報（第220便）。★ 旧「求人」タブの新着情報（work_news）をそのまま1画面にした。
// ★ 求人が未作成のときは出す先が無いので、作る場所を案内する（真っ白にしない）。

export default function WorkNewsPage() {
  const { decision, salon, loadError } = useJobsGate();
  const { toast } = useToast();
  const salonId = salon ? salon.id : null;
  const { job, loading, loadError: jobError } = useMyJob(salonId);

  return (
    <WorkShell
      decision={decision}
      loadError={loadError}
      salonName={salon?.name ?? null}
      salonId={salonId}
      jobId={job ? job.id : null}
      jobPublic={job ? job.is_active : false}
      title="新着情報"
      current="news"
      toast={toast}
    >
      {loading ? (
        <div className="bg-white border border-slate-200 shadow-sm p-5">
          <p className="text-[14px] text-slate-400">読み込み中です…</p>
        </div>
      ) : jobError ? (
        <div className="bg-white border border-rose-200 shadow-sm p-5">
          <p className="text-[14px] text-rose-600">求人情報の取得に失敗しました：{jobError}</p>
        </div>
      ) : !job || salonId == null ? (
        <div className="bg-white border border-slate-200 shadow-sm p-5">
          <p className="text-[14px] text-slate-500 leading-relaxed">
            まだ求人がありません。新着情報は求人ページに出るお知らせなので、先に求人をつくってください。
          </p>
          <Link
            href="/mypage/jobs/edit"
            className="mt-3 inline-block px-5 py-2.5 text-white font-bold text-[13.5px] shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
          >
            求人をつくる →
          </Link>
        </div>
      ) : (
        <JobNewsManager salonId={salonId} />
      )}
    </WorkShell>
  );
}
