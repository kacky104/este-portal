import type { SupabaseClient } from '@supabase/supabase-js';
import { scheduleWindowUtc, jstWallToUtc } from '@/app/lib/booking/slots';

// 予約ボードの「読む」部分（第1113便・2026-10-03）。
//
// ★ もともと src/app/actions/booking.ts の getBookingBoardData の中にあったものを、認証と切り離してここへ。
//   ★ 理由: フクエスCRM の getCrmSchedule が getBookingBoardData を呼ぶと、認証（auth.getUser＋salons）が
//     CRM 側と【二重】になり、さらに salon_bookings を CRM の列のために【もう1回】読んでいた。
//   ★ ここは service_role と店舗の行を【受け取って】読むだけ。★ 認証は呼ぶ側（booking.ts / crm.ts）の責任。
//   ★ 'use server' のファイルではない（★ svc を引数に取る関数を server action として外へ出さないため）。
// ★ 動きは getBookingBoardData と同じ（窓は 0:00〜翌7:00・前日の尻尾・cancelled も返す・フリー客は行を作らない）。

export type BookingCourse = { name: string; durationMin: number; price: string };

export type OwnerBooking = {
  id: string;
  slotStart: string;
  slotEnd: string;
  therapistName: string;
  courseName: string;
  courseMin: number;
  customerName: string;
  customerTel: string;
  note: string | null;
  callbackPref: string | null;
  status: string;
  createdAt: string;
};

// therapistId=null はフリー客（担当未定）の予約＝ボード最上段のフリー客レーンに表示（2026-08-14）。
export type BoardBooking = OwnerBooking & { therapistId: number | null };
// fromPrevDay=true は「前日の夜跨ぎシフトの尻尾」（例：前日18:00〜翌2:00 の 0:00〜2:00 部分）。
export type BoardScheduleWindow = { start: string; end: string; startISO: string; endISO: string; fromPrevDay: boolean };
export type BoardTherapist = { id: number; name: string; profileImageUrl: string | null; schedules: BoardScheduleWindow[] };

export type BookingBoardData = {
  date: string;                 // "YYYY-MM-DD"（JSTの暦日。ボード窓は 0:00〜翌7:00 固定・2026-08-14仕様変更）
  therapists: BoardTherapist[]; // 行＝当日出勤（前日尻尾含む）のセラピスト（＋予約だけ残っているセラピスト）
  bookings: BoardBooking[];     // 窓（0:00〜翌7:00）に重なる全予約（cancelled 含む）。翌0:00〜7:00は翌日のボードにも出る
  courses: BookingCourse[];     // 手入力フォームのコース候補（booking_courses）
  defaultIntervalMin: number;   // 施術後インターバルの店舗設定（受付フォームの初期値・2026-08-15）
};

// ★ 第1361便: フクエスCRM の受付・変更は 5分刻み（なし・5・10・15・20・25・30）に。予約に入る値は 0〜60 の5分刻みなら受ける
//   （前は 0・15・30・45・60 だけ。既存の 45・60 の予約もそのまま保存できる）。salons.default_interval_min の CHECK（0,15,30,45,60）はそのまま
export const INTERVAL_OPTIONS_MIN = [0, 5, 10, 15, 20, 25, 30, 45, 60] as const;
export function isValidIntervalMin(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 60 && n % 5 === 0;
}

export function normalizeIntervalMin(raw: unknown): number {
  const n = Number(raw ?? 0);
  return isValidIntervalMin(n) ? n : 0;
}

// salons.booking_courses(JSON) → 型付き配列（不正な要素は除外）。
export function parseBookingCourses(raw: unknown): BookingCourse[] {
  if (!Array.isArray(raw)) return [];
  const out: BookingCourse[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    const name = String(c?.name ?? '').trim();
    const durationMin = Number(c?.duration_min);
    if (!name || !Number.isInteger(durationMin) || durationMin <= 0) continue;
    out.push({ name, durationMin, price: String(c?.price ?? '') });
  }
  return out;
}

// "YYYY-MM-DD" を days 日ずらす（UTC正午基準で月跨ぎ安全）。
export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}

