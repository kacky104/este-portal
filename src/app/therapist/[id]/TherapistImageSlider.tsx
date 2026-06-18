'use client';

import { useState } from 'react';

// プロフィール画像スライダー。1枚のときはナビ無しで単純表示、複数枚で左右矢印＋ドット。
export function TherapistImageSlider({ images, name }: { images: string[]; name: string }) {
  const [idx, setIdx] = useState(0);

  if (images.length === 0) return null;

  const single = images.length === 1;
  const go = (delta: number) =>
    setIdx((prev) => (prev + delta + images.length) % images.length);

  return (
    <div className="relative w-full h-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[idx]}
        alt={name}
        className="w-full h-full object-contain object-top"
      />

      {!single && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="前の画像"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="次の画像"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          {/* ドットインジケータ */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
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
        </>
      )}
    </div>
  );
}
