'use client';

import { useEffect, useState } from 'react';

// 求人詳細（/jobs/[id]）のモバイル専用・応募固定バー（画面下部追従）。
// 表示のみの補助導線で、電話番号・フォーム誘導先は詳細ページの既存応募ブロック
// （<div id="apply-section">）と同一ロジックを流用する（新規fetch・新規判定は足さない）。
//  - 電話ボタン: tel:{phone}。phone が無ければ描画せず、応募フォームボタンのみ全幅表示。
//    （既存ブロックの `{job.salon.phone && <a href={`tel:${job.salon.phone}`}>}` と同条件）
//  - 応募フォームボタン: ページ内 #apply-section へアンカースクロール（既存 ApplyForm の入口へ誘導）。
//  - 既存の応募セクションがビューポート内にある間はバーを隠す（IntersectionObserver）。
//    → 応募ボタンが実際に見えている時は重複導線を出さない。
// md 以上（PC）では `md:hidden` で一切表示しない。
export function JobApplyBar({ phone }: { phone: string | null }) {
  // 応募セクションが可視の間は隠す。応募セクションはページ下部にあり初回表示では画面外のため、
  // 初期は「表示」始まり（ちらつき防止）。マウント後に IntersectionObserver が実態へ補正する。
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById('apply-section');
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHidden(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-40 md:hidden bg-white border-t border-emerald-100 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] transition-opacity duration-300 ${
        hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden={hidden}
    >
      <div className="flex items-center gap-2.5">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex items-center justify-center gap-1.5 flex-1 py-3 rounded-xl font-bold text-sm border transition-colors hover:bg-emerald-50"
            style={{ borderColor: '#6EE7B7', color: '#059669' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            電話で応募
          </a>
        )}
        <a
          href="#apply-section"
          className="flex items-center justify-center gap-1.5 flex-1 py-3 rounded-xl text-white font-bold text-sm shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M9 15l2 2 4-4" />
          </svg>
          応募フォーム
        </a>
      </div>
    </div>
  );
}
