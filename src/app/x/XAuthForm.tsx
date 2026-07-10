'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  onAuthChange,
} from '@/lib/auth';
import { PASSWORD_HINT, validatePassword } from '@/lib/password';
import { XLogo } from './XLogo';

// fukuX 専用のサインアップ／ログイン UI。認証方式は既存フクエスと同一（@/lib/auth の Supabase メール+パスワード、
// 確認メールは PKCE で /auth/callback 着地）。成功後は開設フロー（/x/onboarding）へ。
// onboarding 側で「x_profiles 作成済みなら /x へ」リダイレクトするため、ここでは一律 onboarding に送ってよい。
const DEST = '/x/onboarding';

export function XAuthForm({ initialMode }: { initialMode: 'login' | 'signup' }) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  // 既存メアド（＝フクエス会員など）でサインアップを試みたときの「ログインへ誘導」表示フラグ。
  const [alreadyExists, setAlreadyExists] = useState(false);

  // サインアップ→ログインへ、入力済みメールを保持したまま切替（状態でメアド引き継ぎ）。
  const goLogin = () => {
    setMode('login');
    setAlreadyExists(false);
    setError('');
    setInfo('');
    setPassword('');
  };

  // 既ログインなら状態表示＋「fukuXへ進む」。
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSession().then((s) => {
      if (mounted) {
        setCurrentEmail(s?.user.email ?? null);
        setChecking(false);
      }
    });
    const off = onAuthChange((s) => {
      if (mounted) setCurrentEmail(s?.user.email ?? null);
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setAlreadyExists(false);
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }
    if (mode === 'signup') {
      const pwErr = validatePassword(password);
      if (pwErr) {
        setError(pwErr);
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        // 確認メールの着地先を /x/onboarding に（既存 callback の next 機構をそのまま利用）。
        const res = await signUpWithEmail(email.trim(), password, DEST);

        // 「登録済みらしき応答」は一律ログインへ倒す（メッセージ文字列だけに依存しない）：
        //  (b) 曖昧応答＝列挙対策で alreadyRegistered フラグ（本プロジェクトの実挙動）／
        //  (a) 明示エラー＝「既に登録」系メッセージ。どちらでも親切誘導に変換。
        const looksRegistered =
          res.alreadyRegistered === true ||
          (!res.ok && /既に登録|already regist|already been regist|user already/i.test(res.error ?? ''));
        if (looksRegistered) {
          setAlreadyExists(true);
          setPassword('');
          return;
        }
        if (!res.ok) {
          setError(res.error ?? '登録に失敗しました。');
          return;
        }
        if (res.needsConfirm) {
          // 新規メール＝確認メール送信。ただし列挙対策で既存メールでも同応答になり得るため、
          // 「すでに登録済みならログイン」も併記した両対応の文言にする。
          setInfo(
            `${email.trim()} に確認メールを送信しました。メール内のリンクから登録を完了すると、アカウント開設に進めます。すでにアカウントをお持ちの場合は、下の「ログイン」からそのままお進みください。`
          );
          setPassword('');
          return;
        }
        // 確認OFF環境では即セッション → 開設フローへ。
        router.push(DEST);
        router.refresh();
      } else {
        const res = await signInWithEmail(email.trim(), password);
        if (!res.ok) {
          setError(res.error ?? 'ログインに失敗しました。');
          return;
        }
        router.push(DEST);
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
    try {
      await signOut();
      setCurrentEmail(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-10 flex flex-col items-center">
      <div className="w-full max-w-sm rounded-3xl bg-[color:var(--x-surface)] shadow-xl border border-[color:var(--x-border)] p-7">
        {/* ロゴ */}
        <div className="text-center mb-6">
          <XLogo size="lg" />
          <p className="text-[12px] text-[color:var(--x-text-muted)] mt-2">メンズエステ専用SNS～フクエックス～</p>
        </div>

        {checking ? (
          <div className="py-10 text-center text-sm text-[color:var(--x-text-muted)]">読み込み中...</div>
        ) : currentEmail ? (
          // ── 既ログイン ──
          <div className="text-center space-y-5">
            <p className="text-sm text-[color:var(--x-text-secondary)]">
              <span className="font-bold text-[color:var(--x-text-primary)]">{currentEmail}</span> でログイン中です。
            </p>
            <Link
              href={DEST}
              className="block w-full py-3 rounded-xl text-white font-bold text-sm hover:opacity-95 transition-opacity"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              fukuX へ進む
            </Link>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="w-full py-2.5 rounded-xl border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] font-medium text-sm hover:bg-[color:var(--x-surface-hover)] transition-colors disabled:opacity-60"
            >
              {loading ? '処理中...' : 'ログアウト'}
            </button>
          </div>
        ) : (
          <>
            {/* タブ切替 */}
            <div className="flex gap-1 p-1 mb-5 rounded-xl bg-[color:var(--x-inset)]">
              {([['login', 'ログイン'], ['signup', '新規登録']] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError('');
                    setInfo('');
                    setAlreadyExists(false);
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                    mode === m ? 'bg-[color:var(--x-surface)] text-[color:var(--x-accent)] shadow-sm' : 'text-[color:var(--x-text-muted)] hover:text-[color:var(--x-text-secondary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 既存メアドでサインアップを試みたとき：行き止まりにせずログインへ誘導（メアドは保持） */}
            {alreadyExists && (
              <div className="mb-4 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-[12px] text-indigo-700 leading-relaxed">
                このメールアドレスは<strong>すでにご利用可能</strong>です（フクエスのアカウントなど）。ログインして fukuX を始めましょう。
                <button
                  type="button"
                  onClick={goLogin}
                  className="mt-2 w-full py-2 rounded-lg text-white font-bold text-sm hover:opacity-95 transition-opacity"
                  style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                >
                  ログインへ進む（{email.trim()}）
                </button>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              {info && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-[12px] leading-relaxed">
                  {info}
                  <button type="button" onClick={goLogin} className="block mt-1 font-bold text-indigo-600 underline hover:opacity-80">
                    ログインへ進む →
                  </button>
                </div>
              )}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
                  ⚠️ {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block px-1">メールアドレス</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (alreadyExists) setAlreadyExists(false);
                  }}
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-sm bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block px-1">
                  パスワード
                  {mode === 'signup' && <span className="font-normal text-[color:var(--x-text-muted)]">（{PASSWORD_HINT}）</span>}
                </label>
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={mode === 'signup' ? 8 : undefined}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-sm bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
              >
                {loading ? '処理中...' : mode === 'signup' ? '新規登録する' : 'ログインする'}
              </button>
            </form>

            <div className="mt-5 space-y-2 text-[11px] text-[color:var(--x-text-muted)] leading-relaxed">
              {mode === 'signup' && (
                <>
                  <p>登録後、確認メールが届きます。メール内のリンクで登録を完了してください。</p>
                  <p>
                    すでにアカウントをお持ちの方は
                    <button type="button" onClick={goLogin} className="text-[color:var(--x-accent)] font-medium hover:underline ml-1">
                      ログイン
                    </button>
                  </p>
                </>
              )}
              {mode === 'login' && (
                <>
                  <p>fukuX が初めての方も、ログインすると続けてアカウント開設に進めます。</p>
                  <p>
                    パスワードをお忘れの方：
                    <Link href="/forgot-password" className="text-[color:var(--x-accent)] font-medium hover:underline ml-1">
                      再設定はこちら →
                    </Link>
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <Link href="/x" className="x-rescue-link mt-6 text-xs text-white/80 hover:text-white transition-colors drop-shadow-sm">
        ← fukuX トップへ
      </Link>
    </div>
  );
}
