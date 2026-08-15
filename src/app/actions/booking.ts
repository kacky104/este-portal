'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createPublicClient } from '@/app/lib/supabase/public';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { buildSlots, scheduleWindowUtc, jstWallToUtc, SLOT_STEP_MIN, type Slot } from '@/app/lib/booking/slots';
import { normalizeCallbackPref, callbackPrefLabel } from '@/app/lib/booking/callbackPref';
import { SALON_BOOKINGS_LIMIT } from '@/app/lib/booking/limits';
import { sendBookingMail } from '@/app/lib/booking/sendBookingMail';
import { normalizePhone } from '@/app/lib/validation/phone';

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
  // status='cancelled' は枠を塞がない（＝キャンセルで枠が解放される）ため除外する。
  const { data, error } = await svc
    .from('salon_bookings')
    .select('slot_start, slot_end')
    .eq('therapist_id', therapistId)
    .neq('status', 'cancelled')
    .lt('slot_start', endUtc.toISOString())
    .gt('slot_end', startUtc.toISOString());
  if (error || !data) return [];
  return data.map((b) => ({
    slot_start: b.slot_start as string,
    slot_end: b.slot_end as string,
  }));
}

// 施術後のインターバル（分）を安全な値に正規化する（2026-08-15）。
// 許可値以外・null・未設定はすべて 0（＝インターバルなし＝従来と同じ挙動）。
function normalizeIntervalMin(raw: unknown): number {
  const n = Number(raw ?? 0);
  return (INTERVAL_OPTIONS_MIN as readonly number[]).includes(n) ? n : 0;
}

