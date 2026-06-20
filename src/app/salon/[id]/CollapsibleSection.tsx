'use client';

import { useState, type ReactNode } from 'react';
import type { SalonTheme } from '@/app/lib/themes';

// 汎用の折り畳みブロック。初期は閉でタイトルのみ表示、ヘッダータップで開閉。
// 右側に「タップで開く／閉じる」ラベルと丸背景＋回転シェブロンを置き、操作可能であることを示唆する。
//   variant='bar'   : ピンクの縦バー＋タイトル（SectionHeading と同デザイン）
//   variant='emoji' : 絵文字＋タイトル
//   mobileOnly=true : スマホのみ折り畳み。デスクトップ(md+)では常時展開し、トグルUIを隠す。
export function CollapsibleSection({
  theme,
  className,
  title,
  variant = 'bar',
  emoji,
  mobileOnly = false,
  children,
}: {
  theme: SalonTheme;
  className?: string;
  title: string;
  variant?: 'bar' | 'emoji';
  emoji?: string;
  mobileOnly?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className={className} style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2.5 cursor-pointer select-none group${mobileOnly ? ' md:cursor-default md:pointer-events-none' : ''}`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {variant === 'emoji'
            ? <span className="text-lg flex-shrink-0">{emoji}</span>
            : <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700 flex-shrink-0" />}
          <span className={`font-bold text-left min-w-0 break-words${variant === 'emoji' ? ' text-base' : ''}`} style={{ color: theme.heading }}>{title}</span>
        </span>
        <span className={`flex items-center gap-1.5 flex-shrink-0 text-pink-500 group-hover:text-pink-600 transition-colors${mobileOnly ? ' md:hidden' : ''}`}>
          <span className="text-[11px] font-bold whitespace-nowrap">{open ? '閉じる' : 'タップで開く'}</span>
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-pink-50 border border-pink-200">
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </span>
      </button>

      {/* 開閉アニメーション（grid-rows 0fr→1fr）。mobileOnly はデスクトップで常時展開。 */}
      <div
        className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100 mt-5' : 'grid-rows-[0fr] opacity-0'}${mobileOnly ? ' md:grid-rows-[1fr] md:opacity-100 md:mt-5' : ''}`}
      >
        <div className="overflow-hidden">
          {children}
        </div>
      </div>
    </section>
  );
}
