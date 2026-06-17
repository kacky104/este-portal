'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { checkDutyStatus } from '@/lib/dutyStatus';

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
  id:             string;
  name:           string;
  imageUrl:       string | null;
  workHours:      string;
  onDuty:         boolean;
  isAvailableNow: boolean;
  availableUntil: string | null;
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
  const dutyStatus = !therapist.onDuty
    ? 'off'
    : !therapist.workHours
      ? 'onDuty'
      : checkDutyStatus(therapist.workHours).status;

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
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

      {/* 今すぐバッジ — top left */}
      {therapist.isAvailableNow && therapist.availableUntil && new Date(therapist.availableUntil) > new Date() && (
        <span className="absolute top-1.5 left-1.5" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
          今すぐ
        </span>
      )}

      {/* duty status badge — top right */}
      {dutyStatus === 'off' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-slate-400 border border-slate-200">
          お休み
        </span>
      )}
      {dutyStatus === 'onDuty' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white text-emerald-500 border border-emerald-100 animate-pulse">
          出勤中
        </span>
      )}
      {dutyStatus === 'before' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-blue-500 border border-blue-100">
          出勤予定
        </span>
      )}
      {dutyStatus === 'after' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-slate-400 border border-slate-200">
          受付終了
        </span>
      )}

      {/* text overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
        <p className="font-bold text-[11px] leading-tight drop-shadow line-clamp-1">{therapist.name}</p>
        {therapist.workHours && (dutyStatus === 'onDuty' || dutyStatus === 'before') && (
          <p className="text-[13px] text-pink-200 font-medium mt-0.5 text-center">{therapist.workHours}</p>
        )}
      </div>
    </Link>
  );
}

// ── Therapist mini cards row (hover auto-scroll / touch swipe) ──

function TherapistMiniCardsRow({ therapists, salonId }: { therapists: TherapistThumb[]; salonId: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef    = useRef<number | null>(null);

  const startScroll = () => {
    const step = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) return;
      el.scrollLeft += 1.2;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const stopScroll = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const displayed = therapists.slice(0, 10);

  return (
    <div
      ref={scrollRef}
      className="flex gap-[3px] overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      onMouseEnter={startScroll}
      onMouseLeave={stopScroll}
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
  const onDutyCount = therapists.filter(t => t.onDuty).length;

  return (
    <div
      className="group rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300 flex flex-col cursor-pointer overflow-hidden"
      onClick={() => router.push(`/salon/${salon.id}`)}
    >
      {/* Pink shimmer top line */}
      <div className="h-px bg-gradient-to-r from-transparent via-pink-400/60 to-transparent" />

      <div className="p-5 flex flex-col flex-1">

        {/* 1. サロン名のみ */}
        <h3 className="font-bold text-lg text-slate-900 group-hover:text-pink-700 transition-colors leading-snug mb-3">
          {salon.name}
        </h3>

        {/* 2. 評価・エリア・タグなどの情報 */}
        <div className="mb-2">
          {/* Hours + 出勤中バッジ */}
          <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              <span className="text-slate-500">{salon.hours}</span>
            </div>
            <span className="inline-flex items-center gap-1" style={{ background: '#fef3c7', color: '#92400e', borderRadius: '20px', padding: '3px 10px', fontSize: '12px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#92400e', flexShrink: 0 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              出勤中 <span style={{ color: '#ec4899', fontSize: '15px', fontWeight: 700 }}>{onDutyCount}</span>名
            </span>
          </div>

          {/* Stars + count + area */}
          <div className="flex items-center gap-2 mb-2">
            <StarRating rating={salon.rating} />
            <span className="text-pink-600 font-bold text-sm">{salon.rating}</span>
            <span className="text-slate-400 text-xs">({salon.reviewCount}件)</span>
            <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
              {salon.area}
            </span>
          </div>


        </div>

        {/* 3. セラピスト写真の横スクロール */}
        {therapists.length > 0 && (
          <div className="mb-4">
            <TherapistMiniCardsRow therapists={therapists} salonId={salon.id} />
          </div>
        )}

        {/* Price + CTA */}
        <div className="flex items-center justify-between pt-3.5 border-t border-slate-200 mt-auto">
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

      const { data: therapistRowsWithAvail, error: tErr } = await supabase
        .from('therapists')
        .select('id, name, salon_id, profile_image_url, work_hours, is_available_now, available_until')
        .in('salon_id', salonIds);

      let therapistRows = therapistRowsWithAvail;
      if (tErr) {
        const { data: fb } = await supabase
          .from('therapists')
          .select('id, name, salon_id, profile_image_url, work_hours')
          .in('salon_id', salonIds);
        therapistRows = (fb ?? []).map(t => ({ ...t, is_available_now: false, available_until: null }));
      }

      if (!therapistRows || therapistRows.length === 0) return;

      const today        = getTodayJST();
      const therapistIds = therapistRows.map(t => t.id);

      const { data: schedRowsRaw } = await supabase
        .from('therapist_schedules')
        .select('therapist_id, start_time, end_time, is_active')
        .in('therapist_id', therapistIds)
        .eq('schedule_date', today);

      // is_active をクライアント側でフィルター（DB型の不一致を回避）
      const schedRows = (schedRowsRaw ?? []).filter(r => Boolean(r.is_active));

      const onDutySet = new Set(schedRows.map(r => String(r.therapist_id)));

      // スケジュールの実際の時間を "HH:MM〜HH:MM" 形式でマップ化
      const schedHoursMap: Record<string, string> = {};
      for (const row of schedRows ?? []) {
        const start = row.start_time ? String(row.start_time).slice(0, 5) : null;
        const end   = row.end_time   ? String(row.end_time).slice(0, 5)   : null;
        if (start && end) {
          schedHoursMap[String(row.therapist_id)] = `${start}〜${end}`;
        }
      }

      const bySalon: Record<number, TherapistThumb[]> = {};
      for (const t of therapistRows) {
        const sid = t.salon_id as number;
        const tid = String(t.id);
        if (!bySalon[sid]) bySalon[sid] = [];
        bySalon[sid].push({
          id:             tid,
          name:           (t.name as string) ?? '',
          imageUrl:       (t.profile_image_url as string | null) ?? null,
          workHours:      schedHoursMap[tid] ?? (t.work_hours as string) ?? '',
          onDuty:         onDutySet.has(tid),
          isAvailableNow: Boolean((t as { is_available_now?: unknown }).is_available_now),
          availableUntil: ((t as { available_until?: unknown }).available_until as string | null) ?? null,
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
