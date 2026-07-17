'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 管理者の「オーナーとしてログイン」用の確認ページ。
// /admin で発行したリンク（#token_hash=...）を開くと、この画面のボタンを押した時点で
// verifyOtp によりオーナーとしてログインし /mypage へ移動する。
// ワンタイムトークンをリンク直踏みで消費しない（ブラウザのURL先読みで otp_expired になる事故を防ぐ）ため、
// 自動ログインではなく「ボタンクリックで実行」にしている。トークンはURLハッシュで受け取り、サーバーログに残さない。
export default function OwnerImpersonatePage() {
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const m = window.location.hash.match(/token_hash=([^&]+)/);
    setTokenHash(m ? decodeURIComponent(m[1]) : null);
  }, []);

  const handleLogin = async () => {
    if (!tokenHash || busy) return;
    setBusy(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    if (err) {
      setBusy(false);
      setError(`ログインに失敗しました（${err.message}）。リンクが失効している可能性があります。/admin から再発行してください。`);
      return;
    }
    // セッション確立後はフルリロードで /mypage へ（サーバー側にも cookie を確実に反映させる）。
    window.location.href = '/mypage';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center">
        <h1 className="text-base font-black text-slate-800 mb-2">オーナーとしてログイン</h1>
        <p className="text-xs text-slate-500 leading-relaxed mb-6">
          管理者向けの機能です。下のボタンを押すと、対象サロンのオーナーとしてログインし、マイページへ移動します。
          操作はオーナー本人の操作として記録されます。
        </p>
        {tokenHash ? (
          <button
            type="button"
            onClick={handleLogin}
            disabled={busy}
            className="w-full px-6 py-3 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-50 shadow-sm shadow-pink-500/20"
          >
            {busy ? 'ログイン中…' : 'オーナーとしてログインする'}
          </button>
        ) : (
          <p className="text-xs text-rose-500">リンクが不正です。/admin から再発行してください。</p>
        )}
        {error && <p className="text-xs text-rose-500 mt-3 leading-relaxed">{error}</p>}
      </div>
    </div>
  );
}
