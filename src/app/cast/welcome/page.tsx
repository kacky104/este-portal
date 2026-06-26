'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession, onAuthChange, updatePassword } from '@/lib/auth';
import { PASSWORD_HINT, validatePassword } from '@/lib/password';
import { claimCastTherapist } from '@/app/actions/castInvite';
import { readInviteHash, establishSessionFromHash, clearAuthHash } from '../inviteHash';

// キャスト招待の着地ページ。
// /auth/callback で invite トークンが verify されセッションが確立した状態でここに来る想定。
// マウント時に本人化（claimCastTherapist：メール一致の therapists へ user_id を紐付け）を実行し、
// パスワードを設定させてから /cast へ送る。会員の /reset-password とは独立（遷移先は /cast）。
export default function CastWelcomePage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [therapistName, setTherapistName] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // 招待リンクが implicit（ハッシュ）形式で直接ここへ着地した場合の保険。
      // 通常は /cast/login がハッシュを処理してから遷移してくるが、直接着地でも拾えるようにする。
      const h = readInviteHash();
      if (h) {
        await establishSessionFromHash(h);
        clearAuthHash();
      }
      const s = await getSession();
      if (!mounted) return;
      setHasSession(!!s);
      if (s) {
        // 招待セッションが確立していれば本人化を試みる（冪等）。
        const res = await claimCastTherapist();
        if (!mounted) return;
        if (res.ok) setTherapistName(res.therapistName);
        else setClaimError(res.error);
      }
      setChecking(false);
    })();
    // PASSWORD_RECOVERY/INVITE 等で後からセッションが入る場合に追従。
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
      if (!res.ok) { setError('パスワードの設定に失敗しました。時間をおいて再度お試しください。'); return; }
      // 念のため本人化を再実行（冪等）。
      await claimCastTherapist();
      setDone(true);
      setTimeout(() => { router.push('/cast'); router.refresh(); }, 1500);
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
          <span className="flex items-baseline justify-center gap-1">
            <span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span>
            <span className="text-[12px] font-normal leading-none text-slate-400">キャスト</span>
          </span>
          <h1 className="text-lg font-black text-slate-900 mt-2">ようこそ！パスワードを設定してください</h1>
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
            <p className="text-sm text-slate-700 font-medium">パスワードを設定しました。</p>
            <p className="text-xs text-slate-400">キャストページへ移動します...</p>
          </div>
        ) : !hasSession ? (
          // 招待セッションが無い（直接アクセス・期限切れ等）
          <div className="relative z-10 text-center space-y-5">
            <p className="text-sm text-slate-600 leading-relaxed">
              招待リンクが無効か、有効期限が切れている可能性があります。<br />
              お手数ですが、オーナーに招待の再送をご依頼ください。
            </p>
            <Link
              href="/cast/login"
              className="block w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 transition-colors"
            >
              キャストログインへ
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="relative z-10 space-y-4">
            {therapistName && (
              <p className="text-[12px] text-emerald-600 font-bold text-center bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                {therapistName} さんとして登録します
              </p>
            )}
            {claimError && (
              <p className="text-[12px] text-amber-600 font-medium text-center bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                {claimError}
              </p>
            )}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
                ⚠️ {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 block px-1">
                パスワード<span className="font-normal text-slate-300">（{PASSWORD_HINT}）</span>
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
              <label className="text-[11px] font-bold text-slate-400 block px-1">パスワード（確認）</label>
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
              {loading ? '設定中...' : 'パスワードを設定して始める'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
