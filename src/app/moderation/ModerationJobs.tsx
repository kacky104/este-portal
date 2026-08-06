'use client';

import AdminJobsManager from '@/app/components/AdminJobsManager';
import { useToast } from '@/app/components/useToast';

// /moderation の求人管理タブ（2026-08-06 新設）。
// /admin の「求人管理（フクエスワーク）」と同じ AdminJobsManager をそのまま使う。
// サーバー側の許可は MODERATOR_UUIDS（actions/jobs.ts の isJobStaff）、
// DB側は 20260806_salon_jobs_moderators.sql で審査スタッフにも開放済み。
// トーストは /admin と同スタイル（このタブ内で完結させる）。
export function ModerationJobs() {
  const { toast, showToast } = useToast();

  return (
    <>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-orange-400 to-pink-600" />
        <h2 className="text-xl font-bold text-slate-900">求人管理（フクエスワーク）</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        掲載中の求人の編集・公開切替・未掲載店舗への代理作成ができます（/admin と同じ内容です）。
      </p>

      <AdminJobsManager onToast={showToast} />
    </>
  );
}
