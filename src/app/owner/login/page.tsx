'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
        // ★ 第1180便: 画面の中の移動（router）ではなく、ページごと開き直す（下の submit と同じ理由）
        if (owner) { window.location.replace(dest); return; }
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
    // ★ ログインできて移動を始めたら、ボタンを「ログイン中...」のままにしておく（もう一度押せないように）
    let leaving = false;
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
      const owner = await checkIsOwner();
      if (owner) {
        // ★★ 第1180便（2026-10-04・カッキーさん「ログインを押しても画面が変わらず、リロードすると入れる」）:
        //   router.push(dest) → router.refresh() だと、ログインはできているのに画面がログインのまま残ることがあった
        //   （画面の中の移動は、ブラウザに残っている「未ログインなのでログインへ戻す」という古い結果を使い回すことがある）。
        //   → ページごと開き直す（＝リロードと同じ動き。新しいログインの cookie を付けてサーバーに聞き直す）。
        //   ★ フクエスCRM・コネックエフのログイン（window.location.replace）と同じやり方。
        //   ★ dest は safeRedirect を通した【このサイトの中のパス】だけ。
        leaving = true;
        window.location.assign(dest);
      } else {
        setCurrentEmail(email.trim());
        setNotOwner(true);
      }
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      if (!leaving) setLoading(false);
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
          {/* ★ 第937便: ダイヤ（◆）→ フクエスのロゴ（/logo.png） */}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-pink-50 border border-pink-200 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- ★ 第1074便: 28px の小さなロゴ（最適化の効果がない） */}
            <img src="/logo.png" alt="フクエス" width={28} height={28} className="w-7 h-7" />
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

            {/* ★ 第1235便（カッキーさん）: ログインボタンの下に、パスワードの変更（再設定）への入口。
                運営が発行した最初のパスワードを、店舗様が自分で変えられるように。行き先は会員と同じ /forgot-password（メールで再設定のリンクが届く）。 */}
            <p className="mt-3 text-center text-xs text-slate-500">
              パスワードの変更は
              <Link href="/forgot-password" className="text-pink-600 font-medium hover:underline ml-1">こちら →</Link>
            </p>

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
