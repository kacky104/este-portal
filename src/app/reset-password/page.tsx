'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession, onAuthChange, updatePassword } from '@/lib/auth';
import { PASSWORD_HINT, validatePassword } from '@/lib/password';

export default function ResetPasswordPage() {
  const router = useRouter();

  // リカバリーセッションの有無（/auth/callback 経由で確立済みの想定）。
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSession().then(s => {
      if (!mounted) return;
      setHasSession(!!s);
      setChecking(false);
    });
    // PASSWORD_RECOVERY 等で後からセッションが入る場合に追従。
    const off = onAuthChange(s => { if (mounted) setHasSession(!!s); });
    return () => { mounted = false; off(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    if (password !== confirm) { setError('確認用パスワードが一致しません。'); return; }
    setLoading(true);
    try {
      const res = await updatePassword(password);
      if (!res.ok) { setError(res.error ?? 'パスワードの変更に失敗しました。'); return; }
      setDone(true);
      // 変更後はログイン済み状態。少し見せてからトップへ。
      setTimeout(() => { router.push('/'); router.refresh(); }, 1600);
    } catch {
      setError('通信エラーが発生しました。時間をおいて再度お試しください。');
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
          <span className="font-bold text-[15px] tracking-wide text-pink-600">福岡メンズエステポータル</span>
          <h1 className="text-lg font-black text-slate-900 mt-2">新しいパスワードの設定</h1>
        </div>

        {checking ? (
          <div className="py-8 text-center text-sm text-slate-400 relative z-10">読み込み中...</div>
        ) : done ? (
          <div className="relative z-10 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="text-sm text-slate-700 font-medium">パスワードを変更しました。</p>
            <p className="text-xs text-slate-400">トップページへ移動します...</p>
          </div>
        ) : !hasSession ? (
          // リカバリーセッションが無い（直接アクセス・期限切れ等）
          <div className="relative z-10 text-center space-y-5">
            <p className="text-sm text-slate-600 leading-relaxed">
              リンクが無効か、有効期限が切れている可能性があります。<br />お手数ですが、再度お試しください。
            </p>
            <Link
              href="/forgot-password"
              className="block w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 transition-colors"
            >
              再設定メールを送り直す
            </Link>
            <Link href="/login" className="block text-sm text-slate-400 hover:text-pink-500 transition-colors">ログインに戻る</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="relative z-10 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
                ⚠️ {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 block px-1">
                新しいパスワード<span className="font-normal text-slate-300">（{PASSWORD_HINT}）</span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 block px-1">新しいパスワード（確認）</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity disabled:opacity-60"
            >
              {loading ? '変更中...' : 'パスワードを変更する'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