// supabase-js のネスト結合（therapists!inner(salons!inner(...))）は、型の上では
// オブジェクトにも配列にもなり得る。どちらでも先頭を取り出せるようにする。
function firstOfRelation(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return (v[0] as Record<string, unknown>) ?? null;
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  return null;
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
  // therapists!inner→salons!inner の連鎖で、非表示サロン（anon RLSで不可視）所属の
  // セラピストの枠は取得できない（＝空配列＝予約不可）。
  const { data: sched, error } = await supabase
    .from('therapist_schedules')
    .select('schedule_date, start_time, end_time, is_active, therapists!inner(salons!inner(id, default_interval_min))')
    .eq('therapist_id', therapistId)
    .eq('schedule_date', dateISO)
    .eq('is_active', true)
    .eq('therapists.salons.is_hidden', false)
    .maybeSingle();
  if (error || !sched || !sched.start_time || !sched.end_time) return [];

  const start = String(sched.start_time).slice(0, 5);
  const end = String(sched.end_time).slice(0, 5);
  const { startUtc, endUtc } = scheduleWindowUtc(dateISO, start, end);

  const existingBookings = await fetchOverlappingBookings(therapistId, startUtc, endUtc);

  // 店舗設定のインターバル（2026-08-15）。ネスト結合の salons から読む。
  // 取れなければ 0＝従来と同じ挙動（枠計算が壊れて予約できなくなるより安全側）。
  const intervalMin = normalizeIntervalMin(
    firstOfRelation(firstOfRelation(sched.therapists)?.salons)?.default_interval_min,
  );

  return buildSlots({
    scheduleDate: dateISO,
    start,
    end,
    existingBookings,
    courseMin,
    intervalMin,
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
  | { ok: false; error: 'disabled' | 'slot_taken' | 'invalid' | 'duplicate_booking' | 'rate_limited' | string };

// slotStart（UTC）が属する JST 日付を返す（"YYYY-MM-DD"）。
function jstDateOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);
}

// 予約枠を JST の "M/D(曜) HH:MM〜HH:MM" に整形（通知メール本文用）。
function formatSlotLabelJST(startISO: string, endISO: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const md = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(s);
  const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(s);
  const hm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${md}(${wd}) ${hm(s)}〜${hm(e)}`;
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
  // ハイフン除去後の数字のみに正規化（桁ルールは従来どおり 6〜20 桁）。保存値もこの正規化後に統一。
  const customerTel = normalizePhone(String(input.customerTel ?? ''));
  const note = String(input.note ?? '').trim();
  // 折り返し希望時間帯：有効な slug 以外は 'none' に正規化（改ざん耐性）。
  const callbackPref = normalizeCallbackPref(input.callbackPref);

  // 基本バリデーション
  if (!Number.isFinite(salonId) || !Number.isFinite(therapistId)) return { ok: false, error: 'invalid' };
  if (!Number.isInteger(courseMin) || courseMin <= 0) return { ok: false, error: 'invalid' };
  if (!customerName) return { ok: false, error: 'invalid' };
  if (!/^\d{6,20}$/.test(customerTel)) return { ok: false, error: 'invalid' };

  const slotStart = new Date(input.slotStartISO);
  if (Number.isNaN(slotStart.getTime())) return { ok: false, error: 'invalid' };

  const svc = createServiceClient();

  // 1) サロンの予約可否＋予約コースを確認（course の改ざん防止）。
  const { data: salon, error: salonErr } = await svc
    .from('salons')
    .select('name, booking_enabled, booking_email, booking_courses, is_hidden, default_interval_min')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr || !salon) return { ok: false, error: 'invalid' };
  // service_role は RLS を通らないため、非表示サロンは明示的に弾く（受付停止扱い）。
  if (salon.is_hidden) return { ok: false, error: 'disabled' };
  if (!salon.booking_enabled) return { ok: false, error: 'disabled' };

  const courses = parseBookingCourses(salon.booking_courses);
  const matchedCourse = courses.find((c) => c.name === courseName && c.durationMin === courseMin);
  if (!matchedCourse) return { ok: false, error: 'invalid' };

  // 施術後のインターバル（店舗設定・2026-08-15）。予約枠＝コース＋インターバルで塞ぐ。
  // 手入力（電話予約）と同じ考え方で、列は持たず slot_end に織り込む。
  const intervalMin = normalizeIntervalMin(salon.default_interval_min);

  // 2) セラピストが当該サロン所属＆is_active か。
  const { data: therapist, error: thErr } = await svc
    .from('therapists')
    .select('salon_id, is_active, name')
    .eq('id', therapistId)
    .maybeSingle();
  if (thErr || !therapist) return { ok: false, error: 'invalid' };
  if (Number(therapist.salon_id) !== salonId || !therapist.is_active) return { ok: false, error: 'invalid' };

  // 2.5) 悪用ガード（2026-07-12）：予約は匿名で行えるため、無制限に INSERT できると
  //      偽名＋電話番号形式だけで全セラピストの全枠を機械的に埋める営業妨害が可能だった。
  //      job_applications の「直近1時間の同一 tel ガード」と同方針で tel 単位に制限する。
  //      ガード用クエリ自体の失敗は予約を止めない（ログのみ・bannerReport と同方針）。
  //  (a) 同一 tel × 同一サロンに未来の有効予約（cancelled 以外）が既にあれば重複として拒否。
  const { data: dupRows, error: dupErr } = await svc
    .from('salon_bookings')
    .select('id')
    .eq('customer_tel', customerTel)
    .eq('salon_id', salonId)
    .neq('status', 'cancelled')
    .gt('slot_start', new Date().toISOString())
    .limit(1);
  if (dupErr) console.error('createBooking: duplicate check failed:', dupErr.message);
  if (dupRows && dupRows.length > 0) return { ok: false, error: 'duplicate_booking' };

  //  (b) 同一 tel の直近1時間の予約作成が2件以上なら拒否（キャンセル済みも作成実績として数える）。
  const rateCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentRows, error: recentErr } = await svc
    .from('salon_bookings')
    .select('id')
    .eq('customer_tel', customerTel)
    .gte('created_at', rateCutoff)
    .limit(2);
  if (recentErr) console.error('createBooking: rate limit check failed:', recentErr.message);
  if (recentRows && recentRows.length >= 2) return { ok: false, error: 'rate_limited' };

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
    intervalMin,
    now: new Date(),
  });
  const target = slots.find((s) => s.startISO === slotStart.toISOString());
  if (!target) return { ok: false, error: 'invalid' };
  if (target.state !== 'open') {
    // full=既に埋まった/収まらない, tel/past=時間的に不可。full は「直前に埋まった」扱い。
    return { ok: false, error: target.state === 'full' ? 'slot_taken' : 'invalid' };
  }

  // 7) INSERT 前に、同一 (therapist_id, slot_start) の cancelled 行があれば削除する。
  //    UNIQUE(therapist_id, slot_start) が残っているため、キャンセル済み枠を再予約すると
  //    23505 で弾かれてしまう。cancelled 行だけ先に消してキャンセル枠を再利用可能にする。
  //    （new/confirmed の行があった場合は上の重なり再検証で既に slot_taken 済み。）
  await svc
    .from('salon_bookings')
    .delete()
    .eq('therapist_id', therapistId)
    .eq('slot_start', slotStart.toISOString())
    .eq('status', 'cancelled');

  // INSERT（UNIQUE(therapist_id, slot_start) 違反=23505 は「直前に埋まった」として返す）。
  // 予約枠＝コース＋インターバル（インターバル分も塞ぐ。course_min はコース時間のみを保存し、
  // 復元は (slot_end - slot_start) - course_min で行う＝手入力と同じ方式）。
  const slotEnd = new Date(slotStart.getTime() + (courseMin + intervalMin) * 60 * 1000);
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

  // 予約成立後、店の通知先メールへ Resend で予約通知を送信する。
  // sendBookingMail は内部で失敗を握る（例外を投げない）ため、予約成功の返却には影響しない。
  // booking_email が空/null の場合は sendBookingMail 側で送信スキップ（エラーにしない）。
  await sendBookingMail({
    to: (salon.booking_email as string | null) ?? '',
    salonName: (salon.name as string | null) ?? '',
    // 通知メールに出すのは「施術の時間」＝コース時間ぶん（2026-08-15）。
    // slotEnd にはインターバルが織り込まれているため、そのまま出すと
    // 本文の「アロマ60（60分）」と時刻レンジが食い違って読めてしまう。
    slotLabel: formatSlotLabelJST(
      slotStart.toISOString(),
      new Date(slotStart.getTime() + courseMin * 60 * 1000).toISOString(),
    ),
    therapistName: (therapist.name as string | null) ?? '',
    courseName,
    courseMin,
    customerName,
    customerTel,
    callbackLabel: callbackPrefLabel(callbackPref),
    note: note || null,
  });

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
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象店舗が不正です' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr || !salon) return { ok: false, error: '店舗が見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この店舗の予約を閲覧する権限がありません' };
  }

  const svc = createServiceClient();
  const { data: rows, error } = await svc
    .from('salon_bookings')
    .select('id, therapist_id, slot_start, slot_end, course_name, course_min, customer_name, customer_tel, note, callback_pref, status, created_at')
    .eq('salon_id', salonId)
    .order('slot_start', { ascending: false })
    // 表示の上限であって、データの保持期間ではない（詳しくは lib/booking/limits.ts のコメント）。
    // 上限に達したことは画面側でも同じ定数を使って案内している（2026-08-16）。
    .limit(SALON_BOOKINGS_LIMIT);
  if (error) return { ok: false, error: error.message };

  const bookingRows = rows ?? [];
  // セラピスト名を辞書引き（N+1回避）。therapist_id=NULL はフリー客（担当未定・2026-08-14）。
  const therapistIds = [...new Set(bookingRows.filter((b) => b.therapist_id != null).map((b) => Number(b.therapist_id)).filter(Number.isFinite))];
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
    therapistName: b.therapist_id == null ? 'フリー客' : nameById.get(Number(b.therapist_id)) ?? '(不明)',
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

// ── 予約管理（ステータス変更・削除）：オーナー本人 or 運営のみ ──

const BOOKING_STATUSES = ['new', 'confirmed', 'cancelled'] as const;
type BookingStatus = (typeof BOOKING_STATUSES)[number];

// 指定予約のオーナー本人（または運営）であることを検証し、その予約の salon_id を返す。
// service_role で予約→salon を辿り、ログインユーザーが salon.owner_id と一致するか確認する。
async function assertBookingOwner(
  bookingId: string,
): Promise<{ ok: true; svc: ReturnType<typeof createServiceClient> } | { ok: false; error: string }> {
  if (!bookingId) return { ok: false, error: '対象予約が不正です' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: booking, error: bErr } = await svc
    .from('salon_bookings')
    .select('salon_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !booking) return { ok: false, error: '予約が見つかりません' };

  const { data: salon, error: sErr } = await svc
    .from('salons')
    .select('owner_id')
    .eq('id', Number(booking.salon_id))
    .maybeSingle();
  if (sErr || !salon) return { ok: false, error: '店舗が見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この予約を操作する権限がありません' };
  }
  return { ok: true, svc };
}

/** 予約のステータスを変更する（new/confirmed/cancelled）。オーナー本人 or 運営のみ。 */
export async function updateBookingStatus(
  bookingId: string,
  nextStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!BOOKING_STATUSES.includes(nextStatus as BookingStatus)) {
    return { ok: false, error: 'ステータスが不正です' };
  }
  const auth = await assertBookingOwner(bookingId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.svc
    .from('salon_bookings')
    .update({ status: nextStatus })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 予約レコードを物理削除する（枠も解放される）。オーナー本人 or 運営のみ。 */
export async function deleteBooking(
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await assertBookingOwner(bookingId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.svc
    .from('salon_bookings')
    .delete()
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── /mypage 予約ボード（2026-08-14 追加）：1日タイムライン用データ＋電話予約の手入力＋予約移動 ──
//
// いずれもオーナー本人（または運営）のみ。読み書きは service_role でサーバー側完結。
// テーブルは既存の salon_bookings / therapist_schedules をそのまま使う（マイグレーション不要）。
// 電話予約の手入力は status='confirmed' で INSERT する（電話口で成立済みのため）。
// ネット予約（createBooking）との区別は callback_pref では付けず、確定済みかどうかの運用に委ねる。

// ログインユーザーが salonId のオーナー本人（または運営）であることを検証する。
// あわせて booking_courses（手入力フォームのコース候補用）を返す。
async function assertSalonOwner(
  salonId: number,
): Promise<{ ok: true; bookingCoursesRaw: unknown; defaultIntervalMin: number } | { ok: false; error: string }> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id, booking_courses, default_interval_min')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { ok: false, error: '店舗が見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この店舗の予約を操作する権限がありません' };
  }
  return {
    ok: true,
    bookingCoursesRaw: salon.booking_courses,
    // 手入力フォームのインターバル初期値に使う（2026-08-15）。
    defaultIntervalMin: normalizeIntervalMin(salon.default_interval_min),
  };
}

// ※ 2026-08-14：店側の手入力・移動は「出勤枠内」の制約を撤廃した（findScheduleWindow は廃止）。
//    開始30分前や終了時間超えの受付など、受付可能時間は店の判断でその都度変わるため。
//    出勤枠はボード上で薄青の目安表示のみ。客向けネット予約（createBooking）は従来どおり枠内のみ。

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

// "YYYY-MM-DD" を days 日ずらす（UTC正午基準で月跨ぎ安全）。
function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}

// JSTの今日（暦日・0:00切替）。ボードの「今日」は営業日（朝6時切替）ではなくこちらを使う。
function todayJstCalendar(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

// ボードで扱える日数（過去側）。閲覧・手入力・移動で同じ値を使う（クライアントの PAST_DAYS と対）。
const BOARD_PAST_DAYS = 90;

/**
 * ボードで扱える時刻範囲（過去90日の 0:00 〜 7日目の翌朝 7:00・JST）に入っているか。
 * 入っていなければエラーメッセージ、問題なければ null を返す。
 * UI 側も同じ範囲に絞っているが、サーバーアクションは直接呼べるため防御としてここでも弾く
 * （手入力・移動の暴走登録を防ぐ・2026-08-14 追加）。
 */
function boardRangeError(slotStart: Date, verb: '登録' | '移動'): string | null {
  const todayCal = todayJstCalendar();
  const from = jstWallToUtc(shiftDateStr(todayCal, -BOARD_PAST_DAYS), '00:00').getTime();
  const to = jstWallToUtc(shiftDateStr(todayCal, 6), '07:00', 1).getTime();
  const t = slotStart.getTime();
  if (t < from || t >= to) {
    return `${verb}できるのは過去${BOARD_PAST_DAYS}日から7日先までです`;
  }
  return null;
}

/** 予約ボード用：指定日（暦日）の 0:00〜翌7:00 窓の出勤枠＋予約をまとめて返す。オーナー本人 or 運営のみ。 */
export async function getBookingBoardData(
  salonId: number,
  dateISO: string,
): Promise<{ ok: true; data: BookingBoardData } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { ok: false, error: '日付が不正です' };
  // 表示できる範囲：過去90日〜7日先（暦日・2026-08-14 過去閲覧対応）。
  const todayCal = todayJstCalendar();
  if (dateISO < shiftDateStr(todayCal, -BOARD_PAST_DAYS) || dateISO > shiftDateStr(todayCal, 6)) {
    return { ok: false, error: `表示できるのは過去${BOARD_PAST_DAYS}日から7日先までです` };
  }
  const auth = await assertSalonOwner(salonId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const svc = createServiceClient();

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
  const windowsByTherapist = new Map<number, BoardScheduleWindow[]>();
  if (ids.length > 0) {
    const { data: sch, error: schErr } = await svc
      .from('therapist_schedules')
      .select('therapist_id, schedule_date, start_time, end_time, is_active')
      .in('therapist_id', ids)
      .in('schedule_date', [prevDate, dateISO])
      .eq('is_active', true);
    if (schErr) return { ok: false, error: schErr.message };
    for (const r of sch ?? []) {
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
  }

  // 窓に重なる予約（cancelled も返す＝ボードで薄く表示して履歴が追えるように）。
  const { data: rows, error: bErr } = await svc
    .from('salon_bookings')
    .select('id, therapist_id, slot_start, slot_end, course_name, course_min, customer_name, customer_tel, note, callback_pref, status, created_at')
    .eq('salon_id', salonId)
    .lt('slot_start', windowEnd.toISOString())
    .gt('slot_end', windowStart.toISOString())
    .order('slot_start', { ascending: true });
  if (bErr) return { ok: false, error: bErr.message };

  const bookings: BoardBooking[] = (rows ?? []).map((b) => ({
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
  }));

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
      courses: parseBookingCourses(auth.bookingCoursesRaw),
      defaultIntervalMin: auth.defaultIntervalMin,
    },
  };
}

export type ManualBookingInput = {
  salonId: number;
  therapistId: number | null;
  slotStartISO: string;
  durationMin: number;
  intervalMin: number; // インターバル（施術後の準備時間・2026-08-14追加）。0/15/30/45/60。予約枠＝コース＋インターバル
  courseName: string;
  customerName: string;
  customerTel: string; // 任意（電話予約でも聞き取れない場合があるため空を許容）
  note: string;
};
// therapistId は number | null。null＝フリー客（担当未定）レーンへの受付（2026-08-14）。
// インターバルは列を持たず slot_end に織り込む（slot_end = slot_start + course_min + interval）。
// 復元は (slot_end - slot_start) - course_min で行う（マイグレーション不要）。

const INTERVAL_OPTIONS_MIN = [0, 15, 30, 45, 60] as const;

/**
 * 電話予約の手入力（オーナー本人 or 運営のみ）。
 * 出勤枠内・既存予約と重ならないことだけ検証し、status='confirmed' で INSERT する。
 * ネット予約と違い、直前ガード（LEAD_TIME）や tel レートリミットは掛けない
 * （店側の操作であり、過去時刻の記録入力も許容する）。
 */
export async function createManualBooking(input: ManualBookingInput): Promise<{ ok: boolean; error?: string }> {
  const salonId = Number(input.salonId);
  // null＝フリー客（担当未定）。それ以外は数値のセラピストID。
  const therapistId = input.therapistId === null ? null : Number(input.therapistId);
  const durationMin = Number(input.durationMin);
  const intervalMin = Number(input.intervalMin ?? 0);
  const courseName = String(input.courseName ?? '').trim();
  const customerName = String(input.customerName ?? '').trim();
  const customerTelRaw = String(input.customerTel ?? '').trim();
  const customerTel = customerTelRaw ? normalizePhone(customerTelRaw) : '';
  const note = String(input.note ?? '').trim();

  if (!Number.isFinite(salonId)) return { ok: false, error: '入力が不正です' };
  if (therapistId !== null && !Number.isFinite(therapistId)) return { ok: false, error: '入力が不正です' };
  if (!Number.isInteger(durationMin) || durationMin < SLOT_STEP_MIN || durationMin > 720) {
    return { ok: false, error: '所要時間が不正です' };
  }
  if (!(INTERVAL_OPTIONS_MIN as readonly number[]).includes(intervalMin)) {
    return { ok: false, error: 'インターバルが不正です' };
  }
  if (!customerName) return { ok: false, error: 'お客様名を入力してください' };
  if (customerTel && !/^\d{6,20}$/.test(customerTel)) {
    return { ok: false, error: '電話番号の形式が正しくありません' };
  }
  const slotStart = new Date(input.slotStartISO);
  if (Number.isNaN(slotStart.getTime())) return { ok: false, error: '開始時刻が不正です' };
  // ボードで扱える範囲（過去90日〜7日先）の外には登録させない（2026-08-14 追加）。
  const rangeErr = boardRangeError(slotStart, '登録');
  if (rangeErr) return { ok: false, error: rangeErr };

  const auth = await assertSalonOwner(salonId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const svc = createServiceClient();

  // セラピストが当該サロン所属＆is_active か（フリー客はスキップ）。
  if (therapistId !== null) {
    const { data: th, error: thErr } = await svc
      .from('therapists')
      .select('salon_id, is_active')
      .eq('id', therapistId)
      .maybeSingle();
    if (thErr || !th || Number(th.salon_id) !== salonId || !th.is_active) {
      return { ok: false, error: 'セラピストが不正です' };
    }
  }

  // 出勤枠内チェックは行わない（2026-08-14仕様変更：受付可能時間は店の判断でその都度変わるため）。
  // 予約枠＝コース＋インターバル（インターバル分も枠として塞ぐ）。
  const slotEnd = new Date(slotStart.getTime() + (durationMin + intervalMin) * 60 * 1000);

  // 既存予約（cancelled 以外）との重なりチェック。フリー客はサロン内の therapist_id IS NULL 同士で判定。
  if (therapistId !== null) {
    const overlapping = await fetchOverlappingBookings(therapistId, slotStart, slotEnd);
    if (overlapping.length > 0) return { ok: false, error: 'その時間帯は既に予約が入っています' };
  } else {
    const { data: freeRows, error: freeErr } = await svc
      .from('salon_bookings')
      .select('id')
      .eq('salon_id', salonId)
      .is('therapist_id', null)
      .neq('status', 'cancelled')
      .lt('slot_start', slotEnd.toISOString())
      .gt('slot_end', slotStart.toISOString())
      .limit(1);
    if (freeErr) return { ok: false, error: freeErr.message };
    if (freeRows && freeRows.length > 0) return { ok: false, error: 'その時間帯は既にフリー客の予約が入っています' };
  }

  // 同一枠に cancelled 行が残っていれば掃除（UNIQUE制約対策・createBooking と同じ。
  // フリー客は部分ユニーク index（salon_id, slot_start WHERE therapist_id IS NULL）が対象）。
  if (therapistId !== null) {
    await svc
      .from('salon_bookings')
      .delete()
      .eq('therapist_id', therapistId)
      .eq('slot_start', slotStart.toISOString())
      .eq('status', 'cancelled');
  } else {
    await svc
      .from('salon_bookings')
      .delete()
      .eq('salon_id', salonId)
      .is('therapist_id', null)
      .eq('slot_start', slotStart.toISOString())
      .eq('status', 'cancelled');
  }

  const { error: insErr } = await svc.from('salon_bookings').insert({
    salon_id: salonId,
    therapist_id: therapistId,
    slot_start: slotStart.toISOString(),
    slot_end: slotEnd.toISOString(),
    course_name: courseName || '電話予約',
    course_min: durationMin,
    customer_name: customerName,
    customer_tel: customerTel,
    note: note || null,
    callback_pref: 'none',
    status: 'confirmed',
  });
  if (insErr) {
    if (insErr.code === '23505') return { ok: false, error: 'その時間帯は既に予約が入っています' };
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}

/**
 * 予約の時間・担当を変更する（オーナー本人 or 運営のみ）。
 * コース内容・お客様情報は変えず、slot_start / slot_end / therapist_id のみ更新する。
 * 移動先も出勤枠内・重なり無しを検証。キャンセル済みは移動不可（先に「新規に戻す」）。
 */
export async function moveBooking(
  bookingId: string,
  newTherapistId: number | null, // null＝フリー客（担当未定）レーンへ移動（2026-08-14）
  newSlotStartISO: string,
): Promise<{ ok: boolean; error?: string }> {
  const therapistId = newTherapistId === null ? null : Number(newTherapistId);
  if (therapistId !== null && !Number.isFinite(therapistId)) return { ok: false, error: '移動先が不正です' };
  const slotStart = new Date(newSlotStartISO);
  if (Number.isNaN(slotStart.getTime())) return { ok: false, error: '開始時刻が不正です' };
  // ボードで扱える範囲（過去90日〜7日先）の外へは移動させない（2026-08-14 追加）。
  const rangeErr = boardRangeError(slotStart, '移動');
  if (rangeErr) return { ok: false, error: rangeErr };

  const auth = await assertBookingOwner(bookingId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const svc = auth.svc;

  const { data: booking, error: bErr } = await svc
    .from('salon_bookings')
    .select('salon_id, therapist_id, slot_start, slot_end, course_min, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !booking) return { ok: false, error: '予約が見つかりません' };
  if (booking.status === 'cancelled') {
    return { ok: false, error: 'キャンセル済みの予約は移動できません（先に「新規に戻す」を押してください）' };
  }
  // 枠の全長（コース＋インターバル）を維持して移動する（2026-08-14：インターバル対応）。
  const spanMs = new Date(booking.slot_end as string).getTime() - new Date(booking.slot_start as string).getTime();
  if (!Number.isFinite(spanMs) || spanMs <= 0) return { ok: false, error: '予約時間が不正のため移動できません' };

  // 変更なし（同じ担当・同じ開始時刻）は何もしない。
  const currentTherapistId = booking.therapist_id == null ? null : Number(booking.therapist_id);
  if (
    currentTherapistId === therapistId &&
    new Date(booking.slot_start as string).getTime() === slotStart.getTime()
  ) {
    return { ok: true };
  }

  // 移動先セラピストが同一サロン所属＆is_active か（フリー客レーンへの移動はスキップ）。
  if (therapistId !== null) {
    const { data: th, error: thErr } = await svc
      .from('therapists')
      .select('salon_id, is_active')
      .eq('id', therapistId)
      .maybeSingle();
    if (thErr || !th || Number(th.salon_id) !== Number(booking.salon_id) || !th.is_active) {
      return { ok: false, error: '移動先セラピストが不正です' };
    }
  }

  // 移動先の出勤枠内チェックは行わない（2026-08-14仕様変更：手入力と同じ理由）。
  const slotEnd = new Date(slotStart.getTime() + spanMs);

  // 自分以外の予約（cancelled 以外）との重なりチェック。フリー客はサロン内の NULL 行同士で判定。
  let overlapQuery = svc
    .from('salon_bookings')
    .select('id')
    .neq('status', 'cancelled')
    .neq('id', bookingId)
    .lt('slot_start', slotEnd.toISOString())
    .gt('slot_end', slotStart.toISOString())
    .limit(1);
  overlapQuery = therapistId !== null
    ? overlapQuery.eq('therapist_id', therapistId)
    : overlapQuery.eq('salon_id', Number(booking.salon_id)).is('therapist_id', null);
  const { data: others, error: oErr } = await overlapQuery;
  if (oErr) return { ok: false, error: oErr.message };
  if (others && others.length > 0) return { ok: false, error: '移動先の時間帯は既に予約が入っています' };

  // 移動先の同一枠に cancelled 行が残っていれば掃除（UNIQUE制約対策）。
  let cleanupQuery = svc
    .from('salon_bookings')
    .delete()
    .eq('slot_start', slotStart.toISOString())
    .eq('status', 'cancelled')
    .neq('id', bookingId);
  cleanupQuery = therapistId !== null
    ? cleanupQuery.eq('therapist_id', therapistId)
    : cleanupQuery.eq('salon_id', Number(booking.salon_id)).is('therapist_id', null);
  await cleanupQuery;

  const { error: upErr } = await svc
    .from('salon_bookings')
    .update({
      therapist_id: therapistId,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
    })
    .eq('id', bookingId);
  if (upErr) {
    if (upErr.code === '23505') return { ok: false, error: '移動先の時間帯は既に予約が入っています' };
    return { ok: false, error: upErr.message };
  }
  return { ok: true };
}

/**
 * 予約ボードの日付チップ用（2026-08-14 追加）：今日から7日間の予約件数を暦日ごとに返す。
 * cancelled は数えない（ボード右上の「◯件」と同じ基準）。
 * 日付は暦日（0:00切替）で、各日の窓は 0:00〜翌7:00＝ボードの表示範囲と同じ。
 * 数える基準もボードの表示条件と同じ「窓に重なる予約」（slot_start < 窓終わり かつ slot_end > 窓始まり）。
 * ※以前は slot_start が窓内のものだけを数えていたため、前日から日跨ぎしてきた予約
 *   （例：前日23:00〜当日0:30）がボードには出るのにバッジでは数えられず、
 *   「◯件」表示と1件ズレていた（2026-08-14 修正）。
 */
export async function getBookingCountsByDay(
  salonId: number,
): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> {
  const auth = await assertSalonOwner(salonId);
  if (!auth.ok) return { ok: false, error: auth.error };

  // 日付は暦日（0:00切替）・各日の窓は 0:00〜翌7:00（ボードと同じ・2026-08-14仕様変更）。
  // 翌0:00〜7:00 開始の予約は前日と当日の両方に数える（ボードに両方出るのと同じ基準。
  // そのためバッジ合計は実件数より多くなり得る＝仕様）。
  const days = Array.from({ length: 7 }, (_, i) => shiftDateStr(todayJstCalendar(), i));
  const from = jstWallToUtc(days[0], '00:00');
  const to = jstWallToUtc(days[6], '07:00', 1); // 7日目の翌朝7時まで

  const svc = createServiceClient();
  // 取得条件もボード本体（getBookingBoardData）と同じ「窓に重なる」で揃える。
  const { data, error } = await svc
    .from('salon_bookings')
    .select('slot_start, slot_end')
    .eq('salon_id', salonId)
    .neq('status', 'cancelled')
    .lt('slot_start', to.toISOString())
    .gt('slot_end', from.toISOString());
  if (error) return { ok: false, error: error.message };

  const counts: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  const windows = days.map((d) => ({
    d,
    from: jstWallToUtc(d, '00:00').getTime(),
    to: jstWallToUtc(d, '07:00', 1).getTime(),
  }));
  for (const r of data ?? []) {
    const s = new Date(r.slot_start as string).getTime();
    const e = new Date(r.slot_end as string).getTime();
    for (const w of windows) {
      if (s < w.to && e > w.from) counts[w.d] += 1;
    }
  }
  return { ok: true, counts };
}

export type UpdateBookingDetailsInput = {
  bookingId: string;
  courseName: string;
  courseMin: number;
  intervalMin: number; // 0/15/30/45/60。予約枠＝コース＋インターバル
  customerName: string;
  customerTel: string; // 任意
  note: string;
};

/**
 * 予約内容の編集（2026-08-14 追加）：コース名・コース時間・インターバル・お客様名・電話・備考を更新する。
 * 開始時刻と担当は変えない（それは moveBooking の役割）。オーナー本人 or 運営のみ。
 * コース時間 or インターバルの変更で枠が伸びる場合は、他予約との重なりを再チェックする。
 */
export async function updateBookingDetails(
  input: UpdateBookingDetailsInput,
): Promise<{ ok: boolean; error?: string }> {
  const bookingId = String(input.bookingId ?? '');
  const courseName = String(input.courseName ?? '').trim();
  const courseMin = Number(input.courseMin);
  const intervalMin = Number(input.intervalMin ?? 0);
  const customerName = String(input.customerName ?? '').trim();
  const customerTelRaw = String(input.customerTel ?? '').trim();
  const customerTel = customerTelRaw ? normalizePhone(customerTelRaw) : '';
  const note = String(input.note ?? '').trim();

  if (!Number.isInteger(courseMin) || courseMin < SLOT_STEP_MIN || courseMin > 720) {
    return { ok: false, error: 'コース時間が不正です' };
  }
  if (!(INTERVAL_OPTIONS_MIN as readonly number[]).includes(intervalMin)) {
    return { ok: false, error: 'インターバルが不正です' };
  }
  if (!customerName) return { ok: false, error: 'お客様名を入力してください' };
  if (customerTel && !/^\d{6,20}$/.test(customerTel)) {
    return { ok: false, error: '電話番号の形式が正しくありません' };
  }

  const auth = await assertBookingOwner(bookingId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const svc = auth.svc;

  const { data: booking, error: bErr } = await svc
    .from('salon_bookings')
    .select('salon_id, therapist_id, slot_start, slot_end, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !booking) return { ok: false, error: '予約が見つかりません' };

  const slotStart = new Date(booking.slot_start as string);
  const newSlotEnd = new Date(slotStart.getTime() + (courseMin + intervalMin) * 60 * 1000);

  // 枠が変わる場合、cancelled 以外は他予約との重なりを再チェック（自分は除外）。
  if (booking.status !== 'cancelled' && newSlotEnd.toISOString() !== (booking.slot_end as string)) {
    let overlapQuery = svc
      .from('salon_bookings')
      .select('id')
      .neq('status', 'cancelled')
      .neq('id', bookingId)
      .lt('slot_start', newSlotEnd.toISOString())
      .gt('slot_end', slotStart.toISOString())
      .limit(1);
    overlapQuery = booking.therapist_id != null
      ? overlapQuery.eq('therapist_id', Number(booking.therapist_id))
      : overlapQuery.eq('salon_id', Number(booking.salon_id)).is('therapist_id', null);
    const { data: others, error: oErr } = await overlapQuery;
    if (oErr) return { ok: false, error: oErr.message };
    if (others && others.length > 0) {
      return { ok: false, error: '枠を伸ばすと他の予約と重なります（先に移動やインターバル調整をしてください）' };
    }
  }

  const { error: upErr } = await svc
    .from('salon_bookings')
    .update({
      course_name: courseName || '電話予約',
      course_min: courseMin,
      customer_name: customerName,
      customer_tel: customerTel,
      note: note || null,
      slot_end: newSlotEnd.toISOString(),
    })
    .eq('id', bookingId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
