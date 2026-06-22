'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST, getScheduleWindowStatus } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { formatBodySizes } from '@/lib/bodyType';
import { NewBadge } from '@/components/NewBadge';
import { SaveButton } from '@/app/components/SaveButton';
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

export type Therapist = {
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
  hasDiary:        boolean;
  salonId?:        number;   // 保存ボタン用（/saved のセラピストカードで使用）
};

// セラピストカードの取得列（全コンポーネントで共有）。
const THERAPIST_SELECT =
  'id, name, age, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since, body_type, salon_id';

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

// ── 写メ日記の有無を1クエリでまとめて取得 ──────────────────────
// 対象セラピストのうち diary_posts を1件以上持つ therapist_id を Set で返す（N+1回避）。
async function fetchDiarySet(rawIds: unknown[]): Promise<Set<string>> {
  if (rawIds.length === 0) return new Set();
  const supabase = createClient();
  const { data } = await supabase
    .from('diary_posts')
    .select('therapist_id')
    .in('therapist_id', rawIds);
  return new Set((data ?? []).map(r => String(r.therapist_id)));
}

// ── 行→Therapist 変換（取得ロジックを共有して二重実装しない） ──
function buildTherapist(
  t: Record<string, unknown>,
  schedMap: Record<string, TodaySchedule>,
  diarySet: Set<string>
): Therapist {
  const key = String(t.id);
  return {
    id:              key,
    name:            (t.name as string) ?? '',
    workHours:       (t.work_hours as string) ?? '',
    area:            (t.area as string) ?? '',
    comment:         (t.comment as string) ?? '',
    profileImageUrl: (t.profile_image_url as string | null) ?? null,
    today:           schedMap[key] ?? { is_active: false, start_time: null, end_time: null },
    isAvailableNow:  Boolean(t.is_available_now),
    availableUntil:  (t.available_until as string | null) ?? null,
    isNewFace:       Boolean(t.is_new_face),
    newFaceSince:    (t.new_face_since as string | null) ?? null,
    bodyType:        (t.body_type as string | null) ?? null,
    age:             (t.age as string | null) ?? null,
    hasDiary:        diarySet.has(key),
    salonId:         (t.salon_id as number | null) ?? undefined,
  };
}

// 指定 ID 群のセラピストを取得（/saved のセラピストセクション用）。
// 既存の取得ロジック（THERAPIST_SELECT・fetchScheduleMap・fetchDiarySet・buildTherapist）を流用。
export async function fetchTherapistsByIds(ids: number[]): Promise<Therapist[]> {
  if (ids.length === 0) return [];
  const supabase = createClient();
  const { data: rows } = await supabase
    .from('therapists')
    .select(THERAPIST_SELECT)
    .in('id', ids);

  const rawIds = (rows ?? []).map(t => t.id);
  const [schedMap, diarySet] = await Promise.all([
    fetchScheduleMap(rawIds),
    fetchDiarySet(rawIds),
  ]);
  return (rows ?? []).map(t => buildTherapist(t as Record<string, unknown>, schedMap, diarySet));
}

// ── GridCard ──────────────────────────────────────────────────

