'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toggleMyJobActive, deleteMyJob } from '@/app/actions/jobs';
import { useJobsGate } from './useJobsGate';
import { useMyJob } from './useMyJob';
import { WorkShell } from './WorkShell';
import { useToast } from '@/app/components/useToast';

// フクエスワークのホーム（第220便・2026-09-08・カッキーさんの指示で /mypage の「求人」タブから独立）。
//
// ★★ この画面が引き受けるのは【状態を見せること】だけ。★ 入力は「求人内容」へ、応募は「応募」へ渡す。
//   ★ フクエスリンクのホームと同じ考え方（状態を上に・操作は各画面へ）。

export default function WorkHomePage() {
  const { decision, salon, loadError } = useJobsGate();
  const { toast, showToast } = useToast();
  const salonId = salon ? salon.id : null;
  const { job, setJob, loading, loadError: jobError } = useMyJob(salonId);
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    if (!job) return;
    setBusy(true);
    const res = await toggleMyJobActive(job.id);
    setBusy(false);
    if (!res.ok) { showToast(res.error); return; }
    setJob({ ...job, is_active: res.is_active });
    showToast(res.is_active ? '公開にしました' : '非公開にしました');
  };

  const handleDelete = async () => {
    if (!job) return;
    if (!window.confirm('この求人を削除しますか？\n応募履歴もすべて削除されます。\nこの操作は取り消せません。')) return;
    setBusy(true);
    const res = await deleteMyJob(job.id);
    setBusy(false);
    if (!res.ok) { showToast(res.error ?? '削除に失敗しました'); return; }
    setJob(null);
    showToast('求人を削除しました。再度作成できます。');
  };

  return (
    <WorkShell
      decision={decision}
      loadError={loadError}
      salonName={salon?.name ?? null}
      title="ホーム"
      current="home"
      toast={toast}
    >
      {/* ── 状態 ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-sm p-5">
        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中です…</p>
        ) : jobError ? (
          <p className="text-[14px] text-rose-600">求人情報の取得に失敗しました：{jobError}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-black text-slate-700">いまの状態</h2>
                {job ? (
                  job.is_active ? (
                    <span className="text-[11px] px-2 py-0.5 font-bold" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>公開中</span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 font-bold bg-slate-100 text-slate-500 border border-slate-200">非公開</span>
                  )
                ) : (
                  <span className="text-[11px] px-2 py-0.5 font-bold bg-slate-100 text-slate-400 border border-slate-200">未作成</span>
                )}
              </div>

              {job && (
                <div className="flex items-center gap-2">
                  {job.is_active && (
                    <a
                      href={`/jobs/${job.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-bold px-3 py-1.5 border transition-colors"
                      style={{ borderColor: '#6EE7B7', color: '#059669' }}
                    >
                      掲載ページを見る →
                    </a>
                  )}
                  <button
                    onClick={handleToggle}
                    disabled={busy}
                    className="text-[12px] font-bold px-3 py-1.5 border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                  >
                    {job.is_active ? '非公開にする' : '公開する'}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={busy}
                    className="text-[12px] font-bold px-3 py-1.5 border border-rose-200 text-rose-500 hover:bg-rose-50 hover:border-rose-300 transition-colors disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              )}
            </div>

            <p className="mt-2.5 text-[14px] text-slate-500 leading-relaxed">
              {job
                ? job.is_active
                  ? 'フクエスワーク（/jobs）に掲載中です。内容を直すと数秒で反映されます。'
                  : 'いまは非公開です。「公開する」を押すとフクエスワーク（/jobs）に出ます。'
                : 'まだ求人がありません。「求人内容」から作成すると、フクエスワーク（/jobs）に掲載されます（1店舗1件）。'}
            </p>
          </>
        )}
      </div>

      {/* ── 各画面への入口 ───────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: '/mypage/jobs/edit', label: '求人内容', desc: job ? '掲載している内容を直す' : '求人をつくる' },
          { href: '/mypage/jobs/applications', label: '応募', desc: '届いた応募を見る・状態を変える' },
          { href: '/mypage/jobs/news', label: '新着情報', desc: '求人ページに出るお知らせを書く' },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="block bg-white border border-slate-200 shadow-sm p-4 hover:border-emerald-300 hover:shadow transition-all"
          >
            <p className="text-[15px] font-black text-slate-700">{t.label}</p>
            <p className="mt-1 text-[13px] text-slate-400 leading-relaxed">{t.desc}</p>
          </Link>
        ))}
      </div>

      <ul className="mt-4 text-[12.5px] text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
        <li>掲載は1店舗につき1件です。</li>
        <li>店舗が非表示の間は、求人も自動的に非公開になります。</li>
      </ul>
    </WorkShell>
  );
}
