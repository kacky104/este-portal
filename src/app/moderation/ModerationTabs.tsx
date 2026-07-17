'use client';

import { useState, type ReactNode } from 'react';

// /moderation のタブ切替。上段タブ＝口コミ審査／書類。口コミ審査の中はさらに
// サブタブ（口コミ審査＝審査待ち／承認済み）で分ける（2026-07-17 仕様変更）。
// 中身はサーバー側で描画済みの ReactNode を受け取り、hidden 切替で両方マウントしたまま
// 表示だけ切り替える（/admin のタブと同方針・stateを保持）。
export function ModerationTabs({
  reviewsPending,
  reviewsApproved,
  documents,
}: {
  reviewsPending: ReactNode;
  reviewsApproved: ReactNode;
  documents: ReactNode;
}) {
  const [tab, setTab] = useState<'reviews' | 'docs'>('reviews');
  const [reviewTab, setReviewTab] = useState<'pending' | 'approved'>('pending');

  // large=上段タブ（大きめ）。サブタブ（口コミ審査/承認済み）は従来サイズのまま。
  const pill = (selected: boolean, large = false) =>
    `${large ? 'px-6 py-2.5 text-sm' : 'px-4 py-1.5 text-xs'} rounded-full border font-bold transition-colors ${
      selected
        ? 'bg-pink-50 text-pink-600 border-pink-300'
        : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
    }`;

  return (
    <>
      <div className="flex gap-1.5 mb-6">
        {([
          ['reviews', '口コミ審査'],
          ['docs', '書類'],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={pill(tab === key, true)}>
            {label}
          </button>
        ))}
      </div>

      <div className={tab === 'reviews' ? '' : 'hidden'}>
        {/* サブタブ：口コミ審査（審査待ち）／承認済み */}
        <div className="flex gap-1.5 mb-6">
          {([
            ['pending', '口コミ審査'],
            ['approved', '承認済み'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setReviewTab(key)}
              aria-pressed={reviewTab === key}
              className={pill(reviewTab === key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={reviewTab === 'pending' ? '' : 'hidden'}>{reviewsPending}</div>
        <div className={reviewTab === 'approved' ? '' : 'hidden'}>{reviewsApproved}</div>
      </div>

      <div className={tab === 'docs' ? '' : 'hidden'}>{documents}</div>
    </>
  );
}
