'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { requestPasswordReset } from '@/lib/auth';

function ForgotPasswordInner() {
  const params = useSearchParams();
  // /auth/callback からのリカバリーリンク失敗（?error=...）を初期表示。
  const [error, setError] = useState(
    params.get('error')
      ? 'リンクが無効か有効期限切れの可能性があります。再度メールを送信してください。'
      : ''
  );
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('メールアドレスを入力してください。'); return; }
    setLoading(true);
    try {
      // 結果に関わらず同じ案内を出す（メール列挙対策：登録の有無を分からせない）。
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-pink-50/40 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-xl border border-pink-100 p-7 relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-24 h-24 bg-pink-100/40 rounded-full blur-xl" />
        <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-fuchsia-100/40 rounded-full blur-xl" />

        <div className="text-center mb-6 relative z-10">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center">
              <span className="text-pink-500 font-bold leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
          <h1 className="text-lg font-black text-slate-900 mt-3">パスワード再設定</h1>
        </div>

        {sent ? (
          <div className="relative z-10 text-center space-y-5">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              再設定メールを送信しました。メールをご確認ください。<br />
              （ご登録のない場合はメールは届きません）
            </p>
            <Link href="/login" className="block text-sm text-pink-600 hover:underline">ログイン画面へ戻る</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="relative z-10 space-y-4">
            <p className="text-[12px] text-slate-500 leading-relaxed">
              ご登録のメールアドレスに、パスワード再設定用のリンクをお送りします。
            </p>
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
                ⚠️ {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 block px-1">メールアドレス</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity disabled:opacity-60"
            >
              {loading ? '送信中...' : '再設定メールを送信'}
            </button>
            <Link href="/login" className="block text-center text-sm text-slate-400 hover:text-pink-500 transition-colors">
              ← ログインに戻る
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-pink-50/40" />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
