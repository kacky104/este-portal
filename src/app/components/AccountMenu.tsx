'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSession, onAuthChange, signOut } from '@/lib/auth';

// 共通ヘッダーの会員ログイン状態UI。
// 未ログイン: 「ログイン」リンク（→ /login）。
// ログイン中: メール先頭文字アバター＋「アカウント ▾」。クリックでメニュー（保存した一覧 / ログアウト）。
// オーナー用 /owner/login はここには出さない（専用URL運用）。
export function AccountMenu() {
  // ハイドレーション対策：初期は未ログイン表示。マウント後に反映。
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    let active = true;
    getSession().then(s => { if (active) setEmail(s?.user.email ?? null); });
    const off = onAuthChange(s => { if (active) setEmail(s?.user.email ?? null); });
    return () => { active = false; off(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const loggedIn = mounted && !!email;

  // 未ログイン（初期表示を含む）
  if (!loggedIn) {
    return (
      <Link
        href="/login"
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-pink-200 text-pink-600 text-sm font-medium hover:bg-pink-50 hover:border-pink-300 transition-colors"
        aria-label="ログイン"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
        <span className="hidden sm:inline">ログイン</span>
      </Link>
    );
  }

  const initial = (email as string).charAt(0).toUpperCase();

  const handleLogout = async () => {
    await signOut();
    setEmail(null);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="アカウント"
        className="inline-flex items-center gap-1.5 h-8 pl-1 pr-2 rounded-full border border-slate-200 bg-white hover:border-pink-300 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-pink-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {initial}
        </span>
        <span className="hidden sm:inline text-sm text-slate-600 font-medium">アカウント</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-[11px] text-slate-400">ログイン中</p>
            <p className="text-sm text-slate-700 font-medium truncate">{email}</p>
          </div>
          <Link
            href="/saved"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E2B85A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            保存した一覧
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
