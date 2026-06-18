'use client';

import { useRef, useState } from 'react';

// センターモード（カバーフロー）スライダー。
// 中央の画像を約60%幅で大きく表示し、前後の画像を左右に約20%ずつ見切れた状態で表示。
// スワイプ／ドラッグ、左右の画像クリック、矢印ボタンで切り替え可能。
// 画像が1枚のみのときはスライダーUI無しで中央に表示する。
export function TherapistImageSlider({ images, name }: { images: string[]; name: string }) {
  const [idx, setIdx] = useState(0);
  const dragStartX = useRef<number | null>(null);

  if (images.length === 0) return null;

  // ── 1枚のみ：スライダー無しで中央表示 ───────────────
  if (images.length === 1) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[0]}
          alt={name}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  const go = (delta: number) =>
    setIdx((prev) => (prev + delta + images.length) % images.length);

  // ── スワイプ／ドラッグ ───────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); // 左へスワイプ＝次、右へ＝前
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => (dragStartX.current = null)}
    >
      {images.map((url, i) => {
        // 円環状の最短オフセット（端と端をつなげて自然に回す）
        let offset = i - idx;
        if (offset > images.length / 2) offset -= images.length;
        if (offset < -images.length / 2) offset += images.length;

        const isActive = offset === 0;
        // |offset|>=2 は画面外。中央=offset0、左右=±1 が見切れて並ぶ。
        const visible = Math.abs(offset) <= 1;

        return (
          <div
            key={i}
            onClick={() => !isActive && setIdx(i)}
            // 幅：PC・スマホ共通で中央70%・両隣各15%（15+70+15=100%）。p-pxで画像間のgapを約2pxに。
            className={`absolute top-0 left-1/2 h-full p-px transition-all duration-300 ease-out w-[70%] ${
              isActive ? 'z-20' : 'z-10 cursor-pointer'
            }`}
            style={{
              transform: `translateX(calc(-50% + ${offset * 100}%)) scale(${isActive ? 1 : 0.82})`,
              opacity: visible ? (isActive ? 1 : 0.65) : 0,
              pointerEvents: visible ? 'auto' : 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={isActive ? name : ''}
              draggable={false}
              className="w-full h-full object-contain"
              // 両隣はcontainで中央寄せされ端の見切れが空白になるため、
              // 中央側の端へ寄せて10%の見切れに画像が映るようにする。
              style={{ objectPosition: isActive ? 'center' : offset < 0 ? 'right' : 'left' }}
            />
          </div>
        );
      })}

      {/* 矢印ボタン */}
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="前の画像"
        className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="次の画像"
        className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* ドットインジケータ */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`${i + 1}枚目を表示`}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === idx ? 'bg-pink-500' : 'bg-white/70 border border-pink-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