/** ボードの予約の列（★ 予約の表示に要るもの）。★ extraBookingCols はこれに足す */
const BOARD_BOOKING_COLS = 'id, therapist_id, slot_start, slot_end, course_name, course_min, customer_name, customer_tel, note, callback_pref, status, created_at';

export type LoadBoardResult =
  | {
      ok: true;
      data: BookingBoardData;
      /** ★ extraBookingCols で足した列の生の値（予約ID → 行）。★ 足していなければ空 */
      extra: Map<string, Record<string, unknown>>;
    }
  | { ok: false; error: string };

/**
 * 指定日（暦日）の 0:00〜翌7:00 窓の出勤枠＋予約を読む。★ 認証は済んでいる前提（呼ぶ側が確かめる）。
 * @param salon  店舗の行から要るもの（★ 呼ぶ側が認証のときに読んだ値をそのまま渡す＝ここで salons を読み直さない）
 * @param opts.extraBookingCols  予約の行に足して読む列（例: 'customer_id, cancel_bad'）。★ 同じ行を2回読まないため
 */
export async function loadBookingBoard(
  svc: SupabaseClient,
  salonId: number,
  dateISO: string,
  salon: { bookingCoursesRaw: unknown; defaultIntervalMin: number },
  opts?: { extraBookingCols?: string },
): Promise<LoadBoardResult> {
  // 在籍セラピスト（is_active）。列順は id 昇順（出勤設定タブと同じ並び感）。
  const { data: ths, error: thErr } = await svc
    .from('therapists')
    .select('id, name, profile_image_url')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (thErr) return { ok: false, error: thErr.message };
  const therapistRows = ths ?? [];
  const nameById = new Map<number, string>(
    therapistRows.map((t) => [Number(t.id), (t.name as string | null) ?? '(名前未設定)']),
  );
  // 名前列の丸アイコン用（2026-08-14 追加）。
  const imageById = new Map<number, string | null>(
    therapistRows.map((t) => [Number(t.id), (t.profile_image_url as string | null) ?? null]),
  );

  // ボード窓：当日 0:00〜翌7:00（JST）固定。出勤の有無では変えない（2026-08-14仕様変更）。
  const windowStart = jstWallToUtc(dateISO, '00:00');
  const windowEnd = jstWallToUtc(dateISO, '07:00', 1);

  // 出勤枠：当日分＋前日分（夜跨ぎの尻尾が 0:00 以降に掛かるもの）。
  const ids = therapistRows.map((t) => Number(t.id));
  const prevDate = shiftDateStr(dateISO, -1);
  const extraCols = (opts?.extraBookingCols ?? '').trim();
  // ★ 第1113便: 出勤枠と予約は互いに依存しないので同時に読む（ソウルまで2往復 → 1往復）
  const [schRes, bookRes] = await Promise.all([
    ids.length > 0
      ? svc
          .from('therapist_schedules')
          .select('therapist_id, schedule_date, start_time, end_time, is_active')
          .in('therapist_id', ids)
          .in('schedule_date', [prevDate, dateISO])
          .eq('is_active', true)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    // 窓に重なる予約（cancelled も返す＝ボードで薄く表示して履歴が追えるように）。
    // ★ ボードは source で絞らない。ネット予約も手入力もすべて出す（2026-08-16）。
    svc
      .from('salon_bookings')
      .select(extraCols ? `${BOARD_BOOKING_COLS}, ${extraCols}` : BOARD_BOOKING_COLS)
      .eq('salon_id', salonId)
      .lt('slot_start', windowEnd.toISOString())
      .gt('slot_end', windowStart.toISOString())
      .order('slot_start', { ascending: true }),
  ]);
  if (schRes.error) return { ok: false, error: schRes.error.message };
  if (bookRes.error) return { ok: false, error: bookRes.error.message };

  const windowsByTherapist = new Map<number, BoardScheduleWindow[]>();
  for (const r of (schRes.data ?? []) as Array<Record<string, unknown>>) {
    if (!r.start_time || !r.end_time) continue;
    const schedDate = r.schedule_date as string;
    const fromPrevDay = schedDate === prevDate;
    const start = String(r.start_time).slice(0, 5);
    const end = String(r.end_time).slice(0, 5);
    const { startUtc, endUtc } = scheduleWindowUtc(schedDate, start, end);
    // 前日分は夜跨ぎで 0:00 を越えるものだけ（尻尾）。当日分は必ず窓内。
    if (fromPrevDay && endUtc <= windowStart) continue;
    const list = windowsByTherapist.get(Number(r.therapist_id)) ?? [];
    list.push({ start, end, startISO: startUtc.toISOString(), endISO: endUtc.toISOString(), fromPrevDay });
    windowsByTherapist.set(Number(r.therapist_id), list);
  }
  // 前日尻尾→当日の順（時系列）に並べる。
  for (const list of windowsByTherapist.values()) {
    list.sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime());
  }

  // ★ 列名を文字列でつなぐので supabase-js の型推論が効かない → unknown を経由する
  const rows = ((bookRes.data ?? []) as unknown) as Array<Record<string, unknown>>;
  const extra = new Map<string, Record<string, unknown>>();
  const bookings: BoardBooking[] = rows.map((b) => {
    if (extraCols) extra.set(String(b.id), b);
    return {
      id: String(b.id),
      therapistId: b.therapist_id == null ? null : Number(b.therapist_id),
      slotStart: b.slot_start as string,
      slotEnd: b.slot_end as string,
      therapistName: b.therapist_id == null ? 'フリー客' : nameById.get(Number(b.therapist_id)) ?? '(不明)',
      courseName: (b.course_name as string | null) ?? '',
      courseMin: Number(b.course_min) || 0,
      customerName: (b.customer_name as string | null) ?? '',
      customerTel: (b.customer_tel as string | null) ?? '',
      note: (b.note as string | null) ?? null,
      callbackPref: (b.callback_pref as string | null) ?? null,
      status: (b.status as string | null) ?? 'new',
      createdAt: b.created_at as string,
    };
  });

  // 行＝出勤枠（前日尻尾含む）があるセラピストのみ（出勤なしの人は行を出さない）。
  // ただし行の中は出勤時間に縛られず受付できる（白ボード＋青帯は目安・2026-08-14仕様）。
  // 予約だけ残っているセラピストは末尾に足して、予約がボードから迷子にならないようにする。
  const rowIds = ids.filter((id) => windowsByTherapist.has(id));
  // フリー客（therapistId=null）はセラピスト行を作らない（クライアント側の固定レーンに出す）。
  const extraIds = [...new Set(bookings.map((b) => b.therapistId))]
    .filter((id): id is number => id !== null)
    .filter((id) => !rowIds.includes(id));
  // extra に在籍外（is_active=false）のセラピストが混ざる場合は名前を別途引く。
  const unknownIds = extraIds.filter((id) => !nameById.has(id));
  if (unknownIds.length > 0) {
    const { data: exThs } = await svc.from('therapists').select('id, name, profile_image_url').in('id', unknownIds);
    (exThs ?? []).forEach((t) => {
      nameById.set(Number(t.id), (t.name as string | null) ?? '(名前未設定)');
      imageById.set(Number(t.id), (t.profile_image_url as string | null) ?? null);
    });
    // 予約側の表示名も補完しておく。
    for (const b of bookings) {
      if (b.therapistName === '(不明)' && b.therapistId !== null) {
        b.therapistName = nameById.get(b.therapistId) ?? '(不明)';
      }
    }
  }
  const therapists: BoardTherapist[] = [
    ...rowIds.map((id) => ({
      id,
      name: nameById.get(id) ?? '(不明)',
      profileImageUrl: imageById.get(id) ?? null,
      schedules: windowsByTherapist.get(id) ?? [],
    })),
    ...extraIds.map((id) => ({
      id,
      name: nameById.get(id) ?? '(不明)',
      profileImageUrl: imageById.get(id) ?? null,
      schedules: [],
    })),
  ];

  return {
    ok: true,
    data: {
      date: dateISO,
      therapists,
      bookings,
      courses: parseBookingCourses(salon.bookingCoursesRaw),
      defaultIntervalMin: salon.defaultIntervalMin,
    },
    extra,
  };
}
