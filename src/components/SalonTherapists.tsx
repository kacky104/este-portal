'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST, getScheduleWindowStatus } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { formatBodySizes } from '@/lib/bodyType';
import { NewBadge } from '@/components/NewBadge';
import type { SalonTheme } from '@/app/lib/themes';

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

// 入店日表示用（new_face_since → "2026年6月18日入店"）。JST基準でフォーマット。
function formatJoinDate(since: string | null): string {
  if (!since) return '';
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return '';
  const text = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
  return `${text}入店`;
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
  age:             string | null;
  workHours:       string;
  comment:         string;
  area:            string;
  profileImageUrl: string | null;
  today:           TodaySchedule;
  isAvailableNow:  boolean;
  availableUntil:  string | null;
  isNewFace:       boolean;
  newFaceSince:    string | null;
  bodyType:        string | null;
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

function GridCard({ therapist, index, showJoinDate = false }: {
  therapist:    Therapist;
  index:        number;
  showJoinDate?: boolean;   // 新人紹介セクションのみ true（入店日を表示）
}) {
  const grad = GRADS[index % GRADS.length];
  const sym  = SYMS[index % SYMS.length];
  const [ss, setSS] = useState<StatusResult | null>(null);
  useEffect(() => { setSS(getScheduleStatus(therapist.today)); }, [therapist.today]);

  const displayHours = buildDisplayHours(therapist.today.start_time, therapist.today.end_time);
  const bodySizes    = formatBodySizes(therapist.bodyType);

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
            {therapist.age && <span className="text-[11px] text-slate-500 flex-shrink-0">({therapist.age})</span>}
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
          {bodySizes && (
            <p className="mb-0.5 text-slate-500 md:whitespace-nowrap md:overflow-hidden md:text-ellipsis" style={{ fontSize: '12px' }}>
              {bodySizes}
            </p>
          )}
          {showJoinDate && isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && therapist.newFaceSince && (
            <p className="mb-0.5" style={{ fontSize: '12px', color: '#15803d' }}>
              {formatJoinDate(therapist.newFaceSince)}
            </p>
          )}
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
        .select('id, name, age, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since, body_type')
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
          bodyType:        (t.body_type as string | null) ?? null,
          age:             (t.age as string | null) ?? null,
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
      // 「本日出勤」ブロックは 今すぐ / 出勤中・出勤予定 / 受付終了 を表示。
      // 受付終了になっても非表示にせずカードを出し続ける。お休み(off)のみ除外。
      const visible = sorted.filter(t => availableNowActive(t) || getScheduleStatus(t.today).status !== 'off');
      // 個別サロンページでは最大4人まで表示（続きは「すべて見る」から週間出勤予定へ）
      setList(visible.slice(0, 4));
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

export function SalonAllTherapists({ salonId, limit }: { salonId: number; limit?: number }) {
  const [list, setList] = useState<Therapist[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('therapists')
        .select('id, name, age, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since, body_type')
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
        bodyType:        (t.body_type as string | null) ?? null,
        age:             (t.age as string | null) ?? null,
      }));

      setList(mapped);
    })();
  }, [salonId]);

  if (list.length === 0) return (
    <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
      在籍セラピストの情報は準備中です ✿
    </div>
  );
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {shown.map((t, i) => (
        <GridCard key={t.id} therapist={t} index={i} />
      ))}
    </div>
  );
}

// ── SalonNewFaceTherapists (新人紹介) ──────────────────────────

export function SalonNewFaceTherapists({
  salonId,
  theme,
  header = 'card',
  maxItems = 4,
}: {
  salonId: number;
  theme: SalonTheme;
  header?: 'card' | 'bar';   // 'card': テーマ背景ブロック+見出し / 'bar': 緑色のタイトルバー
  maxItems?: number | null;  // number: その人数まで表示し超過時「すべて見る」/ null: 全件表示・ボタンなし
}) {
  // null = 取得前、[] = 該当0人。どちらもセクションを描画しない。
  const [list, setList] = useState<Therapist[] | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('therapists')
        .select('id, name, age, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since, body_type')
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
        bodyType:        (t.body_type as string | null) ?? null,
        age:             (t.age as string | null) ?? null,
      }));

      // is_new_face かつ new_face_since から30日以内のみ。new_face_since が新しい順。
      const newFaces = mapped
        .filter(t => isNewFaceActive(t.isNewFace, t.newFaceSince))
        .sort((a, b) => {
          const ta = a.newFaceSince ? new Date(a.newFaceSince).getTime() : 0;
          const tb = b.newFaceSince ? new Date(b.newFaceSince).getTime() : 0;
          return tb - ta;
        });
      setList(newFaces);
    })();
  }, [salonId]);

  // 該当0人（または取得前）はセクション自体を非表示
  if (!list || list.length === 0) return null;

  const shown = maxItems != null ? list.slice(0, maxItems) : list;
  const showAllButton = maxItems != null && list.length > maxItems;

  const cards = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {shown.map((t, i) => (
        <GridCard key={t.id} therapist={t} index={i} showJoinDate />
      ))}
    </div>
  );

  const allButton = showAllButton && (
    <div className="mt-4 text-center">
      <Link
        href={`/salon/${salonId}/therapists`}
        className="inline-flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity"
        style={{
          background: 'linear-gradient(to right, #ec4899, #f97316)',
          color: '#ffffff',
          borderRadius: '9999px',
          padding: '10px 24px',
          fontWeight: 600,
        }}
      >
        すべて見る
      </Link>
    </div>
  );

  // 緑色タイトルバー版（週間出勤予定ページ用）
  if (header === 'bar') {
    return (
      <div className="mt-8">
        <div
          className="w-full rounded-xl mb-3"
          style={{ background: '#22c55e', color: 'white', padding: '12px 24px', fontWeight: 700 }}
        >
          🌸 新人紹介
        </div>
        {cards}
        {allButton}
      </div>
    );
  }

  // テーマ背景ブロック版（個別サロンページ用）
  return (
    <div className="mt-8 rounded-3xl p-5 border shadow-sm" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🌸</span>
        <h2 className="text-base font-bold" style={{ color: theme.heading }}>新人紹介</h2>
      </div>
      {cards}
      {allButton}
    </div>
  );
}
