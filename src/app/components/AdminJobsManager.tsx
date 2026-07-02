'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminListJobs,
  adminListSalonsForJob,
  upsertMyJob,
  toggleMyJobActive,
  type AdminJobRow,
} from '@/app/actions/jobs';
import {
  JobFields,
  EMPTY_JOB_FORM,
  jobToForm,
  EMPLOYMENT_OPTIONS,
  type JobFormState,
} from '@/app/components/JobFields';

// /admin の求人管理セクション。全 salon_jobs を運営権限で一覧
// （非表示サロン分も見える＝service_role 読み取り）。公開トグル・編集・未掲載サロンへの代理作成。
// 書き込みは mypage と同じサーバーアクション（upsertMyJob / toggleMyJobActive）を流用（RLS＋所有権チェック）。

type SalonOption = { id: number; name: string; hasJob: boolean; isHidden: boolean };

const EMPLOYMENT_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_OPTIONS.map((o) => [o.value, o.label]),
);

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export default function AdminJobsManager({ onToast }: { onToast: (msg: string) => void }) {
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [salons, setSalons] = useState<SalonOption[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  // 編集/作成フォーム（共通モーダル）。mode: 'edit'=既存 / 'create'=代理作成。
  const [editor, setEditor] = useState<
    | { mode: 'edit'; salonId: number; salonName: string; form: JobFormState }
    | { mode: 'create'; salonId: number | null; form: JobFormState }
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const reload = useCallback(async () => {
    setLoadError('');
    const [jRes, sRes] = await Promise.all([adminListJobs(), adminListSalonsForJob()]);
    if (!jRes.ok) {
      setLoadError(jRes.error);
      return;
    }
    setJobs(jRes.jobs);
    if (sRes.ok) setSalons(sRes.salons);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleToggle = async (row: AdminJobRow) => {
    const next = !row.is_active;
    if (!window.confirm(`「${row.salonName}」の求人を${next ? '公開' : '非公開'}にしますか？`)) return;
    setBusyId(row.id);
    const res = await toggleMyJobActive(row.id);
    setBusyId(null);
    if (!res.ok) {
      onToast(`更新に失敗しました: ${res.error}`);
      return;
    }
    setJobs((prev) => prev.map((j) => (j.id === row.id ? { ...j, is_active: res.is_active } : j)));
    onToast(res.is_active ? '公開にしました' : '非公開にしました');
  };

  const patch = (p: Partial<JobFormState>) =>
    setEditor((prev) => (prev ? { ...prev, form: { ...prev.form, ...p } } : prev));

  const handleSave = async () => {
    if (!editor) return;
    const salonId = editor.salonId; // edit=number / create=number|null
    if (salonId == null) {
      setFormError('サロンを選択してください');
      return;
    }
    setSaving(true);
    setFormError('');
    const res = await upsertMyJob(salonId, editor.form);
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    setEditor(null);
    onToast('求人を保存しました');
    await reload();
  };

  const salonsWithoutJob = salons.filter((s) => !s.hasJob);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-black text-slate-700">求人管理（フクエスワーク）</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
            {jobs.length}件
          </span>
        </div>
        <button
          onClick={() => {
            setFormError('');
            setEditor({ mode: 'create', salonId: null, form: { ...EMPTY_JOB_FORM } });
          }}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
        >
          ＋ 代理作成
        </button>
      </div>

      {loadError ? (
        <div className="p-6 text-center text-sm text-rose-500">{loadError}</div>
      ) : jobs.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-400">求人はまだありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-50/50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">店名</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">求人タイトル</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">雇用形態</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">公開状態</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">掲載日</th>
                <th className="px-4 py-3 w-40" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((row, i) => (
                <tr key={row.id} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800">
                    {row.salonName}
                    {row.salonHidden && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 font-bold">
                        店舗非表示
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[220px]">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{row.title}</span>
                      {row.newCount > 0 && (
                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200 font-bold">
                          新規{row.newCount}件
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-500">{EMPLOYMENT_LABEL[row.employment_type] ?? row.employment_type}</td>
                  <td className="px-4 py-3">
                    {row.is_active ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                        公開中
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500 border border-slate-200">非公開</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-500">{formatDate(row.published_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggle(row)}
                        disabled={busyId === row.id}
                        className="text-[11px] font-bold px-3 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                      >
                        {row.is_active ? '非公開' : '公開'}
                      </button>
                      <button
                        onClick={() => {
                          setFormError('');
                          setEditor({ mode: 'edit', salonId: row.salon_id, salonName: row.salonName, form: jobToForm(row) });
                        }}
                        className="text-[11px] font-bold px-3 py-1 rounded-lg border transition-colors"
                        style={{ borderColor: '#6EE7B7', color: '#059669' }}
                      >
                        編集
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 編集/代理作成モーダル */}
      {editor && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">
                {editor.mode === 'edit' ? `求人を編集：${editor.salonName}` : '求人を代理作成'}
              </h3>
              <button onClick={() => setEditor(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
            </div>

            {/* 代理作成時のみサロン選択（未掲載サロンのみ） */}
            {editor.mode === 'create' && (
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">
                  対象サロン <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  value={editor.salonId ?? ''}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev && prev.mode === 'create'
                        ? { ...prev, salonId: e.target.value === '' ? null : Number(e.target.value) }
                        : prev,
                    )
                  }
                >
                  <option value="">選択してください</option>
                  {salonsWithoutJob.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isHidden ? '（非表示）' : ''}
                    </option>
                  ))}
                </select>
                {salonsWithoutJob.length === 0 && (
                  <p className="text-[10px] text-slate-400 mt-1">未掲載のサロンはありません（全店に求人があります）。</p>
                )}
              </div>
            )}

            <JobFields value={editor.form} onChange={patch} />

            {formError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{formError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditor(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
