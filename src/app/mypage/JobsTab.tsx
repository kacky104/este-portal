'use client';

import { useEffect, useState } from 'react';
import { getMyJob, upsertMyJob, toggleMyJobActive, deleteMyJob, type MyJob } from '@/app/actions/jobs';
import { isValidEmailFormat, firstVoiceError } from '@/app/lib/jobs';
import { JobFields, EMPTY_JOB_FORM, jobToForm, type JobFormState } from '@/app/components/JobFields';
import { JobApplications } from '@/app/mypage/JobApplications';

// mypage「求人」タブ本体。1店舗1件のため一覧ではなく単一画面
// （未作成→作成フォーム／作成済み→編集フォーム＋公開切替＋削除）。
// 配色は mypage 既存トーン（白カード）。アクセントのみフクエスワークのグリーン #10B981。
export function JobsTab({ salonId }: { salonId: number }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [job, setJob] = useState<MyJob | null>(null);
  const [form, setForm] = useState<JobFormState>(EMPTY_JOB_FORM);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false); // トグル/削除中
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // 初回：自店の求人を取得（未作成なら null）。
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    getMyJob(salonId)
      .then((res) => {
        if (!alive) return;
        if (!res.ok) {
          setLoadError(res.error);
          return;
        }
        setJob(res.job);
        setForm(res.job ? jobToForm(res.job) : EMPTY_JOB_FORM);
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [salonId]);

  const patch = (p: Partial<JobFormState>) => setForm((prev) => ({ ...prev, ...p }));

  const handleSave = async () => {
    // 応募通知メール：必須。未入力を拒否し、入力時は形式もチェック。
    if (form.notify_email.trim() === '') {
      setMsg({ kind: 'err', text: '応募通知メールを入力してください' });
      return;
    }
    if (!isValidEmailFormat(form.notify_email)) {
      setMsg({ kind: 'err', text: '応募通知メールの形式が正しくありません' });
      return;
    }
    // 在籍セラピストの声：年代未選択があれば保存不可（不完全な声のサイレント破棄を避け、明示的に気付かせる）。
    const voiceErr = firstVoiceError(form.therapist_voices);
    if (voiceErr) {
      setMsg({ kind: 'err', text: voiceErr });
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await upsertMyJob(salonId, form);
    setSaving(false);
    if (!res.ok) {
      setMsg({ kind: 'err', text: res.error });
      return;
    }
    setJob(res.job);
    setForm(jobToForm(res.job));
    setMsg({ kind: 'ok', text: '保存しました。数秒でフクエスワーク（/jobs）に反映されます。' });
  };

  const handleToggle = async () => {
    if (!job) return;
    setBusy(true);
    setMsg(null);
    const res = await toggleMyJobActive(job.id);
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: 'err', text: res.error });
      return;
    }
    setJob({ ...job, is_active: res.is_active });
    setMsg({ kind: 'ok', text: res.is_active ? '公開にしました' : '非公開にしました' });
  };

  const handleDelete = async () => {
    if (!job) return;
    if (!window.confirm('この求人を削除しますか？\n応募履歴もすべて削除されます。\nこの操作は取り消せません。')) return;
    setBusy(true);
    setMsg(null);
    const res = await deleteMyJob(job.id);
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: 'err', text: res.error ?? '削除に失敗しました' });
      return;
    }
    setJob(null);
    setForm(EMPTY_JOB_FORM);
    setMsg({ kind: 'ok', text: '求人を削除しました。再度作成できます。' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-xs text-slate-400">読み込み中です…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-5">
        <p className="text-xs text-rose-600">求人情報の取得に失敗しました：{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー：ステータス＋公開操作 */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-700">求人（フクエスワーク）</h2>
            {job ? (
              job.is_active ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                  公開中
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500 border border-slate-200">
                  非公開
                </span>
              )
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-400 border border-slate-200">
                未作成
              </span>
            )}
          </div>

          {job && (
            <div className="flex items-center gap-2">
              {job.is_active && (
                <a
                  href={`/jobs/${job.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold px-3 py-1 rounded-lg border transition-colors"
                  style={{ borderColor: '#6EE7B7', color: '#059669' }}
                >
                  掲載ページを見る →
                </a>
              )}
              <button
                onClick={handleToggle}
                disabled={busy}
                className="text-[11px] font-bold px-3 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                {job.is_active ? '非公開にする' : '公開する'}
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-[11px] font-bold px-3 py-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 hover:border-rose-300 transition-colors disabled:opacity-50"
              >
                削除
              </button>
            </div>
          )}
        </div>

        {!job && (
          <p className="text-xs text-slate-500 leading-relaxed">
            フクエスワークに求人を掲載できます（1店舗1件）。下のフォームを入力して保存すると掲載されます。
          </p>
        )}

        {msg && (
          <p
            className={`text-xs rounded-xl px-3 py-2 border ${
              msg.kind === 'ok'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                : 'text-rose-600 bg-rose-50 border-rose-100'
            }`}
          >
            {msg.text}
          </p>
        )}
      </div>

      {/* フォーム本体 */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
        <JobFields value={form} onChange={patch} salonId={salonId} />

        {/* 注意書き */}
        <ul className="text-[10px] text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
          <li>掲載は1店舗につき1件です。</li>
          <li>サロンが非表示の間は、求人も自動的に非公開になります。</li>
          <li>保存すると数秒でフクエスワーク（/jobs）に反映されます。</li>
        </ul>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
          >
            {saving ? '保存中...' : job ? '求人を更新する' : '求人を作成する'}
          </button>
        </div>
      </div>

      {/* 応募一覧（求人が作成済みのときのみ表示） */}
      {job && <JobApplications salonId={salonId} />}
    </div>
  );
}
