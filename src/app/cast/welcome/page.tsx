'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSession, onAuthChange } from '@/lib/auth';
import { PASSWORD_HINT, validatePassword } from '@/lib/password';
import { claimCastTherapist, setCastPassword } from '@/app/actions/castInvite';
import { getCastXSetup, createCastXAccount } from '@/app/actions/castXSetup';
import { isXHandleTaken } from '@/app/actions/xProfile';
import { readInviteHash, establishSessionFromHash, clearAuthHash } from '@/app/lib/inviteHash';

// キャスト招待の着地ページ。
// /auth/callback で invite トークンが verify されセッションが確立した状態でここに来る想定。
// マウント時に本人化（claimCastTherapist：メール一致の therapists へ user_id を紐付け）を実行し、
// パスワードを設定させてから /cast へ送る。会員の /reset-password とは独立（遷移先は /cast）。
// ★ 第1475便（カッキーさん）: 有料のお店のセラピストで fukuX が未開設なら、ここで fukuX の @ID も入れてもらい、
//   パスワードを決めたあとに fukuX のアカウントを同時に開設する（表示名・アイコンはセラピストページから自動）。

const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;
type HandleState = 'idle' | 'bad' | 'checking' | 'ok' | 'taken';
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

  // ★ 第1475便: fukuX の同時開設
  const [xEligible, setXEligible] = useState(false);
  const [handle, setHandle] = useState('');
  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [xDoneHandle, setXDoneHandle] = useState<string | null>(null);
  const [xFail, setXFail] = useState('');

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
        if (res.ok) {
          setTherapistName(res.therapistName);
          // ★ 第1475便: fukuX を同時に開設する対象か（有料のお店・未開設）。読めなければ欄を出さない（今までどおり）
          try {
            const x = await getCastXSetup();
            if (mounted) setXEligible(x.eligible);
          } catch { /* 欄を出さないだけ */ }
        } else setClaimError(res.error);
      }
      setChecking(false);
    })();
    // PASSWORD_RECOVERY/INVITE 等で後からセッションが入る場合に追従。
    const off = onAuthChange(s => { if (mounted) setHasSession(!!s); });
    return () => { mounted = false; off(); };
  }, []);

  // ── fukuX の @ID のリアルタイム確認（fukuX の開設画面と同じ: 形式→重複） ──
  useEffect(() => {
    if (!handle) { setHandleState('idle'); return; }
    if (!HANDLE_RE.test(handle)) { setHandleState('bad'); return; }
    let cancelled = false;
    setHandleState('checking');
    const t = setTimeout(async () => {
      let taken = false;
      try {
        const r = await isXHandleTaken(handle);
        taken = r.ok ? r.taken : false; // 確かめられないときは通す（本当に重複なら開設時に断られ、理由を出す）
      } catch { /* 同上 */ }
      if (cancelled) return;
      setHandleState(taken ? 'taken' : 'ok');
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [handle]);

  const handleHint = (() => {
    switch (handleState) {
      case 'bad': return { text: '半角英数字とアンダースコア（_）、3〜20文字で入力してください', cls: 'text-rose-500' };
      case 'checking': return { text: '確認中...', cls: 'text-slate-400' };
      case 'ok': return { text: '✓ 使用できます', cls: 'text-emerald-600' };
      case 'taken': return { text: 'このIDは使われています', cls: 'text-rose-500' };
      default: return { text: '半角英数字とアンダースコア（_）、3〜20文字', cls: 'text-slate-400' };
    }
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    if (password !== confirm) { setError('確認用パスワードが一致しません。'); return; }
    if (xEligible && handleState !== 'ok') {
      setError(handleState === 'taken' ? 'fukuX のIDは使われています。別のIDを入れてください。' : 'fukuX のIDを入れてください（半角英数字と _ の3〜20文字）。');
      return;
    }
    setLoading(true);
    try {
      // ★ 第962便: ブラウザ（supabase-js）ではなくサーバーで設定する（ブラウザ側でセッションが読めず、送る前に止まる事故があった）。
      const res = await setCastPassword(password);
      if (!res.ok) { setError(res.error); return; }
      // 念のため本人化を再実行（冪等）。
      await claimCastTherapist();
      // ★ 第1475便: fukuX を同時に開設。★ 失敗してもパスワードの設定は済んでいるので先へ進む（/cast から開設できる）
      let wait = 1500;
      if (xEligible) {
        try {
          const xr = await createCastXAccount(handle);
          if (xr.ok) setXDoneHandle(xr.handle);
          else if (xr.reason !== 'skip') { setXFail(xr.error || 'fukuX のアカウントを開設できませんでした。'); wait = 5000; }
        } catch {
          setXFail('fukuX のアカウントを開設できませんでした。'); wait = 5000;
        }
      }
      setDone(true);
      setTimeout(() => { router.push('/cast'); router.refresh(); }, wait);
    } catch {
      setError('通信できませんでした。電波のよい場所で、もう一度押してください。');
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
            <span className="text-[12px] font-normal leading-none text-slate-400">セラピスト</span>
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
            {xDoneHandle && (
              <p className="text-[12px] text-violet-700 font-bold bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                fukuX のアカウント（@{xDoneHandle}）も開設しました
              </p>
            )}
            {xFail && (
              <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
                {xFail}<br />fukuX はセラピストページの fukuX のマークから開設できます。
              </p>
            )}
            <p className="text-xs text-slate-400">セラピストページへ移動します...</p>
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
              セラピストログインへ
            </Link>
            {/* ★ 第962便: 招待メールは開けたがパスワードを決められなかった方は、ここからメールで設定できる */}
            <Link href="/cast/forgot-password" className="block text-[12px] text-pink-600 underline">
              パスワードをまだ決めていない方・忘れた方
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
                {/* ★ 第962便: 何度やっても通らないときの逃げ道（メールでパスワードを決める） */}
                <Link href="/cast/forgot-password" className="block mt-2 underline text-pink-600">パスワードを忘れた方（メールで設定する）</Link>
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="cast-welcome-password" className="text-[11px] font-bold text-slate-400 block px-1">
                パスワード<span className="font-normal text-slate-300">（{PASSWORD_HINT}）</span>
              </label>
              <input
                id="cast-welcome-password"
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
              <label htmlFor="cast-welcome-password-confirm" className="text-[11px] font-bold text-slate-400 block px-1">パスワード（確認）</label>
              <input
                id="cast-welcome-password-confirm"
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
            {xEligible && (
              <div className="space-y-1 pt-1">
                <label htmlFor="cast-welcome-x-handle" className="text-[11px] font-bold text-slate-400 block px-1">
                  fukuX のID<span className="ml-1.5 font-normal text-rose-400">※あとから変更できません</span>
                </label>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 focus-within:ring-2 focus-within:ring-violet-400 focus-within:border-transparent overflow-hidden">
                  <span className="pl-4 pr-1 text-slate-400 font-bold select-none">@</span>
                  <input
                    id="cast-welcome-x-handle"
                    type="text"
                    value={handle}
                    onChange={e => setHandle(e.target.value.trim().replace(/^@/, ''))}
                    placeholder="your_id"
                    maxLength={20}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loading}
                    className="flex-1 py-3 pr-4 bg-transparent text-sm focus:outline-none"
                  />
                </div>
                <p className={`text-[11px] px-1 ${handleHint.cls}`}>{handleHint.text}</p>
                <p className="text-[11px] text-slate-400 px-1 leading-relaxed">
                  セラピストページと一緒に、fukuX のアカウントも開設します（名前と写真はセラピストページと同じ）。
                </p>
              </div>
            )}
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
