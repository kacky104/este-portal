'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSavedCount, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import { getSavedTherapistCount, SAVED_THERAPISTS_EVENT } from '@/lib/savedTherapists';

// 共通ヘッダー右側のお気に入りブックマーク。クリックで /saved へ遷移。
// 件数バッジは「店舗（ピンク #EC4899）」「セラピスト（紫 #A855F7）」の2つを縦に表示。
// 各0件で非表示、各イベント／storage でライブ更新（保存は店舗/セラピストで別管理）。
export function SavedSalonsMenu() {
  // ハイドレーション対策：初期は0件で描画し、マウント後に反映。
  const [mounted, setMounted] = useState(false);
  const [salonCount, setSalonCount] = useState(0);
  const [therapistCount, setTherapistCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      setSalonCount(getSavedCount());
      setTherapistCount(getSavedTherapistCount());
    };
    sync();
    window.addEventListener(SAVED_SALONS_EVENT, sync);
    window.addEventListener(SAVED_THERAPISTS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_SALONS_EVENT, sync);
      window.removeEventListener(SAVED_THERAPISTS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const salons = mounted ? salonCount : 0;
  const therapists = mounted ? therapistCount : 0;

  const badgeBase =
    'min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none';

  return (
    <div className="relative inline-flex flex-shrink-0">
      <Link
        href="/saved"
        aria-label="保存した一覧"
        className="inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-amber-50"
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
      </Link>

      {/* 件数バッジ（店舗＝ピンク 上 / セラピスト＝紫 下）。縦並び・右上起点。 */}
      <span className="absolute -top-0.5 -right-0.5 flex flex-col items-end gap-0.5">
        {salons > 0 && (
          <Link href="/saved#salons" aria-label={`保存した店舗 ${salons}件`} className={`${badgeBase} bg-[#EC4899]`}>
            {salons}
          </Link>
        )}
        {therapists > 0 && (
          <Link
            href="/saved#therapists"
            aria-label={`保存したセラピスト ${therapists}件`}
            className={`${badgeBase} bg-[#A855F7]`}
          >
            {therapists}
          </Link>
        )}
      </span>
    </div>
  );
}
