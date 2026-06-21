'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSavedCount, SAVED_SALONS_EVENT } from '@/lib/savedSalons';

// 共通ヘッダー右側のお気に入りブックマーク。
// クリックで /saved（保存したお店一覧）へ遷移する。
// 件数バッジは 0件で非表示、'saved-salons-changed' と 'storage' でライブ更新。
export function SavedSalonsMenu() {
  // ハイドレーション対策：初期は0件で描画し、マウント後に localStorage を反映。
  const [mounted, setMounted] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    const sync = () => setCount(getSavedCount());
    sync();
    window.addEventListener(SAVED_SALONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_SALONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const shown = mounted ? count : 0;

  return (
    <Link
      href="/saved"
      aria-label="保存したお店"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-amber-50 flex-shrink-0"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#E2B85A"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {shown > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
          {shown}
        </span>
      )}
    </Link>
  );
}
