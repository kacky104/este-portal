'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/client';

const AUTOPLAY_INTERVAL = 3000;

type Slide = {
  /** PC用画像URL（必須）。 */
  url: string;
  /** SP用画像URL。未登録(null)なら PC 用にフォールバックする。 */
  urlSp: string;
};

export default function HeaderImageSlider() {
  const supabase = createClient();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const fetchSlides = async () => {
      const { data } = await supabase
        .from('header_slider_images')
        .select('image_url, image_url_sp')
        .order('display_order', { ascending: true });

      if (data) {
        setSlides(
          data.map((row) => ({
            url: row.image_url,
            // SP用が未登録なら PC 用画像をSPでも表示（フォールバック）。
            urlSp: row.image_url_sp ?? row.image_url,
          })),
        );
      }
    };
    fetchSlides();
  }, []);

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
    <div className="relative w-full aspect-[4/3] sm:aspect-auto sm:h-96 overflow-hidden rounded-lg">
      {slides.map((slide, index) => (
        <div
          key={slide.url}
          className={`absolute inset-0 transition-opacity duration-700 ${
            index === current ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* PC用（sm 以上）。コンテナは固定高さ sm:h-96 + object-cover（上下トリミングあり）。 */}
          <Image
            src={slide.url}
            alt={`スライド ${index + 1}`}
            fill
            className="hidden sm:block object-cover"
            priority={index === 0}
          />
          {/* SP用（sm 未満）。SP用URLが無ければ PC 用にフォールバック。 */}
          <Image
            src={slide.urlSp}
            alt={`スライド ${index + 1}`}
            fill
            className="sm:hidden object-cover"
            priority={index === 0}
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