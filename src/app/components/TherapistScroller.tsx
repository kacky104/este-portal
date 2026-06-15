'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';

const GRADIENTS = ['from-pink-300 to-rose-400', 'from-fuchsia-300 to-pink-400', 'from-rose-300 to-pink-500', 'from-pink-400 to-fuchsia-400'];

// ── helpers ───────────────────────────────────────────────────

function getTodayJST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

function getNowJSTMinutes(): number {
  const s = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

type TodaySchedule = {
  is_active:  boolean;
  start_time: string | null;
  end_time:   string | null;
};

type StatusResult = {
  status:    'off' | 'onDuty' | 'before' | 'after';
  label:     string;
  cardBadge: string;
};

function getScheduleStatus(s: TodaySchedule): StatusResult {
  if (!s.is_active || !s.start_time || !s.end_time) {
    return { status: 'off', label: '本日はお休み', cardBadge: 'bg-slate-100/80 text-slate-500' };
  }
  const [sh, sm] = s.start_time.split(':').map(Number);
  const [eh, em] = s.end_time.split(':').map(Number);
  const startMin    = sh * 60 + (sm || 0);
  const endMin      = eh * 60 + (em || 0);
  const isOvernight = endMin < startMin;
  const now         = getNowJSTMinutes();

  if (isOvernight) {
    return (now >= startMin || now <= endMin)
      ? { status: 'onDuty', label: '● 出勤中',     cardBadge: 'bg-white text-emerald-500 border border-emerald-100 animate-pulse' }
      : { status: 'before', label: '本日出勤予定', cardBadge: 'bg-white/80 text-slate-500' };
  }
  if (now >= startMin && now <= endMin)
    return { status: 'onDuty', label: '● 出勤中',     cardBadge: 'bg-white text-emerald-500 border border-emerald-100 animate-pulse' };
  if (now < startMin)
    return { status: 'before', label: '本日出勤予定', cardBadge: 'bg-white/80 text-slate-500' };
  return   { status: 'after',  label: '受付終了',   cardBadge: 'bg-white/80 text-rose-400' };
}

function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const prefix = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0)) ? '翌' : '';
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}

// ── types ─────────────────────────────────────────────────────

type TherapistItem = {
  id:              string;
  name:            string;
  salonId:         number;
  salonName:       string;
  workHours:       string;
  comment:         string;
  area:            string;
  age:             string;
  profileImageUrl: string | null;
  today:           TodaySchedule;
};

// ── Card ──────────────────────────────────────────────────────

function Card({ therapist, index }: { therapist: TherapistItem; index: number }) {
  const grad = GRADIENTS[index % GRADIENTS.length];
  const [ss, setSS] = useState<StatusResult | null>(null);
  useEffect(() => { setSS(getScheduleStatus(therapist.today)); }, [therapist.today]);

  const displayHours = buildDisplayHours(therapist.today.start_time, therapist.today.end_time);

  return (
    <Link
      href={`/therapist/${therapist.id}`}
      className="relative flex-shrink-0 w-44 h-64 rounded-2xl overflow-hidden shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
    >
      {/* background: photo or gradient fallback */}
      {therapist.profileImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={therapist.profileImageUrl}
          alt={therapist.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad} flex items-center justify-center`}>
          <span className="text-white/30 font-bold text-6xl">{therapist.name.charAt(0)}</span>
        </div>
      )}

      {/* bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      {/* status badge — top right */}
      {ss && (
        <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${ss.cardBadge}`}>
          {ss.label}
        </span>
      )}

      {/* text overlay — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
        <p className="font-bold text-sm leading-tight mb-0.5 drop-shadow">{therapist.name}</p>
        {therapist.age && (
          <p className="text-[10px] text-white/80 mb-0.5">{therapist.age}歳</p>
        )}
        <p className="text-[10px] text-white/70 truncate mb-1">{therapist.salonName}</p>
        {(displayHours || therapist.workHours) && (
          <p className="text-[10px] text-pink-200 font-medium">🕒 {displayHours || therapist.workHours}</p>
        )}
      </div>
    </Link>
  );
}

// ── TherapistScroller ─────────────────────────────────────────

export function TherapistScroller() {
  const [list, setList] = useState<TherapistItem[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      const { data: therapistData } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment, salon_id, profile_image_url, age');

      const salonIds = [...new Set(
        (therapistData ?? []).map(t => t.salon_id as number).filter(Boolean)
      )];

      let salonMap: Record<number, string> = {};
      if (salonIds.length > 0) {
        const { data: salonData } = await supabase
          .from('salons')
          .select('id, name')
          .in('id', salonIds);
        salonMap = Object.fromEntries(
          (salonData ?? []).map(s => [s.id as number, (s.name as string) ?? ''])
        );
      }

      const rawIds = (therapistData ?? []).map(t => t.id);
      const today  = getTodayJST();

      let schedRows: Array<{ therapist_id: unknown; is_active: unknown; start_time: unknown; end_time: unknown }> = [];
      if (rawIds.length > 0) {
        const { data } = await supabase
          .from('therapist_schedules')
          .select('therapist_id, is_active, start_time, end_time')
          .in('therapist_id', rawIds)
          .eq('schedule_date', today);
        schedRows = data ?? [];
      }

      const schedMap: Record<number, TodaySchedule> = {};
      schedRows.forEach(row => {
        schedMap[row.therapist_id as number] = {
          is_active:  Boolean(row.is_active),
          start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
          end_time:   row.end_time   ? String(row.end_time).slice(0, 5)   : null,
        };
      });

      const mapped: TherapistItem[] = (therapistData ?? []).map(t => ({
        id:              String(t.id),
        name:            (t.name              as string) ?? '',
        salonId:         t.salon_id           as number,
        salonName:       salonMap[t.salon_id  as number] ?? '',
        workHours:       (t.work_hours        as string) ?? '',
        area:            (t.area              as string) ?? '',
        comment:         (t.comment           as string) ?? '',
        age:             (t.age               as string) ?? '',
        profileImageUrl: (t.profile_image_url as string | null) ?? null,
        today:           schedMap[t.id as number] ?? { is_active: false, start_time: null, end_time: null },
      }));

      setList(mapped.filter(t => getScheduleStatus(t.today).status === 'onDuty'));
    })();
  }, []);

  if (list.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/20 w-full mx-4">
        現在、出勤中のセラピストはおりません ✿
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
      {list.map((t, i) => <Card key={t.id} therapist={t} index={i} />)}
    </div>
  );
}
