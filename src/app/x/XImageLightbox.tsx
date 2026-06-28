'use client';

import { useEffect, useRef, useState } from 'react';

// 画像をビューポート全体で「元画像のまま（トリミングなし）」拡大表示するライトボックス。
// 単一画像（src）／複数画像（images + startIndex）の両対応。複数枚のときだけ左右ナビ
// （矢印ボタン / キーボード ← → / タッチスワイプ）と位置インジケーターを出す。
// list が空（src も images も無い）なら閉（非表示）。背景タップ・✕・Esc で閉じる。
// 表示中は body スクロールロック。avatar/header の円形/カバートリミングは持ち込まず object-contain。
export function XImageLightbox({
  src,
  images,
  startIndex = 0,
  alt = '',
  onClose,
}: {
  src?: string | null; // 既存：単一画像（後方互換のため残す）
  images?: string[]; // 追加：複数画像
  startIndex?: number; // 追加：開いたときの初期インデックス（default 0）
  alt?: string;
  onClose: () => void;
}) {
  // images があればそれを、無ければ src を単一要素リストに。両方無し/空なら非表示。
  const list = images && images.length > 0 ? images : src ? [src] : [];
  const isOpen = list.length > 0;
  const count = list.length;

  const [current, setCurrent] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);
  const swipedRef = useRef(false); // スワイプ（閾値超え）したら背景タップ閉じを抑制

  // 開くたびに startIndex へ同期（前回位置が残らないように）。常に範囲内へ clamp。
  useEffect(() => {
    if (!isOpen) return;
    const clamped = Math.min(Math.max(startIndex, 0), count - 1);
    setCurrent(clamped);
  }, [startIndex, isOpen, count]);

  // スクロールロック ＋ キーボード（Esc 閉じ / ← → 前後移動・端で clamp）
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1));
      else if (e.key === 'ArrowRight') setCurrent((c) => Math.min(count - 1, c + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, count, onClose]);

  if (!isOpen) return null;

  const index = Math.min(Math.max(current, 0), count - 1);
  const hasMultiple = count > 1;
  const atStart = index === 0;
  const atEnd = index === count - 1;

  const goPrev = () => setCurrent((c) => Math.max(0, c - 1));
  const goNext = () => setCurrent((c) => Math.min(count - 1, c + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    swipedRef.current = false;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    const THRESHOLD = 45;
    if (Math.abs(deltaX) < THRESHOLD) return; // タップ扱い
    swipedRef.current = true; // スワイプ確定：このあとの click（背景閉じ）を抑制
    if (deltaX > 0) goPrev();
    else goNext();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4"
      onClick={() => {
        // スワイプ直後の合成クリックでは閉じない
        if (swipedRef.current) {
          swipedRef.current = false;
          return;
        }
        onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* ✕ ボタン */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="閉じる"
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        ✕
      </button>

      {/* 左右の矢印ナビ（複数枚のときのみ）。端では disabled で止める（ループしない）。 */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            disabled={atStart}
            aria-label="前の画像"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white text-2xl hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-25 disabled:pointer-events-none"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            disabled={atEnd}
            aria-label="次の画像"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white text-2xl hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-25 disabled:pointer-events-none"
          >
            ›
          </button>
        </>
      )}

      {/* 元画像全体（縦横比保持・ビューポート内に収める）。画像上のタップ／スワイプは背景閉じへ伝播させない。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={list[index]}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
        draggable={false}
      />

      {/* 位置インジケーター（複数枚のときのみ） */}
      {hasMultiple && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium tabular-nums">
          {index + 1} / {count}
        </div>
      )}
    </div>
  );
}
