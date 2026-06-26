'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession, onAuthChange, updatePassword } from '@/lib/auth';
import { PASSWORD_HINT, PASSWORD_ERROR, validatePassword } from '@/lib/password';
import { readInviteHash, establishSessionFromHash, clearAuthHash } from '../inviteHash';

// セラピスト用パスワード再設定の着地ページ（会員 /reset-password のクローン）。
// 違いは2点：
//  1) 成功後の遷移先が /cast（会員版はトップ '/'）。ハードナビゲーションで /cast のガード（getUser）に
//     確実にセッションを伝える（フェーズ1の遷移レース対策と同じ理由）。
//  2) マウント時に、recovery がハッシュ形式（#access_token=...）で着地した場合も
//     inviteHash の流用でセッションを確立し URL を浄化する（PKCE/?code= ・ token_hash ・ # の3形態に対応）。
//     ※ readInviteHash は type を問わず access_token/refresh_token を拾うため recovery でも使える。

function passwordUpdateError(res: { error?: string; code?: string }): string {
  const code = res.code ?? '';
  const m = (res.error ?? '').toLowerCase();
  if (code === 'same_password' || m.includes('different from the old') || m.includes('should be different')) {
    return '新しいパスワードは、現在のパスワードと異なるものを設定してください。';
  }
  if (
    code === 'weak_password' ||
    m.includes('should be at least') ||
    m.includes('should contain') ||
    m.includes('weak password') ||
    m.includes('password is too')
  ) {
    return PASSWORD_ERROR;
  }
  return 'パスワードの変更に失敗しました。時間をおいて再度お試しください。';
}

export default function CastResetPasswordPage() {
  // リカバリーセッションの有無（/auth/callback 経由 or ハッシュ着地で確立済みの想定）。
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // recovery がハッシュ形式（#access_token=...&type=recovery）で着地した場合の保険。
      // /auth/callback はハッシュを見られないため、クライアントでトークンを拾ってセッション確立 → URL浄化。
      const h = readInviteHash();
      if (h) {
        await establishSessionFromHash(h);
        clearAuthHash();
      }
      const s = await getSession();
      if (!mounted) return;
      setHasSession(!!s);
      setChecking(false);
    })();
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
      if (!res.ok) { setError(passwordUpdateError(res)); return; }
      setDone(true);
      // 変更後はログイン済み状態。少し見せてから /cast へ（ハードナビでガードに確実に伝える）。
      setTimeout(() => { window.location.assign('/cast'); }, 1600);
    } catch {
      setError('通信エラーが発生しました。時間をおいて再度お試しください。');
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
          <h1 className="text-lg font-bold text-slate-900">新しいパスワードの設定</h1>
          <p className="text-sm text-slate-500 mt-1">フクエス セラピスト専用ページ</p>
        </div>

        {checking ? (
          <div className="py-8 text-center text-sm text-slate-400">読み込み中...</div>
        ) : done ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <p className="text-sm text-slate-700 font-medium">パスワードを変更しました。</p>
            <p className="text-xs text-slate-400">セラピストページへ移動します...</p>
          </div>
        ) : !hasSession ? (
          // リカバリーセッションが無い（直接アクセス・期限切れ等）
          <div className="text-center space-y-5">
            <p className="text-sm text-slate-600 leading-relaxed">
              リンクが無効か、有効期限が切れている可能性があります。<br />お手数ですが、再度お試しください。
            </p>
            <Link
              href="/cast/forgot-password"
              className="block w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 transition-colors"
            >
              再設定メールを送り直す
            </Link>
            <Link href="/cast/login" className="block text-sm text-slate-400 hover:text-pink-500 transition-colors">セラピストログインに戻る</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
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
              className="w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 transition-colors disabled:opacity-60"
            >
              {loading ? '変更中...' : 'パスワードを変更する'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
