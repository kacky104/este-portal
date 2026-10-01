'use client';

import { useState } from 'react';
import { createJobApplication } from '@/app/actions/jobs';
import { isValidPhone } from '@/app/lib/validation/phone';
import { CONTACT_METHODS, type ContactMethod } from '@/app/lib/jobs';

// ★ 第1064便（カッキーさん）: 希望の連絡方法と体入希望。電話番号は必須のまま、体入は希望の有無だけ（日程は聞かない）。
const CONTACT_CHOICES: Record<ContactMethod, string> = { tel: '電話', sms: 'SMS', line: 'LINE', email: 'メール' };

// フクエスワーク 求人応募フォーム（公開・ISRページ内で使えるクライアントコンポーネント）。
// 時間依存レンダリングは無し（マウント後のユーザー操作のみ）＝ISRキャッシュを壊さない。
// 「WEBで応募する」ボタンでフォームを展開。送信は anon 経路のサーバーアクション（サーバー再検証あり）。
// 各 label は htmlFor で入力欄の id と紐付ける（2026-08-06）。1ページに1インスタンスのみなので id は固定値でよい。
export function ApplyForm({ jobId }: { jobId: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', tel: '', age: '', note: '',
    contactMethod: 'tel' as ContactMethod, contactValue: '', wantsTrial: false,
  });
  const needsValue = form.contactMethod === 'line' || form.contactMethod === 'email';

  const patch = (p: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // 送信前にサーバーと同じルール（ハイフン除去後の数字10〜13桁）で検証。
    if (!isValidPhone(form.tel)) {
      setError('電話番号は数字10〜13桁で入力してください');
      return;
    }
    if (needsValue && !form.contactValue.trim()) {
      setError(form.contactMethod === 'line' ? 'LINE ID を入力してください' : 'メールアドレスを入力してください');
      return;
    }
    setSubmitting(true);
    const res = await createJobApplication(jobId, {
      name: form.name,
      tel: form.tel,
      age: form.age,
      note: form.note,
      contactMethod: form.contactMethod,
      contactValue: needsValue ? form.contactValue : '',
      wantsTrial: form.wantsTrial,
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
          ご希望の方法でお店からご連絡します。<br />
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
            <h2 className="font-bold text-slate-900">WEBで応募する</h2>
          </div>

          <div>
            <label htmlFor="job-apply-name" className="text-[11px] font-bold text-slate-400 block mb-1">お名前 <span className="text-rose-400">*</span></label>
            <input id="job-apply-name" name="name" type="text" autoComplete="name" className={inputClass} placeholder="例）福岡 太郎" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="job-apply-tel" className="text-[11px] font-bold text-slate-400 block mb-1">電話番号 <span className="text-rose-400">*</span></label>
            <input id="job-apply-tel" name="tel" type="tel" autoComplete="tel" inputMode="numeric" className={inputClass} placeholder="例）090-1234-5678" value={form.tel} onChange={(e) => patch({ tel: e.target.value })} />
          </div>
          {/* ★ 第1064便: 希望の連絡方法（4択・既定は電話）。LINE・メールのときだけ ID／アドレス欄を出す。 */}
          <fieldset>
            <legend className="text-[11px] font-bold text-slate-400 block mb-1">希望の連絡方法 <span className="text-rose-400">*</span></legend>
            <div className="grid grid-cols-4 gap-1.5">
              {CONTACT_METHODS.map((m) => {
                const on = form.contactMethod === m;
                return (
                  <label
                    key={m}
                    className={`flex items-center justify-center py-2 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                      on ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="contactMethod"
                      value={m}
                      checked={on}
                      onChange={() => patch({ contactMethod: m })}
                      className="sr-only"
                    />
                    {CONTACT_CHOICES[m]}
                  </label>
                );
              })}
            </div>
            {needsValue && (
              <div className="mt-2">
                <label htmlFor="job-apply-contact" className="sr-only">
                  {form.contactMethod === 'line' ? 'LINE ID' : 'メールアドレス'}
                </label>
                <input
                  id="job-apply-contact"
                  name="contactValue"
                  type={form.contactMethod === 'email' ? 'email' : 'text'}
                  autoComplete={form.contactMethod === 'email' ? 'email' : 'off'}
                  className={inputClass}
                  placeholder={form.contactMethod === 'line' ? 'LINE ID（例）fukues123' : 'メールアドレス（例）name@example.com'}
                  value={form.contactValue}
                  onChange={(e) => patch({ contactValue: e.target.value })}
                />
              </div>
            )}
          </fieldset>

          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={form.wantsTrial}
              onChange={(e) => patch({ wantsTrial: e.target.checked })}
              className="w-4 h-4 accent-emerald-500"
            />
            <span className="text-sm font-bold text-slate-700">体験入店を希望する</span>
          </label>

          <div>
            <label htmlFor="job-apply-age" className="text-[11px] font-bold text-slate-400 block mb-1">年齢（任意）</label>
            <input id="job-apply-age" name="age" type="number" min={18} max={99} className={`${inputClass} w-28`} placeholder="例）25" value={form.age} onChange={(e) => patch({ age: e.target.value })} />
          </div>
          <div>
            <label htmlFor="job-apply-note" className="text-[11px] font-bold text-slate-400 block mb-1">メッセージ・質問（任意）</label>
            <textarea id="job-apply-note" name="note" className={`${inputClass} min-h-[88px] resize-y`} placeholder="ご質問や希望などがあればご記入ください" value={form.note} onChange={(e) => patch({ note: e.target.value })} />
          </div>

          {/* 注意書き（予約と同思想：まだ確定ではない） */}
          <ul className="text-[10px] text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
            <li>ご希望の方法でお店からご連絡します（つながらないときはお電話することがあります）。</li>
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
