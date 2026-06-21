'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getSavedSalons,
  removeSaved,
  SAVED_SALONS_EVENT,
  type SavedSalon,
} from '@/lib/savedSalons';

// 共通ヘッダー右側のお気に入りブックマーク。
// 件数バッジ（0件は非表示）＋ 保存済みサロンのドロップダウン（localStorage を読むだけの簡易版）。
export function SavedSalonsMenu() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedSalon[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // ハイドレーション対策：初期は0件で描画し、マウント後に localStorage を反映。
  useEffect(() => {
    setMounted(true);
    const sync = () => setItems(getSavedSalons());
    sync();
    window.addEventListener(SAVED_SALONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_SALONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // 外側クリック／Esc で閉じる。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = mounted ? items.length : 0;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="お気に入りのサロン"
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-amber-50"
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
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="#E2B85A"
              stroke="#E2B85A"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-xs font-bold text-slate-700">保存したお店</span>
            {count > 0 && <span className="text-[11px] text-slate-400">{count}件</span>}
          </div>

          {count === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400">
              保存したお店はまだありません
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {items.map(s => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50"
                >
                  <Link
                    href={`/salon/${s.id}`}
                    onClick={() => setOpen(false)}
                    className="flex-1 min-w-0 text-sm text-slate-700 hover:text-pink-600 truncate"
                  >
                    {s.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeSaved(s.id)}
                    aria-label="お気に入りから削除"
                    className="flex-shrink-0 text-slate-300 hover:text-pink-500 transition-colors"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
