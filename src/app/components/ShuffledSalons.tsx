'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export type Salon = {
  id: number;
  name: string;
  rating: number;
  reviewCount: number;
  tags: string[];
  price: string;
  area: string;
  hours: string;
  description: string;
};

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  return (
    <span className="flex items-center gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={i < full ? 'text-pink-500' : 'text-slate-300'}
          style={{ fontSize: '14px', lineHeight: 1 }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function SalonCard({ salon }: { salon: Salon }) {
  return (
    <Link
      href={`/salon/${salon.id}`}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300 flex flex-col"
    >
      {/* Pink shimmer top line */}
      <div className="h-px bg-gradient-to-r from-transparent via-pink-400/60 to-transparent" />

      {/* Thumbnail */}
      <div className="h-36 bg-gradient-to-br from-pink-100 via-rose-50 to-pink-50 relative overflow-hidden flex items-center justify-center">
        <span
          className="absolute text-9xl text-pink-300/25 select-none pointer-events-none"
          aria-hidden="true"
        >
          ♨
        </span>
        {/* Area badge – top left */}
        <span className="absolute top-3 left-3 z-10 text-xs font-semibold px-2.5 py-1 rounded-full bg-white text-pink-600 border border-pink-200 shadow-sm">
          {salon.area}
        </span>
        {/* Rating badge – top right */}
        <span className="absolute top-3 right-3 z-10 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-white text-pink-600 border border-pink-100 shadow-sm">
          <span style={{ fontSize: '12px' }}>★</span>
          {salon.rating}
        </span>
      </div>

      <div className="p-5 flex flex-col flex-1">
        {/* Name */}
        <h3 className="font-bold text-[15px] text-slate-900 group-hover:text-pink-700 transition-colors mb-3 leading-snug">
          {salon.name}
        </h3>

        {/* Hours */}
        <div className="flex items-center gap-1.5 text-xs mb-3">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-slate-400 flex-shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span className="text-slate-500">{salon.hours}</span>
        </div>

        {/* Stars + count */}
        <div className="flex items-center gap-2 mb-4">
          <StarRating rating={salon.rating} />
          <span className="text-pink-600 font-bold text-sm">{salon.rating}</span>
          <span className="text-slate-400 text-xs">({salon.reviewCount}件)</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {salon.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Description */}
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 flex-1 mb-4">
          {salon.description}
        </p>

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-3.5 border-t border-slate-200">
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">料金目安</p>
            <p className="text-pink-600 font-bold text-sm">{salon.price}</p>
          </div>
          <span className="px-4 py-2 rounded-xl bg-pink-600 text-white font-bold text-xs group-hover:bg-pink-500 transition-colors shadow-sm shadow-pink-500/20">
            詳しく見る →
          </span>
        </div>
      </div>
    </Link>
  );
}

function SalonCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white animate-pulse shadow-sm">
      <div className="h-36 bg-pink-50 rounded-t-2xl" />
      <div className="p-5 space-y-3.5">
        <div className="h-4 bg-slate-200 rounded-lg w-3/4" />
        <div className="h-3 bg-slate-200 rounded-lg w-1/2" />
        <div className="h-3 bg-slate-200 rounded-lg w-2/3" />
        <div className="flex gap-1.5">
          <div className="h-5 w-16 bg-slate-200 rounded-full" />
          <div className="h-5 w-14 bg-slate-200 rounded-full" />
          <div className="h-5 w-12 bg-slate-200 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-200 rounded-lg" />
          <div className="h-3 bg-slate-200 rounded-lg w-5/6" />
          <div className="h-3 bg-slate-200 rounded-lg w-4/6" />
        </div>
      </div>
    </div>
  );
}

export function ShuffledSalons({
  salons,
  areas,
}: {
  salons: Salon[];
  areas: string[];
}) {
  const [list, setList] = useState<Salon[]>([]);
  const [activeArea, setActiveArea] = useState('福岡全域');

  useEffect(() => {
    const arr = [...salons];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setList(arr);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const areaCount = (area: string) =>
    area === '福岡全域'
      ? salons.length
      : salons.filter((s) => s.area === area).length;

  const filtered =
    activeArea === '福岡全域'
      ? list
      : list.filter((s) => s.area === activeArea);

  /* ── Area filter tabs ── */
  const tabs = (
    <div className="mb-8">
      <div
        className="flex gap-2 overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      >
        {areas.map((area) => {
          const count = areaCount(area);
          const active = activeArea === area;
          return (
            <button
              key={area}
              onClick={() => setActiveArea(area)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                active
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-500/25'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:text-pink-600 shadow-sm'
              }`}
            >
              {area}
              <span
                className={`text-[11px] rounded-full px-1.5 py-px font-bold ${
                  active
                    ? 'bg-white/25 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {/* Result count */}
      <p className="text-xs text-slate-400 mt-2">
        {activeArea === '福岡全域'
          ? `全${filtered.length}件のサロンを表示しています`
          : `「${activeArea}」エリアの${filtered.length}件を表示しています`}
      </p>
    </div>
  );

  /* ── Loading (before shuffle) ── */
  if (list.length === 0) {
    return (
      <>
        {tabs}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {salons.map((s) => (
            <SalonCardSkeleton key={s.id} />
          ))}
        </div>
      </>
    );
  }

  /* ── Empty state ── */
  if (filtered.length === 0) {
    return (
      <>
        {tabs}
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mb-4 opacity-40"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <p className="text-sm">このエリアの掲載サロンはまだありません</p>
        </div>
      </>
    );
  }

  /* ── Salon grid ── */
  return (
    <>
      {tabs}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((salon) => (
          <SalonCard key={salon.id} salon={salon} />
        ))}
      </div>
    </>
  );
}
