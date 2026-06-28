'use client';

import { useEffect } from 'react';

// 画像をビューポート全体で「元画像のまま（トリミングなし）」拡大表示するライトボックス。
// src が null/空なら閉（非表示）。背景タップ・✕・Esc で閉じる。表示中は body スクロールロック。
// avatar/header の円形/カバートリミングはこのコンポーネントには持ち込まず、object-contain で全体表示する。
export function XImageLightbox({
  src,
  alt = '',
  onClose,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* ✕ ボタン */}
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        ✕
      </button>

      {/* 元画像全体（縦横比保持・ビューポート内に収める）。画像クリックは閉じる伝播を止める。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
}
