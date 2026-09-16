'use client';

import { useEffect, useState } from 'react';
import { signInWithEmail } from '@/lib/auth';
import { getConecfAccess } from '@/app/actions/conecf';
import { useConecfHref } from '../ConecfBase';
import { ConecfLogo } from '../ConecfShell';

// コネックエフのログイン（第395便・1a・2026-09-17）。
// ★ アカウントはフクエスの店舗アカウントと同じ（Supabase Auth は共通）。★ Cookie はドメインごとなので、ここで1回ログインが要る。
// ★ 表向きフクエスのサイトではないので、画面にフクエスの名前は出さない。
// ★ ログインできたら【ハードリロード】でホームへ（★ HP管理画面と同じ理由：確立直後の Cookie を Server Action に確実に乗せる）。

export default function ConecfLoginPage() {
  const href = useConecfHref();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ★ すでにログイン済み（かつ入れる人）ならホームへ
  useEffect(() => {
    let alive = true;
    getConecfAccess().then((a) => {
      if (alive && a.ok) window.location.replace(href('/'));
    }).catch(() => { /* ★ 読めなくてもフォームは出す */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return; }
    setLoading(true);
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
      window.location.replace(href('/'));
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <ConecfLogo size={48} />
          <h1 className="mt-3 text-[22px] font-black text-slate-800 tracking-tight">コネックエフ</h1>
          <p className="text-[13px] text-slate-500 mt-1">店舗様専用ログイン</p>
        </div>

        <form onSubmit={submit} className="bg-white border border-slate-200 shadow-sm p-7 space-y-5">
          <div>
            <label htmlFor="conecf-email" className="block text-[13px] font-bold text-slate-600 mb-1.5">メールアドレス</label>
            <input
              id="conecf-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3.5 py-2.5 border border-slate-200 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="conecf-password" className="block text-[13px] font-bold text-slate-600 mb-1.5">パスワード</label>
            <input
              id="conecf-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 border border-slate-200 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          {error && (
            <p className="text-[14px] text-red-600 bg-red-50 border border-red-100 px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[15px] font-bold hover:opacity-95 disabled:opacity-60"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] text-slate-400 leading-relaxed">
          ログインできない場合は、担当者までお問い合わせください。
        </p>
      </div>
    </div>
  );
}
