'use client';

import { useEffect, useState } from 'react';
import { getSession, onAuthChange, updatePassword } from '@/lib/auth';
import { PASSWORD_HINT, validatePassword } from '@/lib/password';
import { claimHpAdmin } from '@/app/actions/hpAdmin';
import { readInviteHash, establishSessionFromHash, clearAuthHash } from '@/app/lib/inviteHash';

// ホームページ担当者（HP管理者）の招待着地ページ（2026-08-09 段階3）。
//
// 招待メールのリンクは必ずフクエス本体（fukues.com/auth/callback?next=/hp/welcome）へ着地させる。
// 店舗の独自ドメインを Supabase の Redirect URLs に1件ずつ登録する運用を避けるため。
// ここでパスワードを設定したあと、実際の作業は店舗ドメイン/admin で行ってもらう
// （Cookie はドメインごとに別なので、ここでのログイン状態は持ち越せない。リンクを提示して手動ログイン）。
//
// ※ /hp/[slug] より静的セグメントが優先されるため、slug='welcome' の店舗と衝突しても
//    このページが勝つ。運営が slug を発行するとき 'welcome' は使わないこと。

export default function HpWelcomePage() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [salonName, setSalonName] = useState('');
  const [adminUrl, setAdminUrl] = useState('');
  const [claimError, setClaimError] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // 招待リンクが implicit（#access_token=…）形式で着地した場合を拾う（キャスト招待と同じ）。
      const h = readInviteHash();
      if (h) {
        await establishSessionFromHash(h);
        clearAuthHash();
      }
      const s = await getSession();
      if (!mounted) return;
      setHasSession(!!s);
      if (s) {
        const res = await claimHpAdmin();
        if (!mounted) return;
        if (res.ok) { setSalonName(res.salonName); setAdminUrl(res.adminUrl); }
        else setClaimError(res.error);
      }
      setChecking(false);
    })();
    const off = onAuthChange((s) => { if (mounted) setHasSession(!!s); });
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
      await claimHpAdmin(); // 冪等。念のため再実行
      setDone(true);
    } catch {
      setError('通信エラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-lg border border-slate-100 p-7">
        <div className="text-center mb-6">
          <h1 className="text-lg font-black text-slate-900">
            ホームページ管理のアカウント設定
          </h1>
          {salonName && <p className="text-xs text-slate-500 mt-1">{salonName}</p>}
        </div>

        {checking ? (
          <div className="py-8 text-center text-sm text-slate-400">読み込み中...</div>
        ) : done ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-700 font-medium">パスワードを設定しました。</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              これからは下のURLからログインして、ホームページの写真や文章を更新できます。
              ブックマークしておいてください。
            </p>
            {adminUrl && (
              <a
                href={adminUrl}
                className="block w-full py-3 rounded-xl bg-pink-600 text-white font-bold text-sm hover:bg-pink-700 transition-colors break-all"
              >
                管理画面をひらく
              </a>
            )}
            {adminUrl && <p className="text-[11px] text-slate-400 break-all">{adminUrl}</p>}
          </div>
        ) : !hasSession ? (
          <div className="text-center space-y-5">
            <p className="text-sm text-slate-600 leading-relaxed">
              招待リンクが無効か、有効期限が切れている可能性があります。
              <br />
              お手数ですが、オーナー様に招待の再送をご依頼ください。
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {claimError && (
              <p className="text-[12px] text-amber-600 font-medium text-center bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
                {claimError}
              </p>
            )}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
                {error}
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="hp-welcome-password" className="text-[11px] font-bold text-slate-400 block px-1">
                パスワード<span className="font-normal text-slate-300">（{PASSWORD_HINT}）</span>
              </label>
              <input
                id="hp-welcome-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="hp-welcome-password-confirm" className="text-[11px] font-bold text-slate-400 block px-1">
                パスワード（確認）
              </label>
              <input
                id="hp-welcome-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? '設定中...' : 'パスワードを設定する'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
