'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  onAuthChange,
} from '@/lib/auth';
import { PASSWORD_HINT, validatePassword } from '@/lib/password';

// redirectTo は同一オリジンの相対パスのみ許可（オープンリダイレクト防止）。
// 会員ログインのデフォルト遷移はトップ（オーナー振り分けは /owner/login 側で実施）。
function safeRedirect(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const dest = safeRedirect(params.get('redirectTo'));

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // メール確認コールバックからのエラー（?error=...）は初期表示する。
  const [error, setError] = useState(params.get('error') ? 'メール確認に失敗しました。リンクの有効期限切れの可能性があります。再度お試しください。' : '');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // ログイン中なら状態＋ログアウトを表示（動作確認用）。
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSession().then(s => {
      if (mounted) { setCurrentEmail(s?.user.email ?? null); setChecking(false); }
    });
    const off = onAuthChange(s => {
      if (mounted) setCurrentEmail(s?.user.email ?? null);
    });
    return () => { mounted = false; off(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return; }
    // 新規登録のみ：送信前にパスワード要件を検証（実ポリシー＝英字＋数字を含む8文字以上）。
    if (mode === 'signup') {
      const pwErr = validatePassword(password);
      if (pwErr) { setError(pwErr); return; }
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const res = await signUpWithEmail(email.trim(), password);
        if (!res.ok) { setError(res.error ?? '登録に失敗しました。'); return; }
        if (res.alreadyRegistered) {
          // 既存メール（確認メールは届かない）。ログインへ誘導。
          setError('このメールアドレスは既に登録済みです。ログインしてください。');
          setMode('login');
          setPassword('');
          return;
        }
        if (res.needsConfirm) {
          setInfo(`${email.trim()} に確認メールを送信しました。メール内のリンクから登録を完了し、その後ログインしてください。`);
          setMode('login');
          setPassword('');
          return;
        }
        // メール確認OFF環境では即ログイン状態。引き継ぎはストアが自動処理。
        router.push(dest);
        router.refresh();
      } else {
        const res = await signInWithEmail(email.trim(), password);
        if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
        // 端末の保存はログインで自動的にDBへ引き継がれる（saveStore）。会員はトップ（または redirectTo）へ。
        router.push(dest);
        router.refresh();
      }
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try { await signOut(); setCurrentEmail(null); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-pink-50/40 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-xl border border-pink-100 p-7 relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-24 h-24 bg-pink-100/40 rounded-full blur-xl" />
        <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-fuchsia-100/40 rounded-full blur-xl" />

        {/* ロゴ */}
        <div className="text-center mb-6 relative z-10">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center">
              <span className="text-pink-500 font-bold leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">福岡メンズエステポータル</span>
          </Link>
        </div>

        {checking ? (
          <div className="py-10 text-center text-sm text-slate-400 relative z-10">読み込み中...</div>
        ) : currentEmail ? (
          // ── ログイン中 ──
          <div className="relative z-10 text-center space-y-5">
            <p className="text-sm text-slate-600">
              <span className="font-bold text-slate-900">{currentEmail}</span> でログイン中です。
            </p>
            <Link
              href={dest}
              className="block w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 transition-colors"
            >
              {dest === '/' ? 'トップへ戻る' : 'ページへ戻る'}
            </Link>
            <Link href="/saved" className="block text-sm text-pink-600 hover:underline">保存した一覧を見る</Link>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-medium text-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              {loading ? '処理中...' : 'ログアウト'}
            </button>
          </div>
        ) : (
          // ── ログイン / 新規登録フォーム ──
          <div className="relative z-10">
            {/* タブ切替 */}
            <div className="flex gap-1 p-1 mb-5 rounded-xl bg-slate-100">
              {([['login', 'ログイン'], ['signup', '新規登録']] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(''); setInfo(''); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                    mode === m ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {info && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-[12px] leading-relaxed">
                  {info}
                </div>
              )}
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

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 block px-1">
                  パスワード{mode === 'signup' && <span className="font-normal text-slate-300">（{PASSWORD_HINT}）</span>}
                </label>
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity disabled:opacity-60"
              >
                {loading ? '処理中...' : mode === 'signup' ? '新規登録する' : 'ログインする'}
              </button>
            </form>

            {/* 案内 */}
            <div className="mt-5 space-y-2 text-[11px] text-slate-400 leading-relaxed">
              {mode === 'signup' && (
                <p>登録後、確認メールが届きます。メール内のリンクで登録を完了してください。</p>
              )}
              <p>💾 この端末で保存したお気に入りは、ログインすると自動でアカウントに引き継がれます。</p>
              {mode === 'login' && (
                <p>
                  パスワードをお忘れの方：
                  <Link href="/forgot-password" className="text-pink-600 font-medium hover:underline ml-1">
                    再設定はこちら →
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <Link href="/" className="mt-6 text-xs text-slate-400 hover:text-pink-500 transition-colors">
        ← トップへ戻る
      </Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-pink-50/40" />}>
      <LoginInner />
    </Suspense>
  );
}
