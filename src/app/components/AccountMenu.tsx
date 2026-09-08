'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSession, onAuthChange, signOut } from '@/lib/auth';
import { createClient } from '@/app/lib/supabase/client';

// 共通ヘッダーの会員ログイン状態UI。
// 未ログイン: 「ログイン」リンク（→ /login）。
// ログイン中: メール先頭文字アバター＋「アカウント ▾」。クリックでメニュー（保存した一覧 / ログアウト）。
// ★ 2026-09-08（カッキーさんの相談）: ログイン中の人が【店舗オーナー】なら「店舗マイページ」、
//   【セラピスト本人】なら「セラピストページ」をメニューに出す。
//   ★ 会員と同じID/PWなので、ヘッダーの「ログイン」から入ってしまい、会員のマイページが出て
//     戸惑う、が実際に起きたため。★ 該当しない人には何も出ない（会員だけの人の画面は変わらない）。
//   ★ 判定は salons.owner_id / therapists.user_id を1回ずつ引くだけ（★ 新しい列・表は作らない）。
export function AccountMenu() {
  // ハイドレーション対策：初期は未ログイン表示。マウント後に反映。
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // ★ その人の立場（店舗オーナー／セラピスト）。★ 読めなければ false のまま＝出さないだけ。
  const [isOwner, setIsOwner] = useState(false);
  const [isCast, setIsCast] = useState(false);

  useEffect(() => {
    setMounted(true);
    let active = true;
    // ★ ログインしている人の id から、店舗オーナーか／セラピスト本人かを引く。
    //   ★ 失敗しても黙って false（★ メニューが壊れるより、入口が1つ出ないほうがまし）。
    const loadRoles = async (userId: string | null) => {
      if (!userId) { if (active) { setIsOwner(false); setIsCast(false); } return; }
      try {
        const supabase = createClient();
        const [o, c] = await Promise.all([
          supabase.from('salons').select('id').eq('owner_id', userId).limit(1),
          supabase.from('therapists').select('id').eq('user_id', userId).limit(1),
        ]);
        if (!active) return;
        setIsOwner(!o.error && (o.data?.length ?? 0) > 0);
        setIsCast(!c.error && (c.data?.length ?? 0) > 0);
      } catch {
        if (active) { setIsOwner(false); setIsCast(false); }
      }
    };
    getSession().then(s => {
      if (!active) return;
      setEmail(s?.user.email ?? null);
      void loadRoles(s?.user.id ?? null);
    });
    const off = onAuthChange(s => {
      if (!active) return;
      setEmail(s?.user.email ?? null);
      void loadRoles(s?.user.id ?? null);
    });
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
          {/* マイページ：メニュー内で一番押したくなる控えめな華やかさ（淡ピンク地＋丸地アイコン＋ブランド色文字） */}
          <Link
            href="/member"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-pink-700 bg-pink-50/70 hover:bg-pink-100/80 transition-colors"
          >
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-pink-100 to-fuchsia-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DB2777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
              </svg>
            </span>
            マイページ
          </Link>
          {/* ★ 店舗オーナー／セラピスト本人だけに出る入口（2026-09-08）。★ 会員のマイページの下。 */}
          {isOwner && (
            <Link
              href="/mypage"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 21v-6h6v6" />
                </svg>
              </span>
              店舗マイページ
            </Link>
          )}
          {isCast && (
            <Link
              href="/cast"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s-7-4.5-7-10a7 7 0 0 1 14 0c0 5.5-7 10-7 10z" />
                  <circle cx="12" cy="11" r="2.5" />
                </svg>
              </span>
              セラピストページ
            </Link>
          )}
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