export function GridCard({ therapist, index, showJoinDate = false, from, enableWorkingShimmer = false, showSaveButton = false, saveButtonPos = 'photo-left' }: {
  therapist:    Therapist;
  index:        number;
  showJoinDate?: boolean;   // 新人紹介セクションのみ true（入店日を表示）
  from?:        string;     // パンくず用 ?from= パラメータ
  enableWorkingShimmer?: boolean;   // 出勤中カードの外枠を緑キラリ（schedule / imasugu下段のみ true）
  showSaveButton?: boolean;  // 保存ボタンを表示（/saved・在籍一覧）
  saveButtonPos?: 'photo-left' | 'card-right';  // 'photo-left'=/saved（写真左上）/ 'card-right'=在籍一覧（カード右上）
}) {
  const grad = GRADS[index % GRADS.length];
  const sym  = SYMS[index % SYMS.length];
  const router = useRouter();
  const [ss, setSS] = useState<StatusResult | null>(null);
  useEffect(() => { setSS(getScheduleStatus(therapist.today)); }, [therapist.today]);

  const displayHours = buildDisplayHours(therapist.today.start_time, therapist.today.end_time);
  const bodySizes    = formatBodySizes(therapist.bodyType);
  // 出勤中バッジと同一条件（status==='onDuty'）。enableWorkingShimmer の時だけ外枠を緑キラリ。
  const working = enableWorkingShimmer && ss?.status === 'onDuty';

  const card = (
    <Link
      href={from ? `/therapist/${therapist.id}?from=${from}` : `/therapist/${therapist.id}`}
      className={`text-left w-full rounded-2xl border border-pink-50 bg-white shadow-sm flex h-28 overflow-hidden hover:border-pink-200 hover:shadow-md transition-all duration-200${working ? ' therapist-working-shimmer' : ''}`}
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
        {/* 今すぐバッジ（写真右上オーバーレイ）。表示条件は従来どおり今すぐフラグの子のみ。 */}
        {therapist.isAvailableNow && therapist.availableUntil && new Date(therapist.availableUntil) > new Date() && (
          <span className="absolute top-1.5 right-1.5 z-10" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
            今すぐ
          </span>
        )}
        {/* NEWバッジ（写真左下オーバーレイ）。表示条件は従来どおり新規30日以内の子のみ。 */}
        {isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && (
          <NewBadge className="absolute bottom-1.5 left-1.5 z-10" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between min-w-0 text-xs">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <p className="font-bold text-slate-900 truncate">{therapist.name}</p>
            {therapist.age && <span className="text-[11px] text-slate-500 flex-shrink-0">({therapist.age})</span>}
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
          {/* 写メ日記バッジ（日記が1件以上ある子のみ）。カード全体は /therapist/[id] へのリンクのため、
              ここは preventDefault + stopPropagation で日記一覧ページへ遷移させる。 */}
          {therapist.hasDiary && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/therapist/${therapist.id}/diary`); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); router.push(`/therapist/${therapist.id}/diary`); } }}
              className="inline-flex items-center gap-1 mb-1 rounded-md border border-pink-500 text-pink-600 font-bold hover:bg-pink-50 transition-colors cursor-pointer"
              style={{ fontSize: '11px', padding: '3px 9px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              写メ日記
            </span>
          )}
          <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed break-all">
            {therapist.comment}
          </p>
        </div>
      </div>
    </Link>
  );

  if (!showSaveButton) return card;

  // 保存ボタンは Link の外側に重ねる（anchor 内の button ネストとスパークのクリップを避ける）。
  // photo-left=/saved（写真左上・出勤バッジと干渉しない） / card-right=在籍一覧（カード右上）。
  const posClass = saveButtonPos === 'card-right' ? 'top-2 right-2' : 'top-1.5 left-1.5';
  return (
    <div className="relative">
      {card}
      <div className={`absolute ${posClass} z-20`}>
        <SaveButton
          kind="therapist"
          item={{ id: Number(therapist.id), name: therapist.name, salonId: therapist.salonId ?? 0 }}
          size={30}
          variant="sakura"
        />
      </div>
    </div>
  );
}

// ── MiniCard（トップページの個別サロンカード内セラピストカードと同レイアウト） ──
// 横スクロール用の縦長カード（写真背景＋名前/年齢/出勤時間オーバーレイ＋各バッジ）。

function MiniCard({ therapist, index }: { therapist: Therapist; index: number }) {
  const grad = GRADS[index % GRADS.length];
  const [ss, setSS] = useState<StatusResult | null>(null);
  useEffect(() => { setSS(getScheduleStatus(therapist.today)); }, [therapist.today]);

  const displayHours = buildDisplayHours(therapist.today.start_time, therapist.today.end_time);
  const availableNow =
    therapist.isAvailableNow && therapist.availableUntil != null && new Date(therapist.availableUntil) > new Date();

  return (
    <Link
      href={`/therapist/${therapist.id}`}
      className="relative flex-shrink-0 w-[105px] h-[153px] md:w-[150px] md:h-56 rounded-2xl overflow-hidden shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
    >
      {/* background */}
      {therapist.profileImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={therapist.profileImageUrl} alt={therapist.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad} flex items-center justify-center`}>
          <span className="text-white/30 font-bold text-3xl">{therapist.name.charAt(0)}</span>
        </div>
      )}

      {/* bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

      {/* 今すぐバッジ — top left */}
      {availableNow && (
        <span className="absolute top-1.5 left-1.5" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
          今すぐ
        </span>
      )}

      {/* duty status badge — top right */}
      {ss?.status === 'onDuty' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white text-emerald-500 border border-emerald-100 animate-pulse">
          出勤中
        </span>
      )}
      {ss?.status === 'before' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-blue-500 border border-blue-100">
          出勤予定
        </span>
      )}
      {ss?.status === 'after' && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-slate-400 border border-slate-200">
          受付終了
        </span>
      )}

      {/* text overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
        {isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && (
          <div className="mb-0.5"><NewBadge /></div>
        )}
        <div className="flex items-center gap-1 min-w-0">
          <p className="font-bold text-[11px] leading-tight drop-shadow line-clamp-1 min-w-0">{therapist.name}</p>
          {therapist.age && (
            <span className="font-bold text-[11px] leading-tight drop-shadow flex-shrink-0">（{therapist.age}）</span>
          )}
        </div>
        {(ss?.status === 'onDuty' || ss?.status === 'before') && (displayHours || therapist.workHours) && (
          <p className="text-[13px] text-pink-200 font-medium mt-0.5 text-center whitespace-nowrap">{displayHours || therapist.workHours}</p>
        )}
      </div>
    </Link>
  );
}

// ── ViewAllCard（横スクロール末尾の「全部見る」カード。クリックで遷移） ──

function ViewAllCard({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="relative flex-shrink-0 w-[105px] h-[153px] md:w-[150px] md:h-56 rounded-2xl overflow-hidden border border-pink-200 bg-gradient-to-b from-pink-50 to-fuchsia-100 flex flex-col items-center justify-center gap-2 hover:from-pink-100 hover:to-fuchsia-200 transition-colors shadow-sm"
    >
      <div className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-pink-500">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
      <p className="text-[12px] font-bold text-pink-600 text-center leading-snug">全部見る</p>
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
      const [schedMap, diarySet] = await Promise.all([
        fetchScheduleMap(rawIds),
        fetchDiarySet(rawIds),
      ]);

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
          hasDiary:        diarySet.has(key),
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
      // 横スクロール表示。最大7人まで（8枚目は「全部見る」カードで週間出勤予定へ）
      setList(visible.slice(0, 7));
    })();
  }, [salonId]);

  if (list.length === 0) return (
    <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
      只今、案内可能なセラピストはおりません ✿
    </div>
  );
  return (
    <div className="flex gap-[3px] overflow-x-auto pb-4 scrollbar-pink">
      {list.map((t, i) => (
        <MiniCard key={t.id} therapist={t} index={i} />
      ))}
      <ViewAllCard href={`/salon/${salonId}/schedule`} />
    </div>
  );
}

// ── SalonOnDutyExcludingNow（本日出勤のうち「今すぐ」を除いた残り。/imasugu 下段用） ──
// 既存 SalonTherapists の取得・今すぐ判定・並び順ロジックを流用。
//   表示対象: 本日出勤(off以外) かつ 今すぐ以外（今すぐの子は上段の大カードで表示するため除外）。
//   並び順  : 出勤中・出勤予定(開始時間順) → 受付終了。0名なら null（セクションごと非表示）。
export function SalonOnDutyExcludingNow({ salonId, theme }: { salonId: number; theme: SalonTheme }) {
  // null = 取得前 / [] = 該当0人。どちらもセクションを描画しない。
  const [list, setList] = useState<Therapist[] | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('therapists')
        .select('id, name, age, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since, body_type')
        .eq('salon_id', salonId);

      const rawIds = (rows ?? []).map(t => t.id);
      const [schedMap, diarySet] = await Promise.all([
        fetchScheduleMap(rawIds),
        fetchDiarySet(rawIds),
      ]);

      const mapped: Therapist[] = (rows ?? []).map(t => {
        const key = String(t.id);
        const todaySchedule = schedMap[key] ?? { is_active: false, start_time: null, end_time: null };
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
          hasDiary:        diarySet.has(key),
          salonId,  // 保存ボタン用（このサロンに在籍）
        };
      });

      // 既存「本日出勤」と同じ並び順ロジックを流用。
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
      // 本日出勤(off以外) かつ 今すぐ以外。今すぐの子は上段の大カードに表示するため重複除外。
      const visible = sorted.filter(t =>
        getScheduleStatus(t.today).status !== 'off' && !availableNowActive(t)
      );
      setList(visible);
    })();
  }, [salonId]);

  if (!list || list.length === 0) return null;

  return (
    <div className="mt-8 rounded-3xl p-5 border shadow-sm" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">💖</span>
        <h2 className="text-base font-bold" style={{ color: theme.heading }}>本日出勤のセラピスト</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((t, i) => (
          <GridCard key={t.id} therapist={t} index={i} enableWorkingShimmer showSaveButton saveButtonPos="card-right" />
        ))}
      </div>
    </div>
  );
}

// ── SalonAllTherapists (全員表示) ──────────────────────────────

export function SalonAllTherapists({ salonId, limit, from, showSaveButton = false }: { salonId: number; limit?: number; from?: string; showSaveButton?: boolean }) {
  const [list, setList] = useState<Therapist[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('therapists')
        .select('id, name, age, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_new_face, new_face_since, body_type')
        .eq('salon_id', salonId);

      const rawIds = (rows ?? []).map(t => t.id);
      const [schedMap, diarySet] = await Promise.all([
        fetchScheduleMap(rawIds),
        fetchDiarySet(rawIds),
      ]);

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
        hasDiary:        diarySet.has(String(t.id)),
        salonId,  // 保存ボタン用（このサロンに在籍）
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
        <GridCard key={t.id} therapist={t} index={i} from={from} showSaveButton={showSaveButton} saveButtonPos="card-right" />
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
  from,
  showSaveButton = false,
}: {
  salonId: number;
  theme: SalonTheme;
  header?: 'card' | 'bar';   // 'card': テーマ背景ブロック+見出し / 'bar': 緑色のタイトルバー
  maxItems?: number | null;  // number: その人数まで表示し超過時「すべて見る」/ null: 全件表示・ボタンなし
  from?: string;             // パンくず用 ?from= パラメータ
  showSaveButton?: boolean;  // 保存ボタン（カード右上）を表示
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
      const [schedMap, diarySet] = await Promise.all([
        fetchScheduleMap(rawIds),
        fetchDiarySet(rawIds),
      ]);

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
        hasDiary:        diarySet.has(String(t.id)),
        salonId,  // 保存ボタン用（このサロンに在籍）
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
        <GridCard key={t.id} therapist={t} index={i} showJoinDate from={from} showSaveButton={showSaveButton} saveButtonPos="card-right" />
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
