'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// 🌸 あなた専用のSupabaseの住所を確実にプログラムに紐付けます
const supabaseUrl = 'https://supabase.co';
const supabaseAnonKey = 'sb_publishable_FuaCt_l4aJjh0wLQV8QlmQ_RNC1nSdC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 🌸 100%完全に、Supabaseの会員名簿（本物）とのリアルタイム通信のみでログインを判定します。
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) {
        // IDやパスワードが1文字でも違っていたら、厳格にエラーを出して弾きます
        setError('メールアドレスまたはパスワードが正しくありません。');
      } else if (data.user) {
        // 🔓 完全に一致した時だけ、管理画面（/admin）への進入を許可します
        router.push('/admin');
      }
    } catch (err) {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
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
          <p className="text-[10px] text-slate-400">本物のSupabase Authで厳重に守られています</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 relative z-10">
          {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[11px] font-medium text-center">⚠️ {error}</div>}

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block px-1">ログインID</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="salon@example.com" required disabled={loading} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs bg-slate-50/50" />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block px-1">パスワード</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={loading} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs bg-slate-50/50" />
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1 pt-3.5">
            {loading ? '認証中...' : 'ログインする 🔓'}
          </button>
        </form>
      </div>
    </div>
  );
}
