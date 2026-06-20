'use client';

import { useState } from 'react';
import type { SalonTheme } from '@/app/lib/themes';

// 公開お知らせのアコーディオン表示。
// 初期はサムネイル画像＋タイトル＋日付のみ表示し、クリックで本文（＋フルサイズ画像）を展開する。
export type NewsItem = {
  id: string;
  title: string;
  dateLabel: string;
  content: string;
  imageUrl: string | null;
  isNew: boolean;
};

export function NewsAccordion({ items, theme }: { items: NewsItem[]; theme: SalonTheme }) {
  return (
    <div className="space-y-4">
      {items.map(item => (
        <NewsCard key={item.id} item={item} theme={theme} />
      ))}
    </div>
  );
}

function NewsCard({ item, theme }: { item: NewsItem; theme: SalonTheme }) {
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
      {/* ヘッダー（常時表示・クリックで開閉）：サムネイル＋タイトル＋日付 */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-4 p-4 sm:p-5 text-left cursor-pointer select-none group"
      >
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover flex-shrink-0 border"
            style={{ borderColor: theme.cardBorder }}
          />
        )}
        <div className="flex-1 min-w-0">
          {item.isNew && (
            <span
              className="inline-block mb-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white tracking-wide shadow-sm"
              style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
            >
              NEW!!
            </span>
          )}
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700 flex-shrink-0" />
            <h2 className="font-bold text-base min-w-0 break-words" style={{ color: theme.heading }}>{item.title}</h2>
          </div>
          <p className="text-xs" style={{ color: theme.body }}>{item.dateLabel}</p>
        </div>
        <span className="flex items-center gap-1.5 flex-shrink-0 text-pink-500 group-hover:text-pink-600 transition-colors">
          <span className="text-[11px] font-bold whitespace-nowrap hidden sm:inline">{open ? '閉じる' : 'タップで開く'}</span>
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

      {/* 開閉アニメーション（grid-rows 0fr→1fr）。展開時に本文とフルサイズ画像を表示。 */}
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-4 sm:px-5 pb-5">
            {item.imageUrl && (
              <div className="mb-3 rounded-xl overflow-hidden border" style={{ borderColor: theme.cardBorder }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt={item.title} className="w-full h-auto max-h-96 object-contain bg-black/5" />
              </div>
            )}
            {item.content ? (
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: theme.body }}>{item.content}</p>
            ) : (
              <p className="text-sm" style={{ color: theme.body }}>（本文はありません）</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
