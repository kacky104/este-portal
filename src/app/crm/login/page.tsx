'use client';

import { useState } from 'react';
import { signInWithEmail } from '@/lib/auth';
import { isCrmHost } from '@/lib/crmHost';

// フクエスCRM のログイン（第631便・2026-09-21）。fukuescrm.com/login で開く。
// ★ アカウントはフクエスの店舗アカウントと同じ（Supabase Auth は共通）。★ Cookie はドメインごとなので、fukuescrm.com で1回ログインが要る。
// ★ ログインできたら【ハードリロード】で CRM のトップへ（★ コネックエフと同じ理由：確立直後の Cookie を Server Action に確実に乗せる）。
// ★ パスワードを忘れたときはフクエス本体の再設定画面へ（再設定のメールはフクエスから届く）。

export default function CrmLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const home = () => (isCrmHost(window.location.hostname) ? '/' : '/mypage/crm');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return; }
    setLoading(true);
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
      window.location.replace(home());
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef1f8] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[24px] font-black tracking-tight text-[#1e2a5a]">フクエスCRM</h1>
          <p className="mt-1 text-[13px] text-slate-500">店舗様専用ログイン</p>
        </div>

        <form onSubmit={submit} className="space-y-5 border border-slate-200 bg-white p-7 shadow-sm">
          <div>
            <label htmlFor="crm-email" className="mb-1.5 block text-[13px] font-bold text-slate-600">メールアドレス</label>
            <input
              id="crm-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full border border-slate-200 px-3.5 py-2.5 text-[15px] text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label htmlFor="crm-password" className="mb-1.5 block text-[13px] font-bold text-slate-600">パスワード</label>
            <input
              id="crm-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
              className="w-full border border-slate-200 px-3.5 py-2.5 text-[15px] text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {error && <p className="border border-red-100 bg-red-50 px-3 py-2 text-[14px] text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1e2a5a] py-3 text-[15px] font-bold text-white hover:opacity-95 disabled:opacity-60"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-slate-500">
          フクエスの店舗アカウント（マイページと同じメールアドレス・パスワード）でログインできます。
        </p>
        <p className="mt-2 text-center text-[12px]">
          <a href="https://fukues.com/forgot-password" className="font-bold text-indigo-600 underline">パスワードを忘れた方</a>
        </p>
      </div>
    </div>
  );
}
