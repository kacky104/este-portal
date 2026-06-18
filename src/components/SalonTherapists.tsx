'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST, getScheduleWindowStatus } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { NewBadge } from '@/components/NewBadge';

const GRADS = ['from-pink-300 to-rose-400', 'from-fuchsia-300 to-pink-400', 'from-rose-300 to-pink-500'];
const SYMS  = ['✿', '❀', '✾', '♡', '✦'];

// ── helpers ──────────────────────────────────────────────────

type ScheduleStatus = 'off' | 'onDuty' | 'before' | 'after';

type TodaySchedule = {
  is_active: boolean;
  start_time: string | null;
  end_time:   string | null;
};

type StatusResult = {
  status:   ScheduleStatus;
  label:    string;
  badgeCls: string;
};

function getScheduleStatus(s: TodaySchedule): StatusResult {
  const status = s.is_active ? getScheduleWindowStatus(s.start_time, s.end_time) : 'off';
  switch (status) {
    case 'onDuty': return { status, label: '出勤中',       badgeCls: 'bg-emerald-50 text-emerald-600 animate-pulse' };
    case 'before': return { status, label: '本日出勤予定', badgeCls: 'bg-slate-100 text-slate-500' };
    case 'after':  return { status, label: '受付終了',     badgeCls: 'bg-rose-50 text-rose-400' };
    default:       return { status: 'off', label: '本日はお休み', badgeCls: 'bg-slate-100 text-slate-400' };
  }
}

function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const prefix = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0)) ? '翌' : '';
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}

// ── types ─────────────────────────────────────────────────────

type Therapist = {
  id:              string;
  name:            string;
  workHours:       string;
  comment:         string;
  area:            string;
  profileImageUrl: string | null;
  today:           TodaySchedule;
  isAvailableNow:  boolean;
  availableUntil:  string | null;
  isNewFace:       boolean;
  newFaceSince:    string | null;
};

// ── shared schedule fetch ──────────────────────────────────────

async function fetchScheduleMap(rawIds: unknown[]): Promise<Record<string, TodaySchedule>> {
  if (rawIds.length === 0) return {};
  const supabase = createClient();
  const today = getBusinessDateJST();
  console.log('[fetchScheduleMap] today:', today, 'rawIds:', rawIds);

  const { data, error } = await supabase
    .from('therapist_schedules')
    .select('therapist_id, is_active, start_time, end_time')
    .in('therapist_id', rawIds)
    .eq('schedule_date', today);

  console.log('[fetchScheduleMap] rows returned:', data?.length ?? 0, 'error:', error);
  console.log('[fetchScheduleMap] raw data:', JSON.stringify(data));

  const map: Record<string, TodaySchedule> = {};
  (data ?? []).forEach(row => {
    const key = String(row.therapist_id);
    map[key] = {
      is_active:  Boolean(row.is_active),
      start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
      end_time:   row.end_time   ? String(row.end_time).slice(0, 5)   : null,
    };
    console.log('[fetchScheduleMap] mapped key:', key, '→', map[key]);
  });
  return map;
}

// ── GridCard ──────────────────────────────────────────────────

function GridCard({ therapist, index }: {
  therapist: Therapist;
  index:     number;
}) {
  const grad = GRADS[index % GRADS.length];
  const sym  = SYMS[index % SYMS.length];
  const [ss, setSS] = useState<StatusResult | null>(null);
  useEffect(() => { setSS(getScheduleStatus(therapist.today)); }, [therapist.today]);

  const displayHours = buildDisplayHours(therapist.today.start_time, therapist.today.end_time);

  return (
    <Link
      href={`/therapist/${therapist.id}`}
      className="text-left w-full rounded-2xl border border-pink-50 bg-white shadow-sm flex h-28 overflow-hidden hover:border-pink-200 hover:shadow-md transition-all duration-200"
    >
      <div className={`relative w-28 bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
        {therapist.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={therapist.profileImageUrl}
            alt={therapist.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-xl">
              {therapist.name.charAt(0)}
            </div>
            <span className="absolute bottom-1 right-2 text-white/40 text-sm">{sym}</span>
          </>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between min-w-0 text-xs">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <p className="font-bold text-slate-900 truncate">{therapist.name}</p>
            {isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && <NewBadge />}
            {therapist.isAvailableNow && therapist.availableUntil && new Date(therapist.availableUntil) > new Date() && (
              <span style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                今すぐ
              </span>
            )}
            {ss && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${ss.badgeCls}`}>
                {ss.label}
              </span>
            )}
          </div>
          {ss && ss.status !== 'off' && (
            <p className="text-[10px] text-pink-500 font-medium mb-1">
              🕒 {displayHours || therapist.workHours || '—'}
            </p>
          )}
          <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed break-all">
            {therapist.comment}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ── SalonTherapists (出勤中のみ) ───────────────────────────────

