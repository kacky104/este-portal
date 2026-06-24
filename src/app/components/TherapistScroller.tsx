'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST, getScheduleWindowStatus } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { NewBadge } from '@/components/NewBadge';
import { FeatureBadges } from '@/components/FeatureBadges';
import { sanitizeBadges } from '@/lib/therapistBadges';

const GRADIENTS = ['from-pink-300 to-rose-400', 'from-fuchsia-300 to-pink-400', 'from-rose-300 to-pink-500', 'from-pink-400 to-fuchsia-400'];

// ── helpers ───────────────────────────────────────────────────

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

export function getScheduleStatus(s: TodaySchedule): StatusResult {
  const status = s.is_active ? getScheduleWindowStatus(s.start_time, s.end_time) : 'off';
  switch (status) {
    case 'onDuty': return { status, label: '● 出勤中',     cardBadge: 'bg-white text-emerald-500 border border-emerald-100 animate-pulse' };
    case 'before': return { status, label: '本日出勤予定', cardBadge: 'bg-white/80 text-slate-500' };
    case 'after':  return { status, label: '受付終了',     cardBadge: 'bg-white/80 text-rose-400' };
    default:       return { status: 'off', label: '本日はお休み', cardBadge: 'bg-slate-100/80 text-slate-500' };
  }
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

export type TherapistItem = {
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
  isAvailableNow:  boolean;
  availableUntil:  string | null;
  isNewFace:       boolean;
  newFaceSince:    string | null;
  featureBadges:   string[];
};

// ── Card ──────────────────────────────────────────────────────

export function Card({ therapist, index, showAge = false }: { therapist: TherapistItem; index: number; showAge?: boolean }) {
  const grad = GRADIENTS[index % GRADIENTS.length];
  const [ss, setSS] = useState<StatusResult | null>(null);
  useEffect(() => { setSS(getScheduleStatus(therapist.today)); }, [therapist.today]);

  const displayHours = buildDisplayHours(therapist.today.start_time, therapist.today.end_time);

  return (
    <Link
      href={`/therapist/${therapist.id}`}
      className="relative flex-shrink-0 w-[105px] h-[153px] sm:w-44 sm:h-64 rounded-2xl overflow-hidden shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
    >
      {/* background: photo or gradient fallback */}
      {therapist.profileImageUrl ? (
        <Image
          src={therapist.profileImageUrl}
          alt={therapist.name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 105px, 176px"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad} flex items-center justify-center`}>
          <span className="text-white/30 font-bold text-3xl sm:text-6xl">{therapist.name.charAt(0)}</span>
        </div>
      )}

      {/* bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />

      {/* 右上バッジ：今すぐの子は出勤中等を出さず、今すぐを点滅表示。それ以外は出勤状況バッジ。 */}
      {therapist.isAvailableNow && therapist.availableUntil && new Date(therapist.availableUntil) > new Date() ? (
        <span className="absolute top-1.5 right-1.5 animate-pulse" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
          今すぐ
        </span>
      ) : (
        ss && (
          <span className={`absolute top-1.5 right-1.5 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full ${ss.cardBadge}`}>
            {ss.label}
          </span>
        )
      )}

      {/* text overlay — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-3 text-white">
        {showAge && isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && (
          <div className="mb-0.5"><NewBadge /></div>
        )}
        <div className="flex items-center gap-1 mb-0.5 min-w-0">
          <p className="font-bold text-[11px] sm:text-sm leading-tight drop-shadow line-clamp-1 min-w-0">{therapist.name}</p>
          {showAge && therapist.age && (
            <span className="font-bold text-[11px] sm:text-sm leading-tight drop-shadow flex-shrink-0">（{therapist.age}）</span>
          )}
          {!showAge && isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && <NewBadge />}
        </div>
        <FeatureBadges badges={therapist.featureBadges} className="justify-center mt-0.5" />
        {(displayHours || therapist.workHours) && (
          <p className="text-[13px] text-pink-200 font-medium mt-0.5 text-center">{displayHours || therapist.workHours}</p>
        )}
        {therapist.salonName && (
          <p className="text-[9px] sm:text-[10px] text-white/70 truncate text-center mt-0.5">{therapist.salonName}</p>
        )}
      </div>
    </Link>
  );
}

// ── TherapistScroller ─────────────────────────────────────────

export function TherapistScroller({ showAge = false }: { showAge?: boolean } = {}) {
  const [list, setList] = useState<TherapistItem[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      const { data: therapistData } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment, salon_id, profile_image_url, age, is_available_now, available_until, is_new_face, new_face_since, feature_badges');

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
      const today  = getBusinessDateJST();

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
        isAvailableNow:  Boolean(t.is_available_now),
        availableUntil:  (t.available_until   as string | null) ?? null,
        isNewFace:       Boolean(t.is_new_face),
        newFaceSince:    (t.new_face_since     as string | null) ?? null,
        featureBadges:   sanitizeBadges(t.feature_badges),
      }));

      const isAvailableNowActive = (t: TherapistItem) =>
        t.isAvailableNow && t.availableUntil != null && new Date(t.availableUntil) > new Date();

      const onDuty = mapped.filter(t => getScheduleStatus(t.today).status === 'onDuty');
      // 「今すぐ」フラグのセラピストを先頭に表示
      onDuty.sort((a, b) => Number(isAvailableNowActive(b)) - Number(isAvailableNowActive(a)));
      setList(onDuty);
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
    <div className="flex gap-[3px] sm:gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
      {/* 出勤中セラピストは最大35枚まで表示 */}
      {list.slice(0, 35).map((t, i) => <Card key={t.id} therapist={t} index={i} showAge={showAge} />)}
      {/* 末尾：本日出勤中セラピスト一覧ページへの「一覧を見る」カード */}
      <Link
        href="/working"
        className="flex-shrink-0 w-[105px] h-[153px] sm:w-44 sm:h-64 rounded-2xl overflow-hidden shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center gap-2"
        style={{ background: 'linear-gradient(to bottom right, #ec4899, #f97316)' }}
      >
        <span className="flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-white/20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-7 sm:h-7">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
        <span className="text-white font-bold text-xs sm:text-sm">一覧を見る</span>
      </Link>
    </div>
  );
}
