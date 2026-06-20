'use client';

import { useState } from 'react';
import type { SalonTheme } from '@/app/lib/themes';

type Course = { name: string; duration: string; price: string };

// コースメニュー・料金表の折り畳みブロック。
// 初期状態はタイトルのみ表示（閉）。ヘッダーをタップで内容を開閉する。
// タップ可能であることを示すため、右側に「タップで開く／閉じる」ラベルと回転するシェブロンを配置。
export function CollapsibleCourses({ courses, theme }: { courses: Course[]; theme: SalonTheme }) {
  const [open, setOpen] = useState(false);

  // 同名コースをグループ化（従来の表示ロジックを踏襲）。
  const grouped = Array.from(
    courses.reduce((map, c) => {
      if (!map.has(c.name)) map.set(c.name, []);
      map.get(c.name)!.push(c);
      return map;
    }, new Map<string, Course[]>())
  );

  return (
    <section className="rounded-2xl border shadow-sm p-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2.5 cursor-pointer select-none group"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700 flex-shrink-0" />
          <span className="font-bold text-left min-w-0 break-words" style={{ color: theme.heading }}>コースメニュー・料金表</span>
        </span>
        <span className="flex items-center gap-1.5 flex-shrink-0 text-pink-500 group-hover:text-pink-600 transition-colors">
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

      {/* 開閉アニメーション（grid-rows 0fr→1fr） */}
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100 mt-5' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="space-y-5">
            {grouped.map(([name, items]) => (
              <div key={name}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-pink-400 flex-shrink-0" />
                  <h3 className="text-sm font-bold min-w-0 break-words" style={{ color: theme.heading }}>{name}</h3>
                </div>
                <div className="pl-4 space-y-1.5">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm border-b pb-1 last:border-0 last:pb-0" style={{ borderColor: theme.cardBorder }}>
                      <span className="min-w-0 break-words" style={{ color: theme.body }}>{item.duration}</span>
                      <span className="font-bold text-pink-600 flex-shrink-0 break-words text-right">{item.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-5 opacity-70" style={{ color: theme.body }}>※ 表示料金はすべて税込み価格です。</p>
        </div>
      </div>
    </section>
  );
}
