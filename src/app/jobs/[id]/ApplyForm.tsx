'use client';

import { useState } from 'react';
import { createJobApplication } from '@/app/actions/jobs';

// フクエスワーク 求人応募フォーム（公開・ISRページ内で使えるクライアントコンポーネント）。
// 時間依存レンダリングは無し（マウント後のユーザー操作のみ）＝ISRキャッシュを壊さない。
// 「WEBで応募する」ボタンでフォームを展開。送信は anon 経路のサーバーアクション（サーバー再検証あり）。
export function ApplyForm({ jobId }: { jobId: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', tel: '', age: '', note: '' });

  const patch = (p: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const res = await createJobApplication(jobId, {
      name: form.name,
      tel: form.tel,
      age: form.age,
      note: form.note,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  };

  // 送信完了：フォームを差し替え。
  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <div className="flex justify-center mb-2">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="M22 4 12 14.01l-3-3" />
          </svg>
        </div>
        <p className="font-bold text-emerald-800">応募を受け付けました</p>
        <p className="text-xs text-emerald-700 mt-2 leading-relaxed">
          お店から折り返しお電話でご連絡します。<br />
          応募の時点で採用が確定するものではありません。
        </p>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200';

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-white font-bold shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M9 15l2 2 4-4" />
          </svg>
          WEBで応募する
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
            <h2 className="font-bold text-slate-900">WEBで応募する</h2>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">お名前 <span className="text-rose-400">*</span></label>
            <input type="text" className={inputClass} placeholder="例）福岡 太郎" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">電話番号 <span className="text-rose-400">*</span></label>
            <input type="tel" inputMode="tel" className={inputClass} placeholder="例）090-1234-5678" value={form.tel} onChange={(e) => patch({ tel: e.target.value })} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">年齢（任意）</label>
            <input type="number" min={18} max={99} className={`${inputClass} w-28`} placeholder="例）25" value={form.age} onChange={(e) => patch({ age: e.target.value })} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">メッセージ・質問（任意）</label>
            <textarea className={`${inputClass} min-h-[88px] resize-y`} placeholder="ご質問や希望などがあればご記入ください" value={form.note} onChange={(e) => patch({ note: e.target.value })} />
          </div>

          {/* 注意書き（予約と同思想：まだ確定ではない） */}
          <ul className="text-[10px] text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
            <li>お店から折り返しお電話でご連絡します（メールアドレスは取得しません）。</li>
            <li>応募の時点で採用が確定するものではありません。</li>
          </ul>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              閉じる
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl text-white font-bold text-sm shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
            >
              {submitting ? '送信中…' : 'この内容で応募する'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
