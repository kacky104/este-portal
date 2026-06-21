'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmail, getSession, onAuthChange, signOut } from '@/lib/auth';
import { createClient } from '@/app/lib/supabase/client';

// redirectTo は同一オリジンの相対パスのみ許可（オープンリダイレクト防止）。
function safeRedirect(raw: string | null): string {
  if (!raw) return '/mypage';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/mypage';
  return raw;
}

// ログイン中ユーザーが自店舗を持つオーナーか（salons.owner_id 紐付け）。
async function checkIsOwner(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from('salons')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

function OwnerLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const dest = safeRedirect(params.get('redirectTo'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  // 「ログインできたが店舗オーナーではない」状態
  const [notOwner, setNotOwner] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  // マウント時：既ログインならオーナー判定。オーナーなら /mypage（dest）へ、非オーナーなら案内。
  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await getSession();
      if (!mounted) return;
      if (s) {
        setCurrentEmail(s.user.email ?? null);
        const owner = await checkIsOwner();
        if (!mounted) return;
        if (owner) { router.replace(dest); return; }
        setNotOwner(true);
      }
      setChecking(false);
    })();
    const off = onAuthChange(s => { if (mounted) setCurrentEmail(s?.user.email ?? null); });
    return () => { mounted = false; off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotOwner(false);
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return; }
    setLoading(true);
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
      const owner = await checkIsOwner();
      if (owner) {
        router.push(dest);
        router.refresh();
      } else {
        setCurrentEmail(email.trim());
        setNotOwner(true);
      }
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try { await signOut(); setNotOwner(false); setCurrentEmail(null); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-pink-50 border border-pink-200 mb-4">
            <span className="text-pink-500 font-bold text-xl leading-none">◆</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">店舗オーナーログイン</h1>
          <p className="text-sm text-slate-500 mt-1">福岡メンズエステポータル 管理画面</p>
        </div>

        {checking ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">
            読み込み中...
          </div>
        ) : notOwner ? (
          // ログインはできたが、オーナーとして未登録
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4 text-center">
            <p className="text-sm text-slate-700 leading-relaxed">
              {currentEmail && <span className="font-bold">{currentEmail}</span>}
              <br />このアカウントは店舗オーナーとして登録されていません。
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              オーナーアカウントの発行は運営で行います。お心当たりがない場合は、一般のお客様（会員）ログインをご利用ください。
            </p>
            <Link
              href="/login"
              className="block w-full py-2.5 rounded-lg bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 transition"
            >
              会員ログインへ →
            </Link>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-60"
            >
              {loading ? '処理中...' : '別のアカウントでログイン'}
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">メールアドレス</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="owner@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">パスワード</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>

            <div className="mt-5 space-y-2 text-center">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                オーナーアカウントの発行は運営で行います。新規のお申し込みは運営までご連絡ください。
              </p>
              <p className="text-xs text-slate-500">
                一般のお客様（会員）のログインは
                <Link href="/login" className="text-pink-600 font-medium hover:underline ml-1">こちら →</Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OwnerLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <OwnerLoginInner />
    </Suspense>
  );
}
