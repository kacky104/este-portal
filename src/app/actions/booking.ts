'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createPublicClient } from '@/app/lib/supabase/public';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { buildSlots, scheduleWindowUtc, type Slot } from '@/app/lib/booking/slots';
import { normalizeCallbackPref } from '@/app/lib/booking/callbackPref';

// ネット予約フェーズ1（客向け予約フロー）のサーバーアクション群。
//
// 方針：
//  - therapists / therapist_schedules は公開SELECT可のため createPublicClient で読む。
//  - salon_bookings は公開SELECTポリシー無し（客は読めない）。枠計算・予約一覧・INSERT の
//    再検証はすべて createServiceClient（service_role）でサーバー側完結させる。
//  - getSlots がクライアントへ返すのは slot_start/slot_end 由来の state と時刻ラベルのみ。
//    氏名・電話などの個人情報は一切返さない。

export type BookableTherapist = { id: number; name: string; profileImageUrl: string | null };
export type ScheduleDay = { date: string; start: string; end: string };
export type BookingCourse = { name: string; durationMin: number; price: string };

// salons.booking_courses(JSON) → 型付き配列（不正な要素は除外）。
function parseBookingCourses(raw: unknown): BookingCourse[] {
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

/** そのサロンで指名予約できるセラピスト一覧（is_active のみ）。公開情報。 */
export async function getBookableTherapists(salonId: number): Promise<BookableTherapist[]> {
  if (!Number.isFinite(salonId)) return [];
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('therapists')
    .select('id, name, profile_image_url')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error || !data) return [];
  return data.map((t) => ({
    id: Number(t.id),
    name: (t.name as string | null) ?? '(名前未設定)',
    profileImageUrl: (t.profile_image_url as string | null) ?? null,
  }));
}

/** サロンの予約可否＋予約コースをまとめて返す（book ページの初期表示用）。 */
export async function getSalonBookingConfig(
  salonId: number,
): Promise<{ enabled: boolean; courses: BookingCourse[] }> {
  if (!Number.isFinite(salonId)) return { enabled: false, courses: [] };
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('salons')
    .select('booking_enabled, booking_courses')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !data) return { enabled: false, courses: [] };
  return {
    enabled: Boolean(data.booking_enabled),
    courses: parseBookingCourses(data.booking_courses),
  };
}

/** そのセラピストの出勤日（当日〜7日先・JST基準・is_active）を返す。 */
export async function getTherapistScheduleDays(therapistId: number): Promise<ScheduleDay[]> {
  if (!Number.isFinite(therapistId)) return [];
  const supabase = createPublicClient();
  const from = getBusinessDateJST(0);
  const to = getBusinessDateJST(7);
  const { data, error } = await supabase
    .from('therapist_schedules')
    .select('schedule_date, start_time, end_time, is_active')
    .eq('therapist_id', therapistId)
    .eq('is_active', true)
    .gte('schedule_date', from)
    .lte('schedule_date', to)
    .order('schedule_date', { ascending: true });
  if (error || !data) return [];
  return data
    .filter((r) => r.start_time && r.end_time)
    .map((r) => ({
      date: r.schedule_date as string,
      start: String(r.start_time).slice(0, 5),
      end: String(r.end_time).slice(0, 5),
    }));
}

// 指定セラピスト・出勤枠に重なる既存予約（slot_start/slot_end のみ）を service_role で取得。
async function fetchOverlappingBookings(
  therapistId: number,
  startUtc: Date,
  endUtc: Date,
): Promise<{ slot_start: string; slot_end: string }[]> {
  const svc = createServiceClient();
  // 重なり判定：booking.slot_start < windowEnd かつ booking.slot_end > windowStart。
  const { data, error } = await svc
    .from('salon_bookings')
    .select('slot_start, slot_end')
    .eq('therapist_id', therapistId)
    .lt('slot_start', endUtc.toISOString())
    .gt('slot_end', startUtc.toISOString());
  if (error || !data) return [];
  return data.map((b) => ({
    slot_start: b.slot_start as string,
    slot_end: b.slot_end as string,
  }));
}

