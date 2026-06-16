'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';

export type FeaturedSalon = {
  salonId:          number;
  salonName:        string;
  area:             string;
  price:            string;
  rating:           number;
  therapistImages:  string[];
  imageUrl?:        string;
};

const GRADS = [
  'from-pink-400 via-rose-500 to-fuchsia-600',
  'from-fuchsia-400 via-pink-500 to-rose-500',
  'from-rose-400 via-pink-400 to-fuchsia-500',
  'from-pink-500 via-fuchsia-400 to-rose-400',
  'from-fuchsia-500 via-rose-500 to-pink-400',
];

const AUTO_PLAY_MS = 4500;

export function FeaturedSalonSlider({ salons }: { salons: FeaturedSalon[] }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused]   = useState(false);
  const touchStartX = useRef<number>(0);

  const prev = useCallback(() => setCurrent(c => (c - 1 + salons.length) % salons.length), [salons.length]);
  const next = useCallback(() => setCurrent(c => (c + 1) % salons.length),                [salons.length]);

  // Auto-play
  useEffect(() => {
    if (paused || salons.length <= 1) return;
    const id = setInterval(() => setCurrent(c => (c + 1) % salons.length), AUTO_PLAY_MS);
    return () => clearInterval(id);
  }, [paused, salons.length]);

  if (salons.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Slide track ─────────────────────────────────────── */}
      <div className="rounded-3xl overflow-hidden shadow-lg">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(delta) > 50) { delta < 0 ? next() : prev(); }
          }}
        >
          {salons.map((salon, i) => {
            const filledStars = Math.floor(salon.rating);
            const bgImage     = salon.imageUrl ?? salon.therapistImages[0];
            const grad        = GRADS[i % GRADS.length];

            return (
              <div key={salon.salonId} className="w-full flex-shrink-0 relative h-72 sm:h-96">
                {/* Background */}
                {bgImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bgImage} alt={salon.salonName} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${grad}`} />
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

                {/* PICKUP badge */}
                <span className="absolute top-4 left-4 text-[11px] font-black text-white bg-pink-500 px-3 py-1 rounded-full shadow-lg tracking-wide">
                  ✦ PICKUP
                </span>

                {/* Area badge */}
                <span className="absolute top-4 right-4 text-[11px] font-semibold text-white bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full border border-white/30">
                  📍 {salon.area}
                </span>

                {/* Bottom content */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                  <p className="font-black text-lg sm:text-xl text-white drop-shadow mb-1.5 line-clamp-1">
                    {salon.salonName}
                  </p>

                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <span key={j} className={`text-sm leading-none ${j < filledStars ? 'text-yellow-400' : 'text-white/30'}`}>★</span>
                      ))}
                    </div>
                    <span className="text-white/80 text-xs font-semibold">{salon.rating.toFixed(1)}</span>
                    {salon.price && (
                      <>
                        <span className="text-white/30 text-xs">|</span>
                        <span className="text-white/90 text-xs font-bold">{salon.price}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Therapist thumbnails */}
                    <div className="flex -space-x-2">
                      {salon.therapistImages.slice(0, 4).map((img, j) => (
                        <div key={j} className="w-8 h-8 rounded-full border-2 border-white/80 overflow-hidden shadow-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {salon.therapistImages.length === 0 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white/40 bg-white/10 flex items-center justify-center">
                          <span className="text-white/50 text-xs">♡</span>
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/salon/${salon.salonId}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-pink-600 text-xs font-black hover:bg-pink-50 transition-colors shadow-md"
                      onClick={e => e.stopPropagation()}
                    >
                      詳細を見る
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Arrow buttons ──────────────────────────────────── */}
      {salons.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-[calc(50%-16px)] -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors border border-white/20 shadow"
            aria-label="前へ"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-[calc(50%-16px)] -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/50 transition-colors border border-white/20 shadow"
            aria-label="次へ"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}

      {/* ── Dot indicators ─────────────────────────────────── */}
      {salons.length > 1 && (
        <div className="flex justify-center items-center gap-2 mt-3">
          {salons.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`transition-all duration-300 rounded-full ${
                i === current
                  ? 'w-6 h-2 bg-pink-500'
                  : 'w-2 h-2 bg-slate-300 hover:bg-pink-300'
              }`}
              aria-label={`スライド${i + 1}へ`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
