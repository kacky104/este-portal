'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

// 共通ヘッダー右端のメニュー（ハンバーガー）。
// サイト内の主要コンテンツ導線（人気ランキング/特徴で探す/写メ日記/口コミ/新人/SNS）をまとめる。
// ヘッダーの各アイコン（保存/VIP/通知/アカウント）とは別物で、ここにはコンテンツ系リンクのみを入れる。
// ボタンは丸枠なし・三本線＋下に「menu」表記。クリックで右側からドロワーがスライドイン（角は直角）。
// 各項目は文字ラベルのみ（左アイコンなし）。オーバーレイのクリック・Escで閉じる。
//
// createPortal で document.body 直下へ描画する。ヘッダーが backdrop-blur を持つと、その内側の
// position:fixed の基準がヘッダーになり全高/全画面にならないため、body直下で回避する。
const ITEMS: { href: string; label: string }[] = [
  { href: '/news', label: '店舗新着情報' },
  { href: '/ranking', label: '人気ランキング' },
  { href: '/therapists', label: '特徴で探す' },
  { href: '/diary', label: '写メ日記' },
  { href: '/reviews', label: '口コミ' },
  { href: '/therapist/new', label: '新人' },
  { href: '/x-shops', label: 'SNS' },
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
                  className="flex items-center px-4 py-3.5 text-sm font-semibold text-slate-700 border-b border-slate-50 hover:bg-pink-50/70 transition-colors"
                >
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