/** 指定セラピスト・日付・コース時間で、15分刻みの枠配列を返す（個人情報は返さない）。 */
export async function getSlots(
  therapistId: number,
  dateISO: string,
  courseMin: number,
): Promise<Slot[]> {
  if (!Number.isFinite(therapistId) || !dateISO || !Number.isInteger(courseMin) || courseMin <= 0) {
    return [];
  }
  const supabase = createPublicClient();
  const { data: sched, error } = await supabase
    .from('therapist_schedules')
    .select('schedule_date, start_time, end_time, is_active')
    .eq('therapist_id', therapistId)
    .eq('schedule_date', dateISO)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !sched || !sched.start_time || !sched.end_time) return [];

  const start = String(sched.start_time).slice(0, 5);
  const end = String(sched.end_time).slice(0, 5);
  const { startUtc, endUtc } = scheduleWindowUtc(dateISO, start, end);

  const existingBookings = await fetchOverlappingBookings(therapistId, startUtc, endUtc);

  return buildSlots({
    scheduleDate: dateISO,
    start,
    end,
    existingBookings,
    courseMin,
    now: new Date(),
  });
}

export type CreateBookingInput = {
  salonId: number;
  therapistId: number;
  courseName: string;
  courseMin: number;
  slotStartISO: string;
  customerName: string;
  customerTel: string;
  note: string;
  callbackPref: string;
};

export type CreateBookingResult =
  | { ok: true }
  | { ok: false; error: 'disabled' | 'slot_taken' | 'invalid' | string };

// slotStart（UTC）が属する JST 日付を返す（"YYYY-MM-DD"）。
function jstDateOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
}

