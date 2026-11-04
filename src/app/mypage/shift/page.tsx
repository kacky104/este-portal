'use client';

import Link from 'next/link';
import { useToast } from '@/app/components/useToast';
import { ShiftBoard } from '@/app/components/shift/ShiftBoard';

// マイページ「シフト管理表」（2026-11-04・店舗様のご要望）。中身は ShiftBoard（コネックエフと同じ）。
// ★ コネックエフに切り替えた店はコネックエフ側で使う（こちらも開けるが、メニューはコネックエフに出す）。
// ★ 使える店は SHIFT_SALON_IDS。テスト運用中（ラビリンス様だけ）はマイページのメニューには出していない。
export default function MypageShiftPage() {
  const { toast, showToast } = useToast();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">シフト管理表</h1>
          <Link href="/mypage" className="text-sm text-pink-600 underline">マイページへ戻る</Link>
        </div>
        <ShiftBoard onToast={showToast} />
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-[14px] font-bold px-4 py-2.5 shadow-lg">{toast}</div>
      )}
    </div>
  );
}
