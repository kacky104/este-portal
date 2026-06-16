'use client';

import { useState, useEffect, useRef } from 'react';

type Props = {
  images: string[];
};

export default function SalonHeaderSlider({ images }: Props) {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(() => setCurrent(c => (c + 1) % count), 4000);
    return () => clearInterval(id);
  }, [count, paused]);

  const prev = () => setCurrent(c => (c - 1 + count) % count);
  const next = () => setCurrent(c => (c + 1) % count);

  // 0枚: グラデーションプレースホルダー
  if (count === 0) {
    return (
      <div className="h-56 sm:h-72 bg-gradient-to-br from-pink-100 via-rose-50 to-pink-50 flex items-center justify-center">
        <span className="text-[120px] text-pink-200/40 select-none" aria-hidden>♨</span>
      </div>
    );
  }

  // 1枚: スライダーなし
  if (count === 1) {
    return (
      <div className="h-56 sm:h-72 relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0]} alt="" className="absolute inset-0 w-full h-full object-cover" />
      </div>
    );
  }

  // 2〜3枚: フルスライダー
  return (
    <div
      className="h-56 sm:h-72 relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta < -50) next();
        else if (delta > 50) prev();
        touchStartX.current = null;
      }}
    >
      {/* スライドトラック */}
      <div
        className="flex h-full transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {images.map((url, i) => (
          <div key={i} className="w-full flex-shrink-0 relative h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        ))}
      </div>

      {/* 左矢印 */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-colors backdrop-blur-sm"
        aria-label="前へ"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* 右矢印 */}
      <button
        onClick={next}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-colors backdrop-blur-sm"
        aria-label="次へ"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* ドットインジケーター */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`rounded-full transition-all duration-300 ${
              i === current ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/50'
            }`}
            aria-label={`${i + 1}枚目`}
          />
        ))}
      </div>
    </div>
  );
}