/**
 * 予約を確定INSERTする。クライアントの申告は一切信用せず、サーバー側で全項目を再検証する。
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const salonId = Number(input.salonId);
  const therapistId = Number(input.therapistId);
  const courseMin = Number(input.courseMin);
  const courseName = String(input.courseName ?? '').trim();
  const customerName = String(input.customerName ?? '').trim();
  const customerTel = String(input.customerTel ?? '').trim();
  const note = String(input.note ?? '').trim();
  // 折り返し希望時間帯：有効な slug 以外は 'none' に正規化（改ざん耐性）。
  const callbackPref = normalizeCallbackPref(input.callbackPref);

  // 基本バリデーション
  if (!Number.isFinite(salonId) || !Number.isFinite(therapistId)) return { ok: false, error: 'invalid' };
  if (!Number.isInteger(courseMin) || courseMin <= 0) return { ok: false, error: 'invalid' };
  if (!customerName) return { ok: false, error: 'invalid' };
  if (!/^[\d\-]{6,20}$/.test(customerTel)) return { ok: false, error: 'invalid' };

  const slotStart = new Date(input.slotStartISO);
  if (Number.isNaN(slotStart.getTime())) return { ok: false, error: 'invalid' };

  const svc = createServiceClient();

  // 1) サロンの予約可否＋予約コースを確認（course の改ざん防止）。
  const { data: salon, error: salonErr } = await svc
    .from('salons')
    .select('booking_enabled, booking_courses')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr || !salon) return { ok: false, error: 'invalid' };
  if (!salon.booking_enabled) return { ok: false, error: 'disabled' };

  const courses = parseBookingCourses(salon.booking_courses);
  const matchedCourse = courses.find((c) => c.name === courseName && c.durationMin === courseMin);
  if (!matchedCourse) return { ok: false, error: 'invalid' };

  // 2) セラピストが当該サロン所属＆is_active か。
  const { data: therapist, error: thErr } = await svc
    .from('therapists')
    .select('salon_id, is_active')
    .eq('id', therapistId)
    .maybeSingle();
  if (thErr || !therapist) return { ok: false, error: 'invalid' };
  if (Number(therapist.salon_id) !== salonId || !therapist.is_active) return { ok: false, error: 'invalid' };

  // 3) slotStart を含む出勤枠を特定（夜跨ぎシフトは前日 schedule_date に属するため2日分を候補にする）。
  const jstDate = jstDateOf(slotStart);
  const [y, mo, d] = jstDate.split('-').map(Number);
  const prev = new Date(Date.UTC(y, mo - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const prevDate = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;

  const { data: schedRows, error: schedErr } = await svc
    .from('therapist_schedules')
    .select('schedule_date, start_time, end_time, is_active')
    .eq('therapist_id', therapistId)
    .eq('is_active', true)
    .in('schedule_date', [prevDate, jstDate]);
  if (schedErr || !schedRows || schedRows.length === 0) return { ok: false, error: 'invalid' };

  // slotStart が窓内（startUtc <= slotStart < endUtc）に収まる出勤枠を探す。
  const candidate = schedRows
    .filter((r) => r.start_time && r.end_time)
    .map((r) => {
      const date = r.schedule_date as string;
      const start = String(r.start_time).slice(0, 5);
      const end = String(r.end_time).slice(0, 5);
      const { startUtc, endUtc } = scheduleWindowUtc(date, start, end);
      return { date, start, end, startUtc, endUtc };
    })
    .find((w) => slotStart >= w.startUtc && slotStart < w.endUtc);
  if (!candidate) return { ok: false, error: 'invalid' };

  // 4-6) 直前ガード・出勤終了内に収まるか・既存予約との重なりを buildSlots で再判定（getSlots と同一ロジック）。
  const existingBookings = await fetchOverlappingBookings(therapistId, candidate.startUtc, candidate.endUtc);
  const slots = buildSlots({
    scheduleDate: candidate.date,
    start: candidate.start,
    end: candidate.end,
    existingBookings,
    courseMin,
    now: new Date(),
  });
  const target = slots.find((s) => s.startISO === slotStart.toISOString());
  if (!target) return { ok: false, error: 'invalid' };
  if (target.state !== 'open') {
    // full=既に埋まった/収まらない, tel/past=時間的に不可。full は「直前に埋まった」扱い。
    return { ok: false, error: target.state === 'full' ? 'slot_taken' : 'invalid' };
  }

  // 7) INSERT（UNIQUE(therapist_id, slot_start) 違反=23505 は「直前に埋まった」として返す）。
  const slotEnd = new Date(slotStart.getTime() + courseMin * 60 * 1000);
  const { error: insErr } = await svc.from('salon_bookings').insert({
    salon_id: salonId,
    therapist_id: therapistId,
    slot_start: slotStart.toISOString(),
    slot_end: slotEnd.toISOString(),
    course_name: courseName,
    course_min: courseMin,
    customer_name: customerName,
    customer_tel: customerTel,
    note: note || null,
    callback_pref: callbackPref,
    status: 'new',
  });
  if (insErr) {
    if (insErr.code === '23505') return { ok: false, error: 'slot_taken' };
    return { ok: false, error: insErr.message };
  }

  // TODO(ステップ2b): ここで salon.booking_email へ Resend で予約通知メールを送信する。
  return { ok: true };
}

// ── /mypage 予約一覧（オーナー本人 or 運営のみ・service_role 取得） ──

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

/** ログインオーナーの自店の予約一覧を新しい順で返す（表示のみ）。 */
export async function getSalonBookings(
  salonId: number,
): Promise<{ ok: true; bookings: OwnerBooking[] } | { ok: false; error: string }> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr || !salon) return { ok: false, error: 'サロンが見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { ok: false, error: 'このサロンの予約を閲覧する権限がありません' };
  }

  const svc = createServiceClient();
  const { data: rows, error } = await svc
    .from('salon_bookings')
    .select('id, therapist_id, slot_start, slot_end, course_name, course_min, customer_name, customer_tel, note, callback_pref, status, created_at')
    .eq('salon_id', salonId)
    .order('slot_start', { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  const bookingRows = rows ?? [];
  // セラピスト名を辞書引き（N+1回避）。
  const therapistIds = [...new Set(bookingRows.map((b) => Number(b.therapist_id)).filter(Number.isFinite))];
  const nameById = new Map<number, string>();
  if (therapistIds.length > 0) {
    const { data: ths } = await svc
      .from('therapists')
      .select('id, name')
      .in('id', therapistIds);
    (ths ?? []).forEach((t) => nameById.set(Number(t.id), (t.name as string | null) ?? '(名前未設定)'));
  }

  const bookings: OwnerBooking[] = bookingRows.map((b) => ({
    id: String(b.id),
    slotStart: b.slot_start as string,
    slotEnd: b.slot_end as string,
    therapistName: nameById.get(Number(b.therapist_id)) ?? '(不明)',
    courseName: (b.course_name as string | null) ?? '',
    courseMin: Number(b.course_min) || 0,
    customerName: (b.customer_name as string | null) ?? '',
    customerTel: (b.customer_tel as string | null) ?? '',
    note: (b.note as string | null) ?? null,
    callbackPref: (b.callback_pref as string | null) ?? null,
    status: (b.status as string | null) ?? 'new',
    createdAt: b.created_at as string,
  }));

  return { ok: true, bookings };
}
