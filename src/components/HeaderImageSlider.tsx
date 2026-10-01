'use client';

import { useState, useEffect, useCallback } from 'react';
import { ResponsivePicture } from '@/app/components/ResponsivePicture';
import type { HeaderSlide } from '@/app/lib/headerSlider';

const AUTOPLAY_INTERVAL = 3000;

// ★ 第1076便（2026-10-01）: 画像の一覧はサーバー（page.tsx → fetchHeaderSlides）から props で受ける。
//   ★ ブラウザで Supabase を読まない＝初期 HTML に hero が入り、画像要求が約1秒早くなる（LCP）。
//   ★ PC/SP の2枚出し（<Image> 2つ＋hidden）もやめ、ResponsivePicture（<picture>）で1枚だけ取る（第1054便の禁則）。
export default function HeaderImageSlider({ slides }: { slides: HeaderSlide[] }) {
  const [current, setCurrent] = useState(0);

  const goTo = useCallback((index: number) => {
    setCurrent((index + slides.length) % slides.length);
  }, [slides.length]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(next, AUTOPLAY_INTERVAL);
    return () => clearInterval(timer);
  }, [next, slides.length]);

  if (slides.length === 0) return null;

  return (
    <div className="relative w-full aspect-[4/3] sm:aspect-[1600/620] sm:max-h-[600px] overflow-hidden">
      {slides.map((slide, index) => (
        <div
          key={slide.url}
          className={`absolute inset-0 transition-opacity duration-700 ${
            index === current ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* ★ 第1076便: PC用（sm 以上・約2.6:1）／SP用（4:3）を <picture> で出し分け。1枚目だけ priority（fetchpriority=high）。
              hero は object-cover で枠いっぱいに敷くので fill。sizes は 100vw（表示される側しか取らないので 1px の小細工は不要）。 */}
          <ResponsivePicture
            fill
            spMax={639.98}
            sp={{ src: slide.urlSp, width: 1200, height: 900 }}
            pc={{ src: slide.url, width: 1600, height: 620 }}
            alt={`福岡メンズエステ フクエス メインビジュアル ${index + 1}`}
            sizes="100vw"
            priority={index === 0}
            className="object-cover"
          />
        </div>
      ))}

      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="前の画像"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-9 h-9 flex items-center justify-center"
          >
            ‹
          </button>
          <button
            onClick={next}
            aria-label="次の画像"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-9 h-9 flex items-center justify-center"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goTo(index)}
                aria-label={`スライド ${index + 1} を表示`}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  index === current ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}