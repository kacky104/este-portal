'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

// 共通ヘッダー右端のメニュー（ハンバーガー）。
// サイト内の主要コンテンツ導線（人気ランキング/特徴で探す/写メ日記/口コミ/新人/SNS）をまとめる。
// ヘッダーの各アイコン（保存/VIP/通知/アカウント）とは別物で、ここにはコンテンツ系リンクのみを入れる。
// ボタンは丸枠なし・三本線＋下に「menu」表記。クリックで右側からドロワーがスライドイン（角は直角）。
//
// ドロワー／オーバーレイは createPortal で document.body 直下へ描画する。
// 理由：ヘッダーが backdrop-blur を持つと、その内側の position:fixed の基準がヘッダーになり
//       h-full や inset-0 がヘッダー範囲に閉じてしまう（背景が透明・全高にならない）。body直下なら回避できる。
const ITEMS: { href: string; label: string; icon: React.ReactNode }[] = [
  {
    href: '/ranking',
    label: '人気ランキング',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4h12v3a6 6 0 0 1-12 0V4z" /><path d="M6 5H3v1a3 3 0 0 0 3 3" /><path d="M18 5h3v1a3 3 0 0 1-3 3" /><path d="M9 20h6M12 13v7" />
      </svg>
    ),
  },
  {
    href: '/therapists',
    label: '特徴で探す',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
      </svg>
    ),
  },
  {
    href: '/diary',
    label: '写メ日記',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.2" /><path d="M8 6l1.5-2.2h5L16 6" />
      </svg>
    ),
  },
  {
    href: '/reviews',
    label: '口コミ',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: '/therapist/new',
    label: '新人',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l2.3 5.6 6 .5-4.6 3.9 1.4 5.9L12 16.9 6.5 19.8l1.4-5.9L3.3 9.1l6-.5z" />
      </svg>
    ),
  },
  {
    href: '/x-shops',
    label: 'SNS',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
      </svg>
    ),
  },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="メニュー"
        className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0 px-1 text-pink-600 hover:text-pink-700 transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="text-[10px] font-bold leading-none">menu</span>
      </button>

      {mounted && createPortal(
        <>
          {/* オーバーレイ（クリックで閉じる） */}
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className={`fixed inset-0 z-[100] bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          />

          {/* 右側からスライドインするドロワー（角は直角・背景は白） */}
          <div
            role="menu"
            aria-label="メニュー"
            className={`fixed top-0 right-0 z-[110] h-full w-64 max-w-[80vw] bg-white shadow-2xl border-l border-slate-200 transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-700">メニュー</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav>
              {ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-slate-700 border-b border-slate-50 hover:bg-pink-50/70 transition-colors"
                >
                  <span className="flex-shrink-0 w-8 h-8 bg-slate-50 flex items-center justify-center text-pink-600">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
