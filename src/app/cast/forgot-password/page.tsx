'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { requestPasswordReset } from '@/lib/auth';

// セラピスト用パスワード再設定の入口（会員 /forgot-password のクローン）。
// 会員版との違いは requestPasswordReset に next='/cast/reset-password' を渡す点だけ。
// → 再設定メールのリンクは /auth/callback?next=/cast/reset-password に着地し、
//   成功後は /cast 系に戻る（会員フローとは混線しない）。
function CastForgotPasswordInner() {
  const params = useSearchParams();
  // /auth/callback からの recovery 失敗（?error=...）を初期表示。
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
      // セラピスト用：再設定後の着地先を /cast/reset-password にする。
      await requestPasswordReset(email.trim(), '/cast/reset-password');
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-pink-50 border border-pink-200 mb-4">
            <span className="text-pink-500 font-bold text-xl leading-none">◆</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900">パスワード再設定</h1>
          <p className="text-sm text-slate-500 mt-1">フクエス セラピスト専用ページ</p>
        </div>

        {sent ? (
          <div className="text-center space-y-5">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              再設定メールを送信しました。メールをご確認ください。<br />
              （ご登録のない場合はメールは届きません）
            </p>
            <Link href="/cast/login" className="block text-sm text-pink-600 hover:underline">セラピストログインへ戻る</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
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
                placeholder="cast@example.com"
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 transition-colors disabled:opacity-60"
            >
              {loading ? '送信中...' : '再設定メールを送信'}
            </button>
            <Link href="/cast/login" className="block text-center text-sm text-slate-400 hover:text-pink-500 transition-colors">
              ← セラピストログインに戻る
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

export default function CastForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <CastForgotPasswordInner />
    </Suspense>
  );
}
