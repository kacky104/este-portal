'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmail, getSession, onAuthChange, signOut } from '@/lib/auth';
import { claimCastTherapist } from '@/app/actions/castInvite';
import { readInviteHash, establishSessionFromHash, clearAuthHash } from '../inviteHash';

function CastLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const linkError = params.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  // 「ログインできたが、紐づくキャスト（therapists）が無い」状態
  const [notCast, setNotCast] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);

  // マウント時：既ログインなら本人化を試み、紐付けがあれば /cast へ。無ければ案内。
  useEffect(() => {
    let mounted = true;
    (async () => {
      // 招待リンクが implicit（ハッシュ）形式で着地した場合（#access_token=...&type=invite）を最優先で処理。
      // サーバーの /auth/callback はハッシュを見られず error=invalid_link を付けてここへ戻すため、
      // クライアントでトークンを拾ってセッション確立 → URLからトークンを消し → パスワード設定（/cast/welcome）へ。
      const h = readInviteHash();
      if (h) {
        const ok = await establishSessionFromHash(h);
        clearAuthHash(); // ?error= とハッシュのトークンをURL/履歴から消す
        if (!mounted) return;
        if (ok) { router.replace('/cast/welcome'); return; }
        // 確立失敗（期限切れ等）は通常のログイン画面へフォールスルー
      }

      const s = await getSession();
      if (!mounted) return;
      if (s) {
        setCurrentEmail(s.user.email ?? null);
        const res = await claimCastTherapist();
        if (!mounted) return;
        // ハードナビゲーションで遷移（router.replace のソフト遷移だと、サーバーの
        // /cast ガード getUser() がCookie反映前に評価され未ログイン扱いで戻されるレースを避ける）。
        if (res.ok) { window.location.replace('/cast'); return; }
        setNotCast(true);
      }
      setChecking(false);
    })();
    const off = onAuthChange(s => { if (mounted) setCurrentEmail(s?.user.email ?? null); });
    return () => { mounted = false; off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotCast(false);
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return; }
    setLoading(true);
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
      const claim = await claimCastTherapist();
      if (claim.ok) {
        // ハードナビゲーションで /cast へ。soft navigation（router.push + refresh）だと、
        // ログイン直後に確立したセッションのCookieがサーバーの /cast ガード（getUser）へ
        // 反映される前に評価され、未ログイン扱いで /cast/login に戻されるレースが起きる
        // （push と refresh の二重リクエストがリフレッシュトークンのローテーションと競合する）。
        // 全documentリクエストとして遷移すれば確定済みCookieを必ず送れ、ガードが確実に通る。
        window.location.assign('/cast');
        return;
      } else {
        setCurrentEmail(email.trim());
        setNotCast(true);
      }
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try { await signOut(); setNotCast(false); setCurrentEmail(null); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-pink-50 border border-pink-200 mb-4">
            <span className="text-pink-500 font-bold text-xl leading-none">◆</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">キャストログイン</h1>
          <p className="text-sm text-slate-500 mt-1">フクエス セラピスト専用ページ</p>
        </div>

        {checking ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">
            読み込み中...
          </div>
        ) : notCast ? (
          // ログインはできたが、紐づくキャストが無い（会員・オーナー等の別アカウント）
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4 text-center">
            <p className="text-sm text-slate-700 leading-relaxed">
              {currentEmail && <span className="font-bold">{currentEmail}</span>}
              <br />このアカウントに紐づくキャスト情報が見つかりません。
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              オーナーからの招待メールに記載のアドレスでログインしているかご確認ください。お心当たりがない場合はオーナーに招待をご依頼ください。
            </p>
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
              {linkError && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  招待リンクの確認に失敗しました。メールとパスワードでログインするか、オーナーに再招待をご依頼ください。
                </p>
              )}
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
                  placeholder="cast@example.com"
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

            <div className="mt-5 text-center">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                初めての方は、オーナーから届いた招待メールのリンクからパスワードを設定してください。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CastLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <CastLoginInner />
    </Suspense>
  );
}
