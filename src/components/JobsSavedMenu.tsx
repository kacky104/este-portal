'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getJobSavedCount, SAVED_JOB_SALONS_EVENT } from '@/lib/savedJobSalons';

// フクエスワーク専用ヘッダーの保存メニュー（本体 SavedSalonsMenu を参考にした簡易版）。
// 緑肉球アイコン＋保存店舗数バッジ。クリックで /jobs/saved へ。
// saveStore（getSavedCount）を購読し、同一ページ内の保存トグルでも即時に増減する。
// 0件時はアイコンのみ表示・バッジ非表示（本体と同じ挙動：アイコンは常時／バッジは>0のみ）。
export function JobsSavedMenu() {
  // ハイドレーション対策：初期は0件で描画し、マウント後に反映。
  const [mounted, setMounted] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    const sync = () => setCount(getJobSavedCount());
    sync();
    window.addEventListener(SAVED_JOB_SALONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_JOB_SALONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const n = mounted ? count : 0;

  return (
    <Link
      href="/jobs/saved"
      aria-label={`保存した求人 ${n}件`}
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-emerald-50 flex-shrink-0"
    >
      <Image
        src="/logo-fukuwork.png"
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        draggable={false}
        className="w-6 h-6 object-contain pointer-events-none select-none"
      />
      {n > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none"
          style={{ backgroundColor: '#10B981' }}
        >
          {n}
        </span>
      )}
    </Link>
  );
}
