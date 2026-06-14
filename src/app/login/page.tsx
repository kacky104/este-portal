'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (email === 'test@example.com' && password === 'password123') {
      router.push('/admin');
    } else {
      setError('メールアドレスまたはパスワードが間違っています。');
    }
  };

  return (
    <div className="min-h-screen bg-pink-50/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-xl border border-pink-100 p-6 space-y-6 relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-24 h-24 bg-pink-100/40 rounded-full blur-xl" />
        <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-fuchsia-100/40 rounded-full blur-xl" />

        <div className="text-center space-y-1 relative z-10">
          <span className="text-3xl">🔑</span>
          <h1 className="text-lg font-black text-slate-900 tracking-wide">サロン専用ログイン</h1>
          <p className="text-[10px] text-slate-400">以下のテスト用IDでログインできます</p>
          <div className="bg-slate-50 p-2 rounded-xl text-[9px] text-slate-500 font-mono text-left space-y-0.5 border border-slate-100 mt-2">
            <div>ID: test@example.com</div>
            <div>PW: password123</div>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 relative z-10">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[11px] font-medium text-center">
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block px-1">ログインID</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-pink-400 focus:outline-hidden text-xs bg-slate-50/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block px-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-pink-400 focus:outline-hidden text-xs bg-slate-50/50"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-md hover:opacity-90 active:scale-[0.98] transition-all pt-3.5"
          >
            ログインする 🔓
          </button>
        </form>

        <div className="text-center pt-2 relative z-10">
          <p className="text-[10px] text-slate-400">※アカウント発行はポータル管理人まで</p>
        </div>
      </div>
    </div>
  );
}
// supabase-auth-open