export function SalonTherapists({ salonId }: { salonId: number }) {
  const [list, setList] = useState<Therapist[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since')
        .eq('salon_id', salonId);

      console.log('[SalonTherapists] therapist rows:', rows?.map(r => ({ id: r.id, name: r.name })));

      const rawIds = (rows ?? []).map(t => t.id);
      const schedMap = await fetchScheduleMap(rawIds);

      console.log('[SalonTherapists] schedMap keys:', Object.keys(schedMap));

      const mapped: Therapist[] = (rows ?? []).map(t => {
        const key = String(t.id);
        const todaySchedule = schedMap[key] ?? { is_active: false, start_time: null, end_time: null };
        const status = getScheduleStatus(todaySchedule);
        console.log(`[SalonTherapists] ${t.name as string} key=${key} today=`, todaySchedule, '→ status:', status.status);
        return {
          id:              key,
          name:            (t.name as string) ?? '',
          workHours:       (t.work_hours as string) ?? '',
          area:            (t.area as string) ?? '',
          comment:         (t.comment as string) ?? '',
          profileImageUrl: (t.profile_image_url as string | null) ?? null,
          today:           todaySchedule,
          isAvailableNow:  Boolean(t.is_available_now),
          availableUntil:  (t.available_until as string | null) ?? null,
          isNewFace:       Boolean(t.is_new_face),
          newFaceSince:    (t.new_face_since as string | null) ?? null,
        };
      });

      // 表示順: 1.今すぐ → 2.出勤中・出勤予定(開始時間が早い順) → 3.受付終了 → 4.お休み
      const availableNowActive = (t: Therapist) =>
        t.isAvailableNow && t.availableUntil != null && new Date(t.availableUntil) > new Date();
      const rank = (t: Therapist): number => {
        if (availableNowActive(t)) return 0;
        const s = getScheduleStatus(t.today).status;
        if (s === 'onDuty' || s === 'before') return 1;
        if (s === 'after') return 2;
        return 3; // off（お休み）
      };
      const sorted = [...mapped].sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 1) {
          const sa = a.today.start_time ?? '99:99';
          const sb = b.today.start_time ?? '99:99';
          return sa.localeCompare(sb);
        }
        return 0;
      });
      // 個別サロンページでは最大4人まで表示（続きは「全て見る」から週間出勤予定へ）
      setList(sorted.slice(0, 4));
    })();
  }, [salonId]);

  if (list.length === 0) return (
    <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
      只今、案内可能なセラピストはおりません ✿
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {list.map((t, i) => (
        <GridCard key={t.id} therapist={t} index={i} />
      ))}
    </div>
  );
}

// ── SalonAllTherapists (全員表示) ──────────────────────────────

export function SalonAllTherapists({ salonId }: { salonId: number }) {
  const [list, setList] = useState<Therapist[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since')
        .eq('salon_id', salonId);

      const rawIds = (rows ?? []).map(t => t.id);
      const schedMap = await fetchScheduleMap(rawIds);

      const mapped: Therapist[] = (rows ?? []).map(t => ({
        id:              String(t.id),
        name:            (t.name as string) ?? '',
        workHours:       (t.work_hours as string) ?? '',
        area:            (t.area as string) ?? '',
        comment:         (t.comment as string) ?? '',
        profileImageUrl: (t.profile_image_url as string | null) ?? null,
        today:           schedMap[String(t.id)] ?? { is_active: false, start_time: null, end_time: null },
        isAvailableNow:  Boolean(t.is_available_now),
        availableUntil:  (t.available_until as string | null) ?? null,
        isNewFace:       Boolean(t.is_new_face),
        newFaceSince:    (t.new_face_since as string | null) ?? null,
      }));

      setList(mapped);
    })();
  }, [salonId]);

  if (list.length === 0) return (
    <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
      在籍セラピストの情報は準備中です ✿
    </div>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {list.map((t, i) => (
        <GridCard key={t.id} therapist={t} index={i} />
      ))}
    </div>
  );
}
