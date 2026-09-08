'use client';

import { useEffect, useState } from 'react';
import { upsertMyJob } from '@/app/actions/jobs';
import { isValidEmailFormat, firstVoiceError, validateCelebrationMoney } from '@/app/lib/jobs';
import { JobFields, EMPTY_JOB_FORM, jobToForm, type JobFormState } from '@/app/components/JobFields';
import { useJobsGate } from '../useJobsGate';
import { useMyJob } from '../useMyJob';
import { WorkShell } from '../WorkShell';
import { useToast } from '@/app/components/useToast';

// 求人内容（第220便）。★ 旧 /mypage の「求人」タブのフォーム部分をそのまま移した画面。
// ★ 入力の中身（JobFields）も、保存の仕組み（upsertMyJob）も、確かめ方も【変えていない】。
//   ★ 変えたのは置き場所と外枠だけ。

export default function WorkEditPage() {
  const { decision, salon, loadError } = useJobsGate();
  const { toast, showToast } = useToast();
  const salonId = salon ? salon.id : null;
  const { job, setJob, loading, loadError: jobError } = useMyJob(salonId);

  const [form, setForm] = useState<JobFormState>(EMPTY_JOB_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ★ 読み終わったら、その求人をフォームに写す（未作成なら空のまま）。
  useEffect(() => {
    if (loading) return;
    setForm(job ? jobToForm(job) : EMPTY_JOB_FORM);
  }, [loading, job]);

  const patch = (p: Partial<JobFormState>) => setForm((prev) => ({ ...prev, ...p }));

  const handleSave = async () => {
    if (salonId == null) return;
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
    // お祝い金：空欄はOK（null＝非表示）、入力時は正の整数・上限100万円をクライアント側でも検証。
    const cel = validateCelebrationMoney(form.celebration_money);
    if (!cel.ok) {
      setMsg({ kind: 'err', text: cel.error });
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
    showToast('保存しました');
  };

  return (
    <WorkShell
      decision={decision}
      loadError={loadError}
      salonName={salon?.name ?? null}
      title="求人内容"
      current="edit"
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
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm px-[5px] md:px-5 py-5 space-y-4">
          {!job && (
            <p className="text-[14px] text-slate-500 leading-relaxed">
              フクエスワークに求人を掲載できます（1店舗1件）。下を入力して保存すると掲載されます。
            </p>
          )}

          {msg && (
            <p
              className={`text-[13.5px] px-3 py-2 border ${
                msg.kind === 'ok'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                  : 'text-rose-600 bg-rose-50 border-rose-100'
              }`}
            >
              {msg.text}
            </p>
          )}

          <JobFields value={form} onChange={patch} salonId={salonId ?? 0} />

          <ul className="text-[12px] text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
            <li>掲載は1店舗につき1件です。</li>
            <li>店舗が非表示の間は、求人も自動的に非公開になります。</li>
            <li>保存すると数秒でフクエスワーク（/jobs）に反映されます。</li>
          </ul>

          {/* ★ 保存ボタンは【下に貼り付くバー】へ移した（2026-09-09・カッキーさんの指示）。
              ★ ここには置かない（★ 二重に置くと、どちらを押したか分からなくなる）。 */}
        </div>
      )}

      {/* ── 下に貼り付く保存バー（スクロールしても付いてくる）─────────────
          ★ main の最後に置いた sticky。★ fixed にしない（main は zoom 1.2 なので、
            fixed だと位置の基準がずれる）。★ sticky なら中身と同じ座標系のままで貼り付く。
          ★ 端末の下端（ホームバー）に隠れないよう safe-area ぶんの余白を足す。 */}
      {!loading && !jobError && (
        <div className="sticky bottom-0 z-20 -mx-4 md:-mx-6 mt-3">
          <div
            className="border-t border-emerald-100 bg-white/95 backdrop-blur px-4 md:px-6 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.35)]"
          >
            <button
              onClick={handleSave}
              disabled={saving || salonId == null}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 text-white font-bold text-[15px] shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
            >
              {/* 保存の印（フロッピー）。★ 押す場所だと分かるように文字の左へ。 */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M17 21v-8H7v8" />
                <path d="M7 3v5h8" />
              </svg>
              {saving ? '保存中...' : job ? '求人を更新する' : '求人を作成する'}
            </button>
          </div>
        </div>
      )}
    </WorkShell>
  );
}
