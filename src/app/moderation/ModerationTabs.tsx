'use client';

import { useState, type ReactNode } from 'react';

// /moderation のタブ切替（口コミ審査／書類）。中身はサーバー側で描画済みの ReactNode を受け取り、
// hidden 切替で両方マウントしたまま表示だけ切り替える（/admin のタブと同方針・stateを保持）。
export function ModerationTabs({ reviews, documents }: { reviews: ReactNode; documents: ReactNode }) {
  const [tab, setTab] = useState<'reviews' | 'docs'>('reviews');
  return (
    <>
      <div className="flex gap-1.5 mb-6">
        {([
          ['reviews', '口コミ審査'],
          ['docs', '書類'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`px-4 py-1.5 rounded-full border text-xs font-bold transition-colors ${
              tab === key
                ? 'bg-pink-50 text-pink-600 border-pink-300'
                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={tab === 'reviews' ? '' : 'hidden'}>{reviews}</div>
      <div className={tab === 'docs' ? '' : 'hidden'}>{documents}</div>
    </>
  );
}
