'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';

// /cast のログアウトボタン（サーバーコンポーネントから使う小さなクライアント部品）。
export function CastSignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      await signOut();
      router.replace('/cast/login');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:border-rose-300 hover:text-rose-500 transition-colors disabled:opacity-50"
    >
      {loading ? '処理中...' : 'ログアウト'}
    </button>
  );
}
