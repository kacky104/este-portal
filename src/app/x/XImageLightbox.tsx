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
  const touchStartY = useRef<number | null>(null);
  const swipedRef = useRef(false); // スワイプ（閾値超え）したら背景タップ閉じを抑制
  const [dragY, setDragY] = useState(0); // 下スワイプ中の画像追従量（閾値未満で離すと0に戻る）

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

  // 横スワイプ＝前後の画像送り（複数枚）／下スワイプ＝閉じる、を縦横の主成分で振り分ける。
  const H_THRESHOLD = 45; // 横スワイプ（画像送り）確定の閾値
  const V_THRESHOLD = 80; // 下スワイプ（閉じる）確定の閾値（誤爆しにくいやや大きめ）

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
    swipedRef.current = false;
    setDragY(0);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = (e.touches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    const dy = (e.touches[0]?.clientY ?? touchStartY.current) - touchStartY.current;
    // 下方向かつ縦が横より大きいときだけ画像を指に追従させる（横＝画像送りには干渉しない）。
    setDragY(dy > 0 && Math.abs(dy) > Math.abs(dx) ? dy : 0);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    const deltaY = (e.changedTouches[0]?.clientY ?? touchStartY.current) - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // 横が主成分＝前後の画像送り（従来どおり）。
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > H_THRESHOLD) {
      swipedRef.current = true; // 背景タップ閉じの合成クリックを抑制
      setDragY(0);
      if (deltaX > 0) goPrev();
      else goNext();
      return;
    }
    // 下方向が主成分＝閉じる（上スワイプは割り当てない）。
    if (deltaY > V_THRESHOLD && deltaY > Math.abs(deltaX)) {
      swipedRef.current = true;
      onClose();
      return;
    }
    // どちらの閾値にも満たない＝タップ扱い：追従を元に戻す。
    setDragY(0);
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
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        // 下スワイプ中は画像が指に追従＋わずかにフェード。離して閾値未満なら transition で元位置へ戻る。
        style={
          dragY
            ? { transform: `translateY(${dragY}px)`, opacity: Math.max(0.4, 1 - dragY / 500) }
            : undefined
        }
        className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none ${
          dragY ? '' : 'transition-transform duration-200'
        }`}
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
