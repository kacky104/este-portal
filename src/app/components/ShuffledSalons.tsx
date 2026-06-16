'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

export type Salon = {
  id:          number;
  name:        string;
  rating:      number;
  reviewCount: number;
  tags:        string[];
  price:       string;
  area:        string;
  hours:       string;
  description: string;
};

type TherapistThumb = {
  id:        string;
  name:      string;
  imageUrl:  string | null;
  workHours: string;
  onDuty:    boolean;
};

const GRADIENTS = [
  'from-pink-300 to-rose-400',
  'from-fuchsia-300 to-pink-400',
  'from-rose-300 to-pink-500',
  'from-pink-400 to-fuchsia-400',
];

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

// ── Therapist mini card (matches TherapistScroller Card design) ──

function TherapistMiniCard({ therapist, index }: { therapist: TherapistThumb; index: number }) {
  const grad = GRADIENTS[index % GRADIENTS.length];
  return (
    <Link
      href={`/therapist/${therapist.id}`}
      className="relative flex-shrink-0 w-[105px] h-[153px] rounded-2xl overflow-hidden shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
      onClick={e => e.stopPropagation()}
    >
      {/* background */}
      {therapist.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={therapist.imageUrl} alt={therapist.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad} flex items-center justify-center`}>
          <span className="text-white/30 font-bold text-3xl">{therapist.name.charAt(0)}</span>
        </div>
      )}

      {/* bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      {/* on-duty badge */}
      {therapist.onDuty && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white text-emerald-500 border border-emerald-100 animate-pulse">
          出勤中
        </span>
      )}

      {/* text overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
        <p className="font-bold text-[11px] leading-tight drop-shadow line-clamp-1">{therapist.name}</p>
        {therapist.workHours && (
          <p className="text-[13px] text-pink-200 font-medium mt-0.5 text-center">{therapist.workHours}</p>
        )}
      </div>
    </Link>
  );
}

// ── Therapist mini cards row (drag-to-scroll) ──

function TherapistMiniCardsRow({ therapists, salonId }: { therapists: TherapistThumb[]; salonId: number }) {
  const scrollRef     = useRef<HTMLDivElement>(null);
  const isDown        = useRef(false);
  const startX        = useRef(0);
  const scrollStartX  = useRef(0);
  const didDrag       = useRef(false);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    isDown.current      = true;
    didDrag.current     = false;
    startX.current      = e.pageX - el.getBoundingClientRect().left;
    scrollStartX.current = el.scrollLeft;
    el.style.cursor     = 'grabbing';
    el.style.userSelect = 'none';
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDown.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const x    = e.pageX - el.getBoundingClientRect().left;
    const walk = x - startX.current;
    if (Math.abs(walk) > 4) didDrag.current = true;
    el.scrollLeft = scrollStartX.current - walk;
  };

  const onMouseUp = () => {
    isDown.current = false;
    const el = scrollRef.current;
    if (el) { el.style.cursor = 'grab'; el.style.userSelect = ''; }
  };

  // キャプチャフェーズでドラッグ後のリンク遷移を阻止
  const onClickCapture = (e: React.MouseEvent) => {
    if (didDrag.current) {
      e.stopPropagation();
      e.preventDefault();
      didDrag.current = false;
    }
  };

  const displayed = therapists.slice(0, 10);

  return (
    <div
      ref={scrollRef}
      className="flex gap-[3px] overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', cursor: 'grab' } as React.CSSProperties}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClickCapture={onClickCapture}
      onClick={e => e.stopPropagation()}
    >
      {displayed.map((t, i) => (
        <TherapistMiniCard key={t.id} therapist={t} index={i} />
      ))}

      {/* View-all button */}
      <Link
        href={`/salon/${salonId}`}
        className="relative flex-shrink-0 w-[105px] h-[153px] rounded-2xl overflow-hidden border border-pink-200 bg-gradient-to-b from-pink-50 to-fuchsia-100 flex flex-col items-center justify-center gap-2 hover:from-pink-100 hover:to-fuchsia-200 transition-colors shadow-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center shadow-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-pink-500">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <p className="text-[11px] font-bold text-pink-600 text-center leading-snug">
          一覧を<br />見る
        </p>
      </Link>
    </div>
  );
}

// ── Salon card ────────────────────────────────────────────────

function SalonCard({ salon, therapists }: { salon: Salon; therapists: TherapistThumb[] }) {
  const router = useRouter();

  return (
    <div
      className="group rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300 flex flex-col cursor-pointer overflow-hidden"
      onClick={() => router.push(`/salon/${salon.id}`)}
    >
      {/* Pink shimmer top line */}
      <div className="h-px bg-gradient-to-r from-transparent via-pink-400/60 to-transparent" />

      <div className="p-5 flex flex-col flex-1">

        {/* Name + area */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-lg text-slate-900 group-hover:text-pink-700 transition-colors leading-snug">
            {salon.name}
          </h3>
          <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200 mt-0.5">
            {salon.area}
          </span>
        </div>

        {/* Hours */}
        <div className="flex items-center gap-1.5 text-xs mb-3">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
          <span className="text-slate-500">{salon.hours}</span>
        </div>

        {/* Stars + count */}
        <div className="flex items-center gap-2 mb-3">
          <StarRating rating={salon.rating} />
          <span className="text-pink-600 font-bold text-sm">{salon.rating}</span>
          <span className="text-slate-400 text-xs">({salon.reviewCount}件)</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {salon.tags.map(tag => (
            <span key={tag} className="text-xs px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
              {tag}
            </span>
          ))}
        </div>

        {/* Therapist mini cards */}
        {therapists.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-slate-400 font-medium mb-2">在籍セラピスト</p>
            <TherapistMiniCardsRow therapists={therapists} salonId={salon.id} />
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 flex-1 mb-4">
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
    <div className="rounded-2xl border border-slate-200 bg-white animate-pulse shadow-sm overflow-hidden">
      <div className="h-px bg-pink-100" />
      <div className="p-5 space-y-3.5">
        <div className="flex justify-between gap-2">
          <div className="h-4 bg-slate-200 rounded-lg w-2/3" />
          <div className="h-5 w-16 bg-slate-200 rounded-full flex-shrink-0" />
        </div>
        <div className="h-3 bg-slate-200 rounded-lg w-1/2" />
        <div className="h-3 bg-slate-200 rounded-lg w-1/3" />
        <div className="flex gap-1.5">
          <div className="h-5 w-16 bg-slate-200 rounded-full" />
          <div className="h-5 w-14 bg-slate-200 rounded-full" />
        </div>
        <div className="flex gap-[3px]">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-[105px] h-[153px] bg-slate-200 rounded-2xl flex-shrink-0" />
          ))}
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

  // fetch therapist data for all salons
  useEffect(() => {
    if (salons.length === 0) return;
    (async () => {
      const supabase = createClient();
      const salonIds = salons.map(s => s.id);

      const { data: therapistRows } = await supabase
        .from('therapists')
        .select('id, name, salon_id, profile_image_url, work_hours')
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

      const bySalon: Record<number, TherapistThumb[]> = {};
      for (const t of therapistRows) {
        const sid = t.salon_id as number;
        if (!bySalon[sid]) bySalon[sid] = [];
        bySalon[sid].push({
          id:        String(t.id),
          name:      (t.name       as string) ?? '',
          imageUrl:  (t.profile_image_url as string | null) ?? null,
          workHours: (t.work_hours as string) ?? '',
          onDuty:    onDutySet.has(t.id),
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
        {areas.map(area => {
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
