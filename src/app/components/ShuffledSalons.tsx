'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

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

type TherapistThumb = {
  id:       string;
  name:     string;
  imageUrl: string | null;
  onDuty:   boolean;
};

function getTodayJST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  return (
    <span className="flex items-center gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'text-pink-500' : 'text-slate-300'} style={{ fontSize: '14px', lineHeight: 1 }}>
          ★
        </span>
      ))}
    </span>
  );
}

// ── Therapist thumbnail row ───────────────────────────────────

function TherapistThumbs({ therapists }: { therapists: TherapistThumb[] }) {
  if (therapists.length === 0) return null;
  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-0.5"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      onClick={e => e.stopPropagation()}
    >
      {therapists.map(t => (
        <Link
          key={t.id}
          href={`/therapist/${t.id}`}
          className="relative flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden border border-slate-100 hover:border-pink-300 transition-colors"
        >
          {t.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-pink-200 to-rose-300 flex items-center justify-center text-white font-bold text-sm">
              {t.name.charAt(0)}
            </div>
          )}
          {t.onDuty && (
            <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-bold bg-emerald-500/90 text-white leading-tight py-px">
              出勤中
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// ── Salon card ────────────────────────────────────────────────

function SalonCard({ salon, therapists }: { salon: Salon; therapists: TherapistThumb[] }) {
  const router  = useRouter();
  const [imgIdx, setImgIdx] = useState(0);

  const images    = therapists.filter(t => t.imageUrl).map(t => t.imageUrl as string);
  const currentImg = images.length > 0 ? images[imgIdx] : null;

  const handleMouseEnter = () => {
    if (images.length > 1) setImgIdx(i => (i + 1) % images.length);
  };

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300 flex flex-col cursor-pointer"
      onClick={() => router.push(`/salon/${salon.id}`)}
      onMouseEnter={handleMouseEnter}
    >
      {/* Pink shimmer top line */}
      <div className="h-px bg-gradient-to-r from-transparent via-pink-400/60 to-transparent" />

      {/* Thumbnail */}
      <div className="h-36 bg-gradient-to-br from-pink-100 via-rose-50 to-pink-50 relative overflow-hidden flex items-center justify-center">
        {currentImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={imgIdx}
            src={currentImg}
            alt={salon.name}
            className="absolute inset-0 w-full h-full object-cover animate-img-fade"
          />
        ) : (
          <span className="absolute text-9xl text-pink-300/25 select-none pointer-events-none" aria-hidden="true">♨</span>
        )}
        <span className="absolute top-3 left-3 z-10 text-xs font-semibold px-2.5 py-1 rounded-full bg-white text-pink-600 border border-pink-200 shadow-sm">
          {salon.area}
        </span>
        <span className="absolute top-3 right-3 z-10 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-white text-pink-600 border border-pink-100 shadow-sm">
          <span style={{ fontSize: '12px' }}>★</span>
          {salon.rating}
        </span>
        {images.length > 1 && (
          <div className="absolute bottom-2 right-2 z-10 flex gap-1">
            {images.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        {/* Name */}
        <h3 className="font-bold text-[15px] text-slate-900 group-hover:text-pink-700 transition-colors mb-3 leading-snug">
          {salon.name}
        </h3>

        {/* Hours */}
        <div className="flex items-center gap-1.5 text-xs mb-3">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
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
        <div className="flex flex-wrap gap-1.5 mb-3">
          {salon.tags.map((tag) => (
            <span key={tag} className="text-xs px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
              {tag}
            </span>
          ))}
        </div>

        {/* Therapist thumbnails */}
        {therapists.length > 0 && (
          <div className="mb-4 pt-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 font-medium mb-1.5">在籍セラピスト</p>
            <TherapistThumbs therapists={therapists} />
          </div>
        )}

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
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────

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
        </div>
        <div className="flex gap-1.5 pt-2">
          {[1,2,3,4].map(i => <div key={i} className="w-11 h-11 bg-slate-200 rounded-lg flex-shrink-0" />)}
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-200 rounded-lg" />
          <div className="h-3 bg-slate-200 rounded-lg w-5/6" />
        </div>
      </div>
    </div>
  );
}

// ── ShuffledSalons ────────────────────────────────────────────

export function ShuffledSalons({ salons, areas }: { salons: Salon[]; areas: string[] }) {
  const [list,            setList]            = useState<Salon[]>([]);
  const [activeArea,      setActiveArea]      = useState('福岡全域');
  const [salonTherapists, setSalonTherapists] = useState<Record<number, TherapistThumb[]>>({});

  // shuffle on mount
  useEffect(() => {
    const arr = [...salons];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setList(arr);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // fetch therapist thumbnails (all therapists, with today's schedule)
  useEffect(() => {
    if (salons.length === 0) return;
    (async () => {
      const supabase  = createClient();
      const salonIds  = salons.map(s => s.id);

      const { data: therapistRows } = await supabase
        .from('therapists')
        .select('id, name, salon_id, profile_image_url')
        .in('salon_id', salonIds);

      if (!therapistRows || therapistRows.length === 0) return;

      const today        = getTodayJST();
      const therapistIds = therapistRows.map(t => t.id);

      const { data: schedRows } = await supabase
        .from('therapist_schedules')
        .select('therapist_id')
        .in('therapist_id', therapistIds)
        .eq('schedule_date', today)
        .eq('is_active', true);

      const onDutySet = new Set((schedRows ?? []).map(r => r.therapist_id));

      // group by salon, on-duty first
      const bySalon: Record<number, TherapistThumb[]> = {};
      for (const t of therapistRows) {
        const sid = t.salon_id as number;
        if (!bySalon[sid]) bySalon[sid] = [];
        bySalon[sid].push({
          id:       String(t.id),
          name:     (t.name as string) ?? '',
          imageUrl: (t.profile_image_url as string | null) ?? null,
          onDuty:   onDutySet.has(t.id),
        });
      }

      const result: Record<number, TherapistThumb[]> = {};
      for (const [sid, items] of Object.entries(bySalon)) {
        result[Number(sid)] = items.sort((a, b) => Number(b.onDuty) - Number(a.onDuty));
      }

      setSalonTherapists(result);
    })();
  }, [salons]); // eslint-disable-line react-hooks/exhaustive-deps

  const areaCount = (area: string) =>
    area === '福岡全域' ? salons.length : salons.filter(s => s.area === area).length;

  const filtered =
    activeArea === '福岡全域' ? list : list.filter(s => s.area === activeArea);

  /* ── Area filter tabs ── */
  const tabs = (
    <div className="mb-8">
      <div
        className="flex gap-2 overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      >
        {areas.map((area) => {
          const count  = areaCount(area);
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
              <span className={`text-[11px] rounded-full px-1.5 py-px font-bold ${active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 mt-2">
        {activeArea === '福岡全域'
          ? `全${filtered.length}件のサロンを表示しています`
          : `「${activeArea}」エリアの${filtered.length}件を表示しています`}
      </p>
    </div>
  );

  /* ── Loading ── */
  if (list.length === 0) {
    return (
      <>
        {tabs}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {salons.map(s => <SalonCardSkeleton key={s.id} />)}
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-40">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
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
        {filtered.map(salon => (
          <SalonCard
            key={salon.id}
            salon={salon}
            therapists={salonTherapists[salon.id] ?? []}
          />
        ))}
      </div>
    </>
  );
}
