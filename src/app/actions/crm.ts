'use server';

// フクエスCRM（有料）のサーバー処理（第1段階・2026-09-19）。
//
// ★ 無料／有料の棲み分け（カッキーさん 2026-09-19）
//   ・予約ボードは無料。CRM（顧客台帳）は有料。有料かどうかは salons.crm_until（この日まで・JST）。
//   ・判定は【必ずここ（サーバー）】で行う。画面で隠すだけにしない。
//   ・無料の店でも名寄せ（記録）はしている（src/app/lib/crm/linkCustomer.ts）。見せないだけ。
// ★ 読み書きは service_role。その前にログイン中のユーザーが店のオーナー本人（か運営）か確かめる。
// ★ テーブル: salon_customers / salon_customer_phones / salon_bookings.customer_id・cancel_bad
//   （supabase/migrations/20260919_salon_customers.sql）。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { normalizePhone } from '@/app/lib/validation/phone';
import { getBookingBoardData } from '@/app/actions/booking';
import { scheduleWindowUtc } from '@/app/lib/booking/slots';
import { CRM_TERMS_VERSION } from '@/app/lib/crm/terms';
import { headers } from 'next/headers';
import { businessDateNowJST } from '@/app/lib/crm/consentMatch';
import {
  toCrmCategory,
  type CrmAccess,
  type CrmBookingRow,
  type CrmCustomerDetail,
  type CrmCustomerRow,
  type CrmScheduleData,
  type CrmScheduleCustomer,
  type CrmBookingItem,
  type CrmPriceItem,
  type CrmPriceKind,
  type CrmPayConfirm,
  type CrmDailyReport,
  type CrmDaySummary,
  CRM_PRICE_KINDS,
  CRM_FIXED_NOMINATIONS,
  CRM_DEFAULT_SETTINGS,
  CRM_ROOM_COLORS,
  CRM_RECEIVED,
  normalizeCrmAlarms,
  normalizeCrmToggles,
  CRM_TOGGLE_MAX,
  CRM_TOGGLE_TITLE_LEN,
  CRM_TOGGLE_OPTION_MAX,
  CRM_TOGGLE_OPTION_LEN,
  isUnreceived,
  CRM_MONEY_CATEGORIES,
  CRM_MONEY_DIRECTIONS,
  type CrmMoneyCategory,
  type CrmMoneyMove,
  type CrmMoneyBalance,
  type CrmMoneyDay,
  type CrmConsent,
  type CrmBookingSearch,
  type CrmBookingListRow,
  type CrmSettings,
  type CrmEndType,
  type CrmWorkDay,
  type CrmAttendance,
  isFixedNomination,
  sumCrmItems,
  type CrmStats,
  type CrmTherapist,
} from '@/app/lib/crm/types';

type Svc = ReturnType<typeof createServiceClient>;

const LIST_LIMIT = 50;
const HISTORY_LIMIT = 300;

/** crm_until（YYYY-MM-DD）が今日（JST暦日）以降なら有料で使える */
function isCrmActive(crmUntil: string | null): boolean {
  if (!crmUntil) return false;
  return String(crmUntil).slice(0, 10) >= getCalendarDateJST();
}

/**
 * ログイン中のオーナーの店と、CRM が使えるかを返す。
 * 運営（ADMIN_UUID）は salonId を渡せばその店を見られる（有料でなくても見られる＝確認用）。
 */
export async function getCrmAccess(salonIdForAdmin?: number): Promise<CrmAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です', needLogin: true };
  const isAdmin = user.id === ADMIN_UUID;
  const svc = createServiceClient();

  let q = svc.from('salons').select('id, name, crm_until, owner_id');
  if (isAdmin && Number.isInteger(salonIdForAdmin) && (salonIdForAdmin as number) > 0) {
    q = q.eq('id', salonIdForAdmin as number);
  } else {
    // /mypage と同じ引き方（同じオーナーで2件ヒットしうるので .single() を使わない）
    q = q.eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true });
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error || !data) return { ok: false, error: '店舗情報が見つかりません' };

  const crmUntil = (data.crm_until as string | null) ?? null;
  // 規約への同意（第569便）：版が決まっていて、まだその版に同意していなければ false（運営は見るだけなので true）
  let termsOk = true;
  if (CRM_TERMS_VERSION && !isAdmin) {
    const { data: ag } = await svc.from('crm_terms_agreements').select('id')
      .eq('salon_id', Number(data.id)).eq('version', CRM_TERMS_VERSION).maybeSingle();
    termsOk = !!ag;
  }
  return {
    ok: true,
    salonId: Number(data.id),
    salonName: (data.name as string | null) ?? '',
    crmUntil,
    active: isAdmin || isCrmActive(crmUntil),
    isAdmin,
    termsOk,
  };
}

/** 有料CRMを使ってよいか確かめてから service_role を返す */
async function assertCrm(salonId: number): Promise<{ ok: true; svc: Svc; userId: string } | { ok: false; error: string }> {
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon, error } = await svc
    .from('salons')
    .select('owner_id, crm_until')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { ok: false, error: '店舗が見つかりません' };
  const isAdmin = user.id === ADMIN_UUID;
  if (!isAdmin && (salon.owner_id as string | null) !== user.id) {
    return { ok: false, error: 'この店舗の顧客台帳を見る権限がありません' };
  }
  if (!isAdmin && !isCrmActive((salon.crm_until as string | null) ?? null)) {
    return { ok: false, error: 'フクエスCRMのご契約期間外です' };
  }
  return { ok: true, svc, userId: user.id };
}

function emptyStats(): CrmStats {
  return { visits: 0, upcoming: 0, cancels: 0, badCancels: 0, lastVisitISO: null };
}

/** 顧客ごとの利用状況を予約から数える */
async function statsFor(svc: Svc, salonId: number, ids: number[]): Promise<Map<number, CrmStats>> {
  const out = new Map<number, CrmStats>();
  ids.forEach((id) => out.set(id, emptyStats()));
  if (ids.length === 0) return out;
  const { data } = await svc
    .from('salon_bookings')
    .select('customer_id, slot_start, status, cancel_bad')
    .eq('salon_id', salonId)
    .in('customer_id', ids)
    .limit(5000);
  const now = Date.now();
  for (const b of data ?? []) {
    const s = out.get(Number(b.customer_id));
    if (!s) continue;
    const startISO = String(b.slot_start);
    if (b.status === 'cancelled') {
      s.cancels += 1;
      if (b.cancel_bad) s.badCancels += 1;
    } else if (new Date(startISO).getTime() <= now) {
      s.visits += 1;
      if (!s.lastVisitISO || startISO > s.lastVisitISO) s.lastVisitISO = startISO;
    } else {
      s.upcoming += 1;
    }
  }
  return out;
}

async function phonesFor(svc: Svc, ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (ids.length === 0) return out;
  const { data } = await svc
    .from('salon_customer_phones')
    .select('customer_id, phone')
    .in('customer_id', ids)
    .order('id', { ascending: true });
  for (const p of data ?? []) {
    const k = Number(p.customer_id);
    out.set(k, [...(out.get(k) ?? []), String(p.phone)]);
  }
  return out;
}

type CustomerDbRow = {
  id: number; name: string | null; name_kana: string | null; category: string | null;
  member_no: string | null; caution_memo: string | null; memo?: string | null;
  ng_therapist_ids?: number[] | null; created_at?: string | null;
};

const LIST_COLS = 'id, name, name_kana, category, member_no, caution_memo, memo';

/**
 * 顧客を探す。
 * ・空: 最近更新された順に50人
 * ・数字だけ（4桁以上）: 電話番号（下4桁でも・途中一致）
 * ・それ以外: 名前・フリガナ・会員番号の部分一致
 */
export async function searchCrmCustomers(
  salonId: number,
  query: string,
): Promise<{ ok: true; customers: CrmCustomerRow[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const q = String(query ?? '').trim().slice(0, 40);
  const digits = normalizePhone(q);

  let rows: CustomerDbRow[] = [];
  if (!q) {
    const { data, error } = await svc
      .from('salon_customers').select(LIST_COLS)
      .eq('salon_id', salonId).order('updated_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) return { ok: false, error: error.message };
    rows = (data ?? []) as CustomerDbRow[];
  } else if (/^\d{4,13}$/.test(digits)) {
    const { data: ph, error: pErr } = await svc
      .from('salon_customer_phones').select('customer_id')
      .eq('salon_id', salonId).like('phone', `%${digits}%`).limit(LIST_LIMIT);
    if (pErr) return { ok: false, error: pErr.message };
    const ids = [...new Set((ph ?? []).map((p) => Number(p.customer_id)))];
    if (ids.length > 0) {
      const { data, error } = await svc
        .from('salon_customers').select(LIST_COLS)
        .eq('salon_id', salonId).in('id', ids).order('updated_at', { ascending: false });
      if (error) return { ok: false, error: error.message };
      rows = (data ?? []) as CustomerDbRow[];
    }
  } else {
    // PostgREST の or() に渡すので , ( ) を落としておく
    const safe = q.replace(/[,()%*\\]/g, ' ').trim();
    if (!safe) return { ok: true, customers: [] };
    const { data, error } = await svc
      .from('salon_customers').select(LIST_COLS)
      .eq('salon_id', salonId)
      .or(`name.ilike.%${safe}%,name_kana.ilike.%${safe}%,member_no.ilike.%${safe}%,memo.ilike.%${safe}%,caution_memo.ilike.%${safe}%`)
      .order('updated_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) return { ok: false, error: error.message };
    rows = (data ?? []) as CustomerDbRow[];
  }

  const ids = rows.map((r) => Number(r.id));
  const [stats, phones] = await Promise.all([statsFor(svc, salonId, ids), phonesFor(svc, ids)]);
  return {
    ok: true,
    customers: rows.map((r) => ({
      id: Number(r.id),
      name: r.name ?? '',
      nameKana: r.name_kana ?? '',
      category: toCrmCategory(r.category),
      memberNo: r.member_no ?? '',
      phones: phones.get(Number(r.id)) ?? [],
      cautionMemo: r.caution_memo ?? '',
      stats: stats.get(Number(r.id)) ?? emptyStats(),
      ...(memoHitOf(q, r) ? { memoHit: memoHitOf(q, r)! } : {}),
    })),
  };
}

/** 検索の言葉がメモ・要注意メモのどこに当たったか（前後を少し切り出す・第553便） */
function memoHitOf(q: string, r: CustomerDbRow): { kind: 'caution' | 'memo'; text: string } | null {
  const word = q.trim().toLowerCase();
  if (!word || /^\d{4,13}$/.test(normalizePhone(q))) return null;
  for (const [kind, raw] of [['caution', r.caution_memo], ['memo', r.memo]] as const) {
    const text = String(raw ?? '');
    const i = text.toLowerCase().indexOf(word);
    if (i < 0) continue;
    const from = Math.max(0, i - 12);
    const to = Math.min(text.length, i + word.length + 18);
    return { kind, text: `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? '…' : ''}` };
  }
  return null;
}

/** 1人の詳細＋予約履歴＋（女子NG用の）セラピスト一覧 */
export async function getCrmCustomer(
  salonId: number,
  customerId: number,
): Promise<
  | { ok: true; customer: CrmCustomerDetail; bookings: CrmBookingRow[]; therapists: CrmTherapist[] }
  | { ok: false; error: string }
> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;

  const { data: c, error } = await svc
    .from('salon_customers')
    .select('id, name, name_kana, category, member_no, caution_memo, memo, ng_therapist_ids, created_at')
    .eq('salon_id', salonId).eq('id', customerId).maybeSingle();
  if (error || !c) return { ok: false, error: 'お客様が見つかりません' };
  const row = c as CustomerDbRow;

  const [stats, phones, bRes, tRes] = await Promise.all([
    statsFor(svc, salonId, [customerId]),
    phonesFor(svc, [customerId]),
    svc.from('salon_bookings')
      .select('id, slot_start, slot_end, course_name, course_min, therapist_id, status, cancel_bad, source, note, customer_name')
      .eq('salon_id', salonId).eq('customer_id', customerId)
      .order('slot_start', { ascending: false }).limit(HISTORY_LIMIT),
    svc.from('therapists').select('id, name, is_active').eq('salon_id', salonId).order('id', { ascending: true }),
  ]);

  const therapists: CrmTherapist[] = (tRes.data ?? []).map((t) => ({
    id: Number(t.id),
    name: (t.name as string | null) ?? '(名前未設定)',
    isActive: Boolean(t.is_active),
  }));
  const tName = new Map(therapists.map((t) => [t.id, t.name]));

  const bookings: CrmBookingRow[] = (bRes.data ?? []).map((b) => ({
    id: String(b.id),
    slotStartISO: String(b.slot_start),
    slotEndISO: String(b.slot_end),
    courseName: (b.course_name as string | null) ?? '',
    courseMin: Number(b.course_min) || 0,
    therapistId: b.therapist_id == null ? null : Number(b.therapist_id),
    therapistName: b.therapist_id == null ? 'フリー' : (tName.get(Number(b.therapist_id)) ?? '(退店)'),
    status: String(b.status),
    cancelBad: Boolean(b.cancel_bad),
    source: String(b.source ?? ''),
    note: (b.note as string | null) ?? '',
    customerName: (b.customer_name as string | null) ?? '',
    consentAt: null as string | null,
  }));
  // 同意書（第574便）：過去の予約のサインも台帳から見られるように
  const cMap = await consentMap(svc, salonId, bookings.map((b) => b.id));
  bookings.forEach((b) => { b.consentAt = cMap.get(b.id) ?? null; });

  return {
    ok: true,
    customer: {
      id: Number(row.id),
      name: row.name ?? '',
      nameKana: row.name_kana ?? '',
      category: toCrmCategory(row.category),
      memberNo: row.member_no ?? '',
      phones: phones.get(customerId) ?? [],
      cautionMemo: row.caution_memo ?? '',
      memo: row.memo ?? '',
      ngTherapistIds: (row.ng_therapist_ids ?? []).map(Number),
      createdAt: row.created_at ?? '',
      stats: stats.get(customerId) ?? emptyStats(),
    },
    bookings,
    therapists,
  };
}

export type CrmCustomerInput = {
  salonId: number;
  customerId: number | null; // null＝新規登録
  name: string;
  nameKana: string;
  category: string;
  memberNo: string;
  phones: string[];
  ngTherapistIds: number[];
  cautionMemo: string;
  memo: string;
};

/** 顧客の登録・更新（電話番号は丸ごと入れ替え） */
export async function saveCrmCustomer(
  input: CrmCustomerInput,
): Promise<{ ok: true; customerId: number } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;

  const name = String(input.name ?? '').trim();
  const nameKana = String(input.nameKana ?? '').trim();
  const memberNo = String(input.memberNo ?? '').trim();
  const cautionMemo = String(input.cautionMemo ?? '').trim();
  const memo = String(input.memo ?? '').trim();
  if (!name) return { ok: false, error: '名前を入力してください' };
  if (name.length > 40 || nameKana.length > 40) return { ok: false, error: '名前・フリガナは40文字までです' };
  if (memberNo.length > 20) return { ok: false, error: '会員番号は20文字までです' };
  if (cautionMemo.length > 500) return { ok: false, error: '要注意メモは500文字までです' };
  if (memo.length > 1000) return { ok: false, error: 'メモは1000文字までです' };

  const phones = [...new Set((input.phones ?? []).map((p) => normalizePhone(p)).filter(Boolean))];
  for (const p of phones) {
    if (!/^\d{10,13}$/.test(p)) return { ok: false, error: `電話番号の形が正しくありません（${p}）` };
  }
  if (phones.length > 5) return { ok: false, error: '電話番号は5件までです' };

  // 女子NGはこの店のセラピストだけに絞る
  const { data: ts } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  const own = new Set((ts ?? []).map((t) => Number(t.id)));
  const ngIds = [...new Set((input.ngTherapistIds ?? []).map(Number))].filter((id) => own.has(id));

  // 電話番号が別のお客様に使われていないか
  if (phones.length > 0) {
    const { data: used } = await svc
      .from('salon_customer_phones').select('customer_id, phone')
      .eq('salon_id', salonId).in('phone', phones);
    const clash = (used ?? []).find((u) => Number(u.customer_id) !== Number(input.customerId));
    if (clash) return { ok: false, error: `${clash.phone} は別のお客様に登録されています` };
  }

  const fields = {
    name,
    name_kana: nameKana,
    category: toCrmCategory(input.category),
    member_no: memberNo,
    ng_therapist_ids: ngIds,
    caution_memo: cautionMemo,
    memo,
    updated_at: new Date().toISOString(),
  };

  let customerId: number;
  if (input.customerId) {
    customerId = Number(input.customerId);
    const { data, error } = await svc
      .from('salon_customers').update(fields)
      .eq('salon_id', salonId).eq('id', customerId).select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: 'お客様が見つかりません' };
  } else {
    const { data, error } = await svc
      .from('salon_customers').insert({ salon_id: salonId, ...fields }).select('id').single();
    if (error || !data) return { ok: false, error: error?.message ?? '登録できませんでした' };
    customerId = Number(data.id);
  }

  // 電話番号の入れ替え（消えた番号を消し、新しい番号を足す）
  const { data: cur } = await svc.from('salon_customer_phones').select('phone').eq('customer_id', customerId);
  const curSet = new Set((cur ?? []).map((p) => String(p.phone)));
  const toDel = [...curSet].filter((p) => !phones.includes(p));
  const toAdd = phones.filter((p) => !curSet.has(p));
  if (toDel.length > 0) {
    await svc.from('salon_customer_phones').delete().eq('customer_id', customerId).in('phone', toDel);
  }
  if (toAdd.length > 0) {
    const { error: aErr } = await svc
      .from('salon_customer_phones')
      .insert(toAdd.map((phone) => ({ customer_id: customerId, salon_id: salonId, phone })));
    if (aErr) return { ok: false, error: '電話番号を登録できませんでした（別のお客様と重なっている可能性があります）' };
  }
  return { ok: true, customerId };
}

/** キャンセル済みの予約に「悪質」を付ける／外す */
export async function setCrmCancelBad(
  salonId: number,
  bookingId: string,
  bad: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc
    .from('salon_bookings')
    .update({ cancel_bad: Boolean(bad) })
    .eq('salon_id', salonId)
    .eq('id', bookingId)
    .eq('status', 'cancelled')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'キャンセル済みの予約だけに付けられます' };
  return { ok: true };
}

/** 女子NGを選ぶためのセラピスト一覧（新規登録フォーム用） */
export async function getCrmTherapists(
  salonId: number,
): Promise<{ ok: true; therapists: CrmTherapist[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc
    .from('therapists').select('id, name, is_active').eq('salon_id', salonId).order('id', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    therapists: (data ?? []).map((t) => ({
      id: Number(t.id),
      name: (t.name as string | null) ?? '(名前未設定)',
      isActive: Boolean(t.is_active),
    })),
  };
}

/**
 * 本日スケジュール（CRM版）。予約ボードと同じ出勤・予約に、台帳のお客様情報を重ねて返す。
 * ★ 出勤と予約の読み方は予約ボード（getBookingBoardData）をそのまま使う（★ 二重管理しない）。
 *   ボードの窓は「その日 0:00〜翌7:00」。画面側で 6:00 より前（前日営業日の続き）は見せない。
 * ★ 見られる日付もボードと同じ（過去90日〜7日先）。
 */
export async function getCrmSchedule(
  salonId: number,
  dateISO: string,
): Promise<{ ok: true; data: CrmScheduleData } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;

  const board = await getBookingBoardData(salonId, dateISO);
  if (!board.ok) return board;
  const { therapists, bookings } = board.data;

  // 予約 → 顧客のひも付けと悪質・入り口（ボードの返り値には無い列）
  const bookingIds = bookings.map((b) => b.id);
  type Extra = {
    customerId: number | null; cancelBad: boolean; source: string;
    items: CrmBookingItem[]; priceAdjust: number; payAdjust: number;
    priceTotal: number | null; payTotal: number | null; paymentMethod: string; playStatus: string; receivedBy: string;
  };
  const extra = new Map<string, Extra>();
  if (bookingIds.length > 0) {
    const { data } = await svc
      .from('salon_bookings')
      .select('id, customer_id, cancel_bad, source, crm_items, price_adjust, pay_adjust, price_total, pay_total, payment_method, play_status, received_by')
      .eq('salon_id', salonId)
      .in('id', bookingIds);
    for (const r of data ?? []) {
      extra.set(String(r.id), {
        customerId: r.customer_id == null ? null : Number(r.customer_id),
        cancelBad: Boolean(r.cancel_bad),
        source: String(r.source ?? ''),
        items: parseItems(r.crm_items),
        priceAdjust: Number(r.price_adjust) || 0,
        payAdjust: Number(r.pay_adjust) || 0,
        priceTotal: r.price_total == null ? null : Number(r.price_total),
        payTotal: r.pay_total == null ? null : Number(r.pay_total),
        paymentMethod: String(r.payment_method ?? ''),
        playStatus: String(r.play_status ?? ''),
        receivedBy: String(r.received_by ?? ''),
      });
    }
  }

  // 同意書（第560便）：有効な同意の時刻
  const consentAt = new Map<string, string>();
  if (bookingIds.length > 0) {
    const { data: cs } = await svc
      .from('crm_consents').select('booking_id, created_at')
      .eq('salon_id', salonId).is('superseded_at', null).in('booking_id', bookingIds);
    for (const c of cs ?? []) consentAt.set(String(c.booking_id), String(c.created_at));
  }

  // 女子メモ（crm_therapist_memos・2026-09-19）
  const memos = new Map<number, string>();
  if (therapists.length > 0) {
    const { data: ms } = await svc
      .from('crm_therapist_memos')
      .select('therapist_id, memo')
      .eq('salon_id', salonId)
      .in('therapist_id', therapists.map((t) => t.id));
    for (const m of ms ?? []) memos.set(Number(m.therapist_id), String(m.memo ?? ''));
  }

  const customerIds = [...new Set([...extra.values()].map((e) => e.customerId).filter((v): v is number => v != null))];
  const customers = new Map<number, CrmScheduleCustomer>();
  if (customerIds.length > 0) {
    const [{ data: cs }, stats] = await Promise.all([
      svc.from('salon_customers')
        .select('id, name, category, caution_memo, ng_therapist_ids')
        .eq('salon_id', salonId)
        .in('id', customerIds),
      statsFor(svc, salonId, customerIds),
    ]);
    for (const c of cs ?? []) {
      const id = Number(c.id);
      customers.set(id, {
        id,
        name: (c.name as string | null) ?? '',
        category: toCrmCategory(c.category),
        cautionMemo: (c.caution_memo as string | null) ?? '',
        ngTherapistIds: ((c.ng_therapist_ids as number[] | null) ?? []).map(Number),
        stats: stats.get(id) ?? emptyStats(),
      });
    }
  }

  return {
    ok: true,
    data: {
      date: dateISO,
      courses: board.data.courses,
      priceItems: (await readPriceItems(svc, salonId)).filter((p) => p.isActive),
      confirms: await readConfirms(svc, salonId, dateISO),
      report: await readReport(svc, salonId, dateISO),
      settings: await readSettings(svc, salonId),
      workEnds: await readWorkEnds(svc, salonId, dateISO),
      workDays: await readWorkDays(svc, salonId, dateISO),
      defaultIntervalMin: board.data.defaultIntervalMin,
      therapists: therapists.map((t) => ({
        id: t.id,
        name: t.name,
        profileImageUrl: t.profileImageUrl,
        memo: memos.get(t.id) ?? '',
        schedules: t.schedules.map((w) => ({ start: w.start, end: w.end, startISO: w.startISO, endISO: w.endISO })),
      })),
      bookings: bookings.map((b) => {
        const e = extra.get(b.id);
        return {
          id: b.id,
          therapistId: b.therapistId,
          slotStartISO: b.slotStart,
          slotEndISO: b.slotEnd,
          courseName: b.courseName,
          courseMin: b.courseMin,
          customerName: b.customerName,
          customerTel: b.customerTel,
          note: b.note ?? '',
          status: b.status,
          cancelBad: e?.cancelBad ?? false,
          source: e?.source ?? '',
          customer: e?.customerId != null ? customers.get(e.customerId) ?? null : null,
          items: e?.items ?? [],
          priceAdjust: e?.priceAdjust ?? 0,
          payAdjust: e?.payAdjust ?? 0,
          priceTotal: e?.priceTotal ?? null,
          payTotal: e?.payTotal ?? null,
          paymentMethod: e?.paymentMethod ?? '',
          playStatus: e?.playStatus ?? '',
          receivedBy: e?.receivedBy ?? '',
          consentAt: consentAt.get(String(b.id)) ?? null,
        };
      }),
    },
  };
}

/**
 * 電話番号から台帳のお客様を引く（受付フォームで番号を入れたとき）。見つからなければ customer: null。
 * ★ 番号は完全一致（数字10〜13桁）。★ 途中一致はしない（別の人を出してしまうため）。
 */
export async function lookupCrmCustomerByPhone(
  salonId: number,
  tel: string,
): Promise<{ ok: true; customer: CrmScheduleCustomer | null } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const phone = normalizePhone(String(tel ?? ''));
  if (!/^\d{10,13}$/.test(phone)) return { ok: true, customer: null };
  const svc = auth.svc;
  const { data: ph } = await svc
    .from('salon_customer_phones').select('customer_id')
    .eq('salon_id', salonId).eq('phone', phone).maybeSingle();
  if (!ph) return { ok: true, customer: null };
  const id = Number(ph.customer_id);
  const [{ data: c }, stats] = await Promise.all([
    svc.from('salon_customers')
      .select('id, name, category, caution_memo, ng_therapist_ids')
      .eq('salon_id', salonId).eq('id', id).maybeSingle(),
    statsFor(svc, salonId, [id]),
  ]);
  if (!c) return { ok: true, customer: null };
  return {
    ok: true,
    customer: {
      id,
      name: (c.name as string | null) ?? '',
      category: toCrmCategory(c.category),
      cautionMemo: (c.caution_memo as string | null) ?? '',
      ngTherapistIds: ((c.ng_therapist_ids as number[] | null) ?? []).map(Number),
      stats: stats.get(id) ?? emptyStats(),
    },
  };
}

/**
 * 女子メモを保存する（セラピスト1人1行・空にすると行を消す）。
 * ★ crm_therapist_memos は RLS で全部閉じてある（公開の therapists には置かない）。service_role で書く。
 */
export async function saveCrmTherapistMemo(
  salonId: number,
  therapistId: number,
  memo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const text = String(memo ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length > 500) return { ok: false, error: '女子メモは500文字までです' };

  // その店のセラピストか確かめる
  const { data: t } = await svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };

  if (!text) {
    const { error } = await svc.from('crm_therapist_memos').delete().eq('therapist_id', therapistId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  const { error } = await svc
    .from('crm_therapist_memos')
    .upsert({ therapist_id: therapistId, salon_id: salonId, memo: text, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── 料金と報酬（第2段階・第536便）──────────────────────

function toKind(v: unknown): CrmPriceKind | null {
  return (CRM_PRICE_KINDS as readonly string[]).includes(String(v)) ? (v as CrmPriceKind) : null;
}

/** 予約の crm_items（jsonb）→ 型付き配列（おかしな要素は捨てる） */
function parseItems(raw: unknown): CrmBookingItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CrmBookingItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const kind = toKind(r?.kind);
    const name = String(r?.name ?? '').trim();
    if (!kind || !name) continue;
    out.push({
      kind,
      name,
      minutes: Math.max(0, Number(r?.minutes) || 0),
      price: Math.max(0, Number(r?.price) || 0),
      pay: Math.max(0, Number(r?.pay) || 0),
      ...(r?.priceItemId != null ? { priceItemId: Number(r.priceItemId) } : {}),
    });
  }
  return out;
}

async function readPriceItemsRaw(svc: Svc, salonId: number): Promise<CrmPriceItem[]> {
  const { data } = await svc
    .from('crm_price_items')
    .select('id, kind, name, minutes, price, pay, sort, is_active')
    .eq('salon_id', salonId)
    .order('kind', { ascending: true })
    .order('sort', { ascending: true })
    .order('id', { ascending: true });
  const out: CrmPriceItem[] = [];
  for (const r of data ?? []) {
    const kind = toKind(r.kind);
    if (!kind) continue;
    out.push({
      id: Number(r.id), kind, name: String(r.name ?? ''),
      minutes: Number(r.minutes) || 0, price: Number(r.price) || 0, pay: Number(r.pay) || 0,
      sort: Number(r.sort) || 0, isActive: Boolean(r.is_active),
    });
  }
  // 種類の並び（コース→指名→延長→オプション→割引）
  const order = new Map(CRM_PRICE_KINDS.map((k, i) => [k, i]));
  return out.sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!) || a.sort - b.sort || a.id - b.id);
}

/**
 * 料金表を読む。★ 固定の指名（フリー・ネット指名・本指名）が無ければ先に作る（第546便）。
 *   名前は変えられず消せない。要らない店は「使う」を外す。
 */
async function readPriceItems(svc: Svc, salonId: number): Promise<CrmPriceItem[]> {
  const items = await readPriceItemsRaw(svc, salonId);
  const missing = CRM_FIXED_NOMINATIONS.filter((n) => !items.some((i) => i.kind === 'nomination' && i.name === n));
  if (missing.length === 0) return items;
  await svc.from('crm_price_items').insert(
    missing.map((name) => ({
      salon_id: salonId, kind: 'nomination', name, minutes: 0, price: 0, pay: 0,
      sort: CRM_FIXED_NOMINATIONS.indexOf(name), is_active: true,
    })),
  );
  return readPriceItemsRaw(svc, salonId);
}

/** 料金表を全部（使っていないものも）返す（料金設定の画面用） */
export async function listCrmPriceItems(
  salonId: number,
): Promise<{ ok: true; items: CrmPriceItem[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  return { ok: true, items: await readPriceItems(auth.svc, salonId) };
}

export type CrmPriceItemInput = {
  salonId: number;
  id: number | null; // null＝追加
  kind: string;
  name: string;
  minutes: number;
  price: number;
  pay: number;
  sort: number;
  isActive: boolean;
};

export async function saveCrmPriceItem(
  input: CrmPriceItemInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const kind = toKind(input.kind);
  const name = String(input.name ?? '').trim();
  const num = (v: unknown) => Math.round(Number(v) || 0);
  const minutes = num(input.minutes);
  const price = num(input.price);
  const pay = num(input.pay);
  if (!kind) return { ok: false, error: '種類が不正です' };
  if (!name || name.length > 40) return { ok: false, error: '名前は1〜40文字で入れてください' };
  if (minutes < 0 || minutes > 720) return { ok: false, error: '分数は0〜720で入れてください' };
  if (price < 0 || price > 1000000 || pay < 0 || pay > 1000000) return { ok: false, error: '金額は0〜1,000,000で入れてください' };
  // ★ 固定の指名は名前・種類を変えられない。ほかの項目に同じ名前も付けられない（第546便）
  if (input.id) {
    const { data: cur } = await auth.svc
      .from('crm_price_items').select('kind, name').eq('salon_id', salonId).eq('id', input.id).maybeSingle();
    if (!cur) return { ok: false, error: '項目が見つかりません' };
    const wasFixed = isFixedNomination(String(cur.kind), String(cur.name));
    if (wasFixed && (kind !== cur.kind || name !== cur.name)) {
      return { ok: false, error: `「${cur.name}」は最初から用意されている項目なので、名前は変えられません` };
    }
    if (!wasFixed && isFixedNomination(kind, name)) return { ok: false, error: `「${name}」は最初から用意されています` };
  } else if (isFixedNomination(kind, name)) {
    return { ok: false, error: `「${name}」は最初から用意されています` };
  }
  const row = {
    kind, name, minutes, price, pay,
    sort: num(input.sort),
    is_active: Boolean(input.isActive),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await auth.svc
      .from('crm_price_items').update(row).eq('salon_id', salonId).eq('id', input.id).select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: '項目が見つかりません' };
  } else {
    const { error } = await auth.svc.from('crm_price_items').insert({ salon_id: salonId, ...row });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteCrmPriceItem(
  salonId: number,
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data: cur } = await auth.svc
    .from('crm_price_items').select('kind, name').eq('salon_id', salonId).eq('id', id).maybeSingle();
  if (cur && isFixedNomination(String(cur.kind), String(cur.name))) {
    return { ok: false, error: '最初から用意されている項目は消せません（要らなければ「使う」を外してください）' };
  }
  // ★ 予約は項目を写して持っているので、消しても過去の予約の金額は変わらない
  const { error } = await auth.svc.from('crm_price_items').delete().eq('salon_id', salonId).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type CrmBookingPricingInput = {
  salonId: number;
  bookingId: string;
  /** 料金表から選んだ項目の id（いまの料金表の金額で写す） */
  priceItemIds: number[];
  /** もう料金表に無い（消した・直した）けれど、この予約に残しておく項目（今の予約の中身と同じものだけ受け付ける） */
  keepItems: CrmBookingItem[];
  priceAdjust: number;
  payAdjust: number;
  paymentMethod: string;
};

/**
 * 予約の料金・報酬を保存する。★ 合計はサーバーで計算する（画面の数字は信用しない）。
 */
export async function setCrmBookingPricing(
  input: CrmBookingPricingInput,
): Promise<{ ok: true; priceTotal: number; payTotal: number } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;

  const { data: b } = await svc
    .from('salon_bookings').select('id, crm_items').eq('salon_id', salonId).eq('id', input.bookingId).maybeSingle();
  if (!b) return { ok: false, error: '予約が見つかりません' };

  const priceItems = await readPriceItems(svc, salonId);
  const byId = new Map(priceItems.map((p) => [p.id, p]));
  const items: CrmBookingItem[] = [];
  for (const id of input.priceItemIds ?? []) {
    const p = byId.get(Number(id));
    if (!p) return { ok: false, error: '料金表の項目が見つかりません（画面を読み直してください）' };
    items.push({ kind: p.kind, name: p.name, minutes: p.minutes, price: p.price, pay: p.pay, priceItemId: p.id });
  }
  // 残す項目は、今の予約に入っているものと同じときだけ（勝手な金額は入れさせない）
  const current = parseItems(b.crm_items);
  const key = (i: CrmBookingItem) => `${i.kind}|${i.name}|${i.minutes}|${i.price}|${i.pay}`;
  const pool = current.map(key);
  for (const k of input.keepItems ?? []) {
    const idx = pool.indexOf(key(k));
    if (idx < 0) continue;
    pool.splice(idx, 1);
    items.push(current.find((c) => key(c) === key(k))!);
  }
  // コース・指名は1つまで
  for (const kind of ['course', 'nomination'] as const) {
    if (items.filter((i) => i.kind === kind).length > 1) {
      return { ok: false, error: kind === 'course' ? 'コースは1つだけ選んでください' : '指名は1つだけ選んでください' };
    }
  }
  const clamp = (v: unknown) => Math.max(-1000000, Math.min(1000000, Math.round(Number(v) || 0)));
  const priceAdjust = clamp(input.priceAdjust);
  const payAdjust = clamp(input.payAdjust);
  const paymentMethod = String(input.paymentMethod ?? '').trim().slice(0, 20);
  const sum = sumCrmItems(items);
  const hasAny = items.length > 0 || priceAdjust !== 0 || payAdjust !== 0;
  const priceTotal = hasAny ? sum.price + priceAdjust : null;
  const payTotal = hasAny ? sum.pay + payAdjust : null;

  const { error } = await svc
    .from('salon_bookings')
    .update({
      crm_items: items,
      price_adjust: priceAdjust,
      pay_adjust: payAdjust,
      price_total: priceTotal,
      pay_total: payTotal,
      payment_method: paymentMethod,
    })
    .eq('salon_id', salonId)
    .eq('id', input.bookingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, priceTotal: priceTotal ?? 0, payTotal: payTotal ?? 0 };
}

// ── 報酬確定と締め（第538便）──────────────────────────
// ★ 営業日＝朝6時区切り。その日 6:00〜翌 6:00（JST）に【始まる】予約をその日の分として数える。

function businessWindow(dateISO: string): { startISO: string; endISO: string } {
  const start = new Date(`${dateISO}T06:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function validDate(dateISO: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateISO) && !Number.isNaN(new Date(`${dateISO}T00:00:00Z`).getTime());
}

type DayBooking = {
  therapistId: number | null; status: string; priceTotal: number; payTotal: number; paymentMethod: string;
  hasPrice: boolean; receivedBy: string; slotStartISO: string;
};

async function readDayBookings(svc: Svc, salonId: number, dateISO: string): Promise<DayBooking[]> {
  const { startISO, endISO } = businessWindow(dateISO);
  const { data } = await svc
    .from('salon_bookings')
    .select('therapist_id, status, price_total, pay_total, payment_method, received_by, slot_start')
    .eq('salon_id', salonId)
    .gte('slot_start', startISO)
    .lt('slot_start', endISO)
    .limit(2000);
  return (data ?? []).map((r) => ({
    therapistId: r.therapist_id == null ? null : Number(r.therapist_id),
    status: String(r.status),
    priceTotal: Number(r.price_total) || 0,
    payTotal: Number(r.pay_total) || 0,
    paymentMethod: String(r.payment_method ?? ''),
    hasPrice: r.price_total != null,
    receivedBy: String(r.received_by ?? ''),
    slotStartISO: String(r.slot_start),
  }));
}

async function readConfirms(svc: Svc, salonId: number, dateISO: string): Promise<CrmPayConfirm[]> {
  if (!validDate(dateISO)) return [];
  const { data } = await svc
    .from('crm_pay_confirms')
    .select('therapist_id, booking_count, pay_total, allowance, note, confirmed_at')
    .eq('salon_id', salonId)
    .eq('business_date', dateISO);
  return (data ?? []).map((r) => ({
    therapistId: Number(r.therapist_id),
    bookingCount: Number(r.booking_count) || 0,
    payTotal: Number(r.pay_total) || 0,
    allowance: Number(r.allowance) || 0,
    note: String(r.note ?? ''),
    confirmedAt: String(r.confirmed_at),
  }));
}

function toReport(r: Record<string, unknown>): CrmDailyReport {
  return {
    date: String(r.business_date),
    bookingCount: Number(r.booking_count) || 0,
    cancelCount: Number(r.cancel_count) || 0,
    workingCount: Number(r.working_count) || 0,
    sales: Number(r.sales) || 0,
    cashSales: Number(r.cash_sales) || 0,
    pay: Number(r.pay) || 0,
    expense: Number(r.expense) || 0,
    profit: Number(r.profit) || 0,
    memo: String(r.memo ?? ''),
    closedAt: String(r.closed_at),
  };
}

async function readReport(svc: Svc, salonId: number, dateISO: string): Promise<CrmDailyReport | null> {
  if (!validDate(dateISO)) return null;
  const { data } = await svc
    .from('crm_daily_reports').select('*').eq('salon_id', salonId).eq('business_date', dateISO).maybeSingle();
  return data ? toReport(data as Record<string, unknown>) : null;
}

/** その日に出勤しているセラピスト（在籍・その店） */
async function readWorking(svc: Svc, salonId: number, dateISO: string): Promise<Array<{ id: number; name: string }>> {
  const { data: ths } = await svc.from('therapists').select('id, name').eq('salon_id', salonId);
  const all = (ths ?? []).map((t) => ({ id: Number(t.id), name: String(t.name ?? '') }));
  if (all.length === 0) return [];
  const { data: sch } = await svc
    .from('therapist_schedules')
    .select('therapist_id')
    .in('therapist_id', all.map((t) => t.id))
    .eq('schedule_date', dateISO)
    .eq('is_active', true);
  const ids = new Set((sch ?? []).map((r) => Number(r.therapist_id)));
  return all.filter((t) => ids.has(t.id));
}

/** 報酬を確定する（その日のそのセラピストの予約の報酬を写す＋手当） */
export async function confirmCrmPay(
  salonId: number,
  therapistId: number,
  dateISO: string,
  allowance: number,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  const svc = auth.svc;
  const { data: t } = await svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };
  const al = Math.round(Number(allowance) || 0);
  if (al < -1000000 || al > 1000000) return { ok: false, error: '手当の金額が大きすぎます' };
  const mine = (await readDayBookings(svc, salonId, dateISO)).filter((b) => b.therapistId === therapistId && b.status !== 'cancelled');
  const { error } = await svc.from('crm_pay_confirms').upsert({
    salon_id: salonId,
    therapist_id: therapistId,
    business_date: dateISO,
    booking_count: mine.length,
    pay_total: mine.reduce((a, b) => a + b.payTotal, 0),
    allowance: al,
    note: String(note ?? '').trim().slice(0, 200),
    confirmed_at: new Date().toISOString(),
    confirmed_by: auth.userId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unconfirmCrmPay(
  salonId: number,
  therapistId: number,
  dateISO: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  const { error } = await auth.svc
    .from('crm_pay_confirms').delete()
    .eq('salon_id', salonId).eq('therapist_id', therapistId).eq('business_date', dateISO);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** その日に受領・報酬・動きがあって、その日の終わりの残高が 0 でない人の名前（第558便） */
async function unsettledNames(svc: Svc, salonId: number, dateISO: string, known: Map<number, string>): Promise<string[]> {
  try {
    const byDay = await moneyByDay(svc, salonId, { untilDate: dateISO });
    const ids: number[] = [];
    for (const [tid, days] of byDay) {
      if (!days.has(dateISO)) continue;
      let bal = 0;
      for (const a of days.values()) bal += aggBalance(a);
      if (bal !== 0) ids.push(tid);
    }
    if (ids.some((id) => !known.has(id))) {
      const { data } = await svc.from('therapists').select('id, name').in('id', ids);
      (data ?? []).forEach((t) => known.set(Number(t.id), String(t.name ?? '')));
    }
    return ids.map((id) => known.get(id) ?? '(不明)');
  } catch {
    return [];
  }
}

async function computeDay(svc: Svc, salonId: number, dateISO: string): Promise<CrmDaySummary> {
  const [bookings, confirms, working, report] = await Promise.all([
    readDayBookings(svc, salonId, dateISO),
    readConfirms(svc, salonId, dateISO),
    readWorking(svc, salonId, dateISO),
    readReport(svc, salonId, dateISO),
  ]);
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const sales = active.reduce((a, b) => a + b.priceTotal, 0);
  const cashSales = active.filter((b) => b.paymentMethod === '現金').reduce((a, b) => a + b.priceTotal, 0);
  const allowance = confirms.reduce((a, c) => a + c.allowance, 0);
  const pay = active.reduce((a, b) => a + b.payTotal, 0) + allowance;
  const confirmed = new Set(confirms.map((c) => c.therapistId));
  // まだ確定していない人：その日に出勤しているか、予約がある人
  const withBooking = new Set(active.map((b) => b.therapistId).filter((v): v is number => v != null));
  const names = new Map(working.map((w) => [w.id, w.name]));
  const needIds = [...new Set([...working.map((w) => w.id), ...withBooking])].filter((id) => !confirmed.has(id));
  if (needIds.some((id) => !names.has(id))) {
    const { data } = await svc.from('therapists').select('id, name').in('id', needIds);
    (data ?? []).forEach((t) => names.set(Number(t.id), String(t.name ?? '')));
  }
  return {
    date: dateISO,
    bookingCount: active.length,
    cancelCount: bookings.length - active.length,
    workingCount: working.length,
    sales,
    cashSales,
    pay,
    allowance,
    freeUnassigned: active.filter((b) => b.therapistId == null).length,
    unconfirmed: needIds.map((id) => names.get(id) ?? '(不明)'),
    unreceived: bookings.filter((b) => isUnreceived({ ...b, priceTotal: b.hasPrice ? b.priceTotal : null }, Date.now())).length,
    unsettled: await unsettledNames(svc, salonId, dateISO, names),
    report,
  };
}

/** 締めの画面用：いまの数字（と、締め済みならその日報） */
export async function getCrmDaySummary(
  salonId: number,
  dateISO: string,
): Promise<{ ok: true; summary: CrmDaySummary } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  return { ok: true, summary: await computeDay(auth.svc, salonId, dateISO) };
}

/** 締める（日報を作る・もう締めてあれば今の数字で作り直す） */
export async function closeCrmDay(
  salonId: number,
  dateISO: string,
  expense: number,
  memo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  const ex = Math.round(Number(expense) || 0);
  if (ex < 0 || ex > 100000000) return { ok: false, error: '経費の金額が不正です' };
  const d = await computeDay(auth.svc, salonId, dateISO);
  const { error } = await auth.svc.from('crm_daily_reports').upsert({
    salon_id: salonId,
    business_date: dateISO,
    booking_count: d.bookingCount,
    cancel_count: d.cancelCount,
    working_count: d.workingCount,
    sales: d.sales,
    cash_sales: d.cashSales,
    pay: d.pay,
    expense: ex,
    profit: d.sales - d.pay - ex,
    memo: String(memo ?? '').trim().slice(0, 1000),
    closed_at: new Date().toISOString(),
    closed_by: auth.userId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reopenCrmDay(
  salonId: number,
  dateISO: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  const { error } = await auth.svc.from('crm_daily_reports').delete().eq('salon_id', salonId).eq('business_date', dateISO);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 日報の一覧（月ごと・ym は YYYY-MM） */
export async function listCrmReports(
  salonId: number,
  ym: string,
): Promise<{ ok: true; reports: CrmDailyReport[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: '月が不正です' };
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const { data, error } = await auth.svc
    .from('crm_daily_reports').select('*')
    .eq('salon_id', salonId)
    .gte('business_date', `${ym}-01`)
    .lt('business_date', `${next}-01`)
    .order('business_date', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, reports: (data ?? []).map((r) => toReport(r as Record<string, unknown>)) };
}

// ── レポート（第540便）──────────────────────────────
/**
 * 月のレポート。★ DB は増やさず、その月の営業日（各日 6:00〜翌6:00 に始まる予約）を数える。
 * ★ 売上・報酬は予約の price_total / pay_total（料金を入れていない予約は 0 として数え、件数を unpriced に出す）。
 * ★ 手当は報酬確定（crm_pay_confirms）の allowance を月で足す。
 */
export async function getCrmMonthStats(
  salonId: number,
  ym: string,
): Promise<{ ok: true; stats: import('@/app/lib/crm/types').CrmMonthStats } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: '月が不正です' };
  const svc = auth.svc;
  const [y, m] = ym.split('-').map(Number);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const startMs = new Date(`${ym}-01T06:00:00+09:00`).getTime();
  const endMs = new Date(`${nextYm}-01T06:00:00+09:00`).getTime();

  const { data: rows, error } = await svc
    .from('salon_bookings')
    .select('slot_start, therapist_id, status, cancel_bad, price_total, pay_total, source, customer_id')
    .eq('salon_id', salonId)
    .gte('slot_start', new Date(startMs).toISOString())
    .lt('slot_start', new Date(endMs).toISOString())
    .order('slot_start', { ascending: true })
    .limit(20000);
  if (error) return { ok: false, error: error.message };
  const list = rows ?? [];

  const { data: conf } = await svc
    .from('crm_pay_confirms').select('allowance')
    .eq('salon_id', salonId).gte('business_date', `${ym}-01`).lt('business_date', `${nextYm}-01`);
  const allowance = (conf ?? []).reduce((a, c) => a + (Number(c.allowance) || 0), 0);

  // セラピスト名
  const tIds = [...new Set(list.map((b) => b.therapist_id).filter((v) => v != null).map(Number))];
  const tName = new Map<number, string>();
  if (tIds.length > 0) {
    const { data: ts } = await svc.from('therapists').select('id, name').in('id', tIds);
    (ts ?? []).forEach((t) => tName.set(Number(t.id), String(t.name ?? '')));
  }

  type Row = import('@/app/lib/crm/types').CrmStatRow;
  const maps = { day: new Map<string, Row>(), th: new Map<string, Row>(), src: new Map<string, Row>(), hour: new Map<string, Row>() };
  const bump = (map: Map<string, Row>, key: string, label: string, b: { cancelled: boolean; price: number; pay: number }) => {
    const r = map.get(key) ?? { key, label, count: 0, cancels: 0, sales: 0, pay: 0 };
    if (b.cancelled) r.cancels += 1;
    else { r.count += 1; r.sales += b.price; r.pay += b.pay; }
    map.set(key, r);
  };

  const total = { count: 0, cancels: 0, badCancels: 0, sales: 0, pay: 0, allowance, unpriced: 0 };
  const custInMonth: number[] = [];
  let noTel = 0;
  for (const b of list) {
    const ms = new Date(String(b.slot_start)).getTime();
    const bizDate = new Date(ms + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
    const jstHour = new Date(ms + 9 * 3600_000).getUTCHours();
    const hour = jstHour < 6 ? jstHour + 24 : jstHour;
    const cancelled = b.status === 'cancelled';
    const price = Number(b.price_total) || 0;
    const pay = Number(b.pay_total) || 0;
    const v = { cancelled, price, pay };
    if (cancelled) { total.cancels += 1; if (b.cancel_bad) total.badCancels += 1; }
    else {
      total.count += 1; total.sales += price; total.pay += pay;
      if (b.price_total == null) total.unpriced += 1;
      if (b.customer_id != null) custInMonth.push(Number(b.customer_id)); else noTel += 1;
    }
    const d = new Date(`${bizDate}T12:00:00Z`);
    bump(maps.day, bizDate, `${Number(bizDate.slice(8, 10))}日（${'日月火水木金土'[d.getUTCDay()]}）`, v);
    const tk = b.therapist_id == null ? 'free' : String(b.therapist_id);
    bump(maps.th, tk, b.therapist_id == null ? 'フリー（担当未定）' : (tName.get(Number(b.therapist_id)) || '(不明)'), v);
    const sk = String(b.source ?? '') === 'web' ? 'web' : 'manual';
    bump(maps.src, sk, sk === 'web' ? 'ネット予約（フクエス）' : '予約ボード・CRM（電話など）', v);
    bump(maps.hour, String(hour), hour >= 24 ? `翌${hour - 24}時台` : `${hour}時台`, v);
  }

  // 新規／リピート（人数）：その月より前に利用（キャンセル以外）があればリピート
  const people = [...new Set(custInMonth)];
  let repeatPeople = 0;
  if (people.length > 0) {
    const before = new Set<number>();
    for (let i = 0; i < people.length; i += 300) {
      const chunk = people.slice(i, i + 300);
      const { data } = await svc
        .from('salon_bookings').select('customer_id')
        .eq('salon_id', salonId).in('customer_id', chunk)
        .neq('status', 'cancelled').lt('slot_start', new Date(startMs).toISOString()).limit(5000);
      (data ?? []).forEach((r) => before.add(Number(r.customer_id)));
    }
    // 月の中で2回以上来た人もリピート
    const cnt = new Map<number, number>();
    custInMonth.forEach((c) => cnt.set(c, (cnt.get(c) ?? 0) + 1));
    repeatPeople = people.filter((p) => before.has(p) || (cnt.get(p) ?? 0) >= 2).length;
  }

  const sortSales = (a: Row, b: Row) => b.sales - a.sales || b.count - a.count;
  return {
    ok: true,
    stats: {
      ym,
      total,
      customers: { people: people.length, newPeople: people.length - repeatPeople, repeatPeople, noTel },
      byDay: [...maps.day.values()].sort((a, b) => a.key.localeCompare(b.key)),
      byTherapist: [...maps.th.values()].sort(sortSales),
      bySource: [...maps.src.values()].sort(sortSales),
      byHour: [...maps.hour.values()].sort((a, b) => Number(a.key) - Number(b.key)),
    },
  };
}

/** プレイ状況を変える（'' ＝ 予約だけ／address_sent ＝ 住所送済／entered ＝ 入室済）（第544便） */
export async function setCrmPlayStatus(
  salonId: number,
  bookingId: string,
  playStatus: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!['', 'address_sent', 'entered'].includes(String(playStatus))) return { ok: false, error: '状況が不正です' };
  const { data, error } = await auth.svc
    .from('salon_bookings').update({ play_status: playStatus })
    .eq('salon_id', salonId).eq('id', bookingId).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: '予約が見つかりません' };
  return { ok: true };
}

/** 受領を変える（'' ＝ 未受領／therapist ＝ 女子が受領／shop ＝ お店が受領）（第554便） */
export async function setCrmReceived(
  salonId: number,
  bookingId: string,
  receivedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!(CRM_RECEIVED as readonly string[]).includes(String(receivedBy))) return { ok: false, error: '受領の値が不正です' };
  const { data, error } = await auth.svc
    .from('salon_bookings')
    .update({ received_by: receivedBy, received_at: receivedBy ? new Date().toISOString() : null })
    .eq('salon_id', salonId).eq('id', bookingId).neq('status', 'cancelled').select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: '予約が見つかりません（キャンセルの予約は受領にできません）' };
  return { ok: true };
}

// ── 設定と「受まで／上がり」（第548便）──────────────────
async function readSettings(svc: Svc, salonId: number): Promise<CrmSettings> {
  const { data } = await svc
    .from('crm_settings').select('day_start_min, day_end_min, default_end_type, rooms, room_colors, alarms, consent_enabled, consent_title, consent_body, cast_pay_enabled, custom_toggles').eq('salon_id', salonId).maybeSingle();
  if (!data) return { ...CRM_DEFAULT_SETTINGS, alarms: normalizeCrmAlarms(null) };
  return {
    dayStartMin: Number(data.day_start_min) || CRM_DEFAULT_SETTINGS.dayStartMin,
    dayEndMin: Number(data.day_end_min) || CRM_DEFAULT_SETTINGS.dayEndMin,
    defaultEndType: data.default_end_type === 'accept' ? 'accept' : 'finish',
    rooms: Array.isArray(data.rooms) ? (data.rooms as unknown[]).map(String) : [],
    roomColors: data.room_colors && typeof data.room_colors === 'object' && !Array.isArray(data.room_colors)
      ? Object.fromEntries(Object.entries(data.room_colors as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : {},
    alarms: normalizeCrmAlarms(data.alarms),
    consentEnabled: Boolean(data.consent_enabled),
    consentTitle: String(data.consent_title ?? ''),
    consentBody: String(data.consent_body ?? ''),
    castPayEnabled: Boolean(data.cast_pay_enabled),
    customToggles: normalizeCrmToggles(data.custom_toggles),
  };
}

async function readWorkEnds(svc: Svc, salonId: number, dateISO: string): Promise<Record<number, CrmEndType>> {
  if (!validDate(dateISO)) return {};
  const { data } = await svc
    .from('crm_work_ends').select('therapist_id, end_type').eq('salon_id', salonId).eq('business_date', dateISO);
  const out: Record<number, CrmEndType> = {};
  for (const r of data ?? []) out[Number(r.therapist_id)] = r.end_type === 'accept' ? 'accept' : 'finish';
  return out;
}

export async function getCrmSettings(
  salonId: number,
): Promise<{ ok: true; settings: CrmSettings } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  return { ok: true, settings: await readSettings(auth.svc, salonId) };
}

export async function saveCrmSettings(
  salonId: number,
  settings: CrmSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const start = Math.round(Number(settings.dayStartMin));
  const end = Math.round(Number(settings.dayEndMin));
  if (!(start >= 360 && start <= 1800)) return { ok: false, error: '開始時刻は 6:00〜翌6:00 で選んでください' };
  if (!(end >= 420 && end <= 1860)) return { ok: false, error: '終了時刻は 7:00〜翌7:00 で選んでください' };
  if (end <= start) return { ok: false, error: '終了時刻は開始時刻より後にしてください' };
  const rooms = [...new Set((settings.rooms ?? []).map((r) => String(r).trim()).filter(Boolean))];
  if (rooms.length > 50) return { ok: false, error: '待機場所は50件までです' };
  if (rooms.some((r) => r.length > 30)) return { ok: false, error: '待機場所の名前は30文字までです' };
  const rawAlarms = Array.isArray(settings.alarms) ? settings.alarms : [];
  if (rawAlarms.length > 10) return { ok: false, error: 'アラームは10件までです' };
  if (rawAlarms.some((a) => !(Number(a.sec) >= 5 && Number(a.sec) <= 300))) return { ok: false, error: 'アラームの秒数は5〜300秒で入れてください' };
  if (rawAlarms.some((a) => !(Number(a.min) >= 0 && Number(a.min) <= 120))) return { ok: false, error: 'アラームの「○分前」は0〜120分で入れてください' };
  const consentTitle = String(settings.consentTitle ?? '').trim();
  const consentBody = String(settings.consentBody ?? '').replace(/\r\n/g, '\n');
  if (consentTitle.length > 60) return { ok: false, error: '同意書の題名は60文字までです' };
  if (consentBody.length > 8000) return { ok: false, error: '同意書の本文は8000文字までです' };
  if (settings.consentEnabled && !consentBody.trim()) return { ok: false, error: '同意書を使うときは本文を入れてください' };
  // 自由項目（第597便）
  const rawToggles = Array.isArray(settings.customToggles) ? settings.customToggles : [];
  if (rawToggles.length > CRM_TOGGLE_MAX) return { ok: false, error: `出勤情報の項目は${CRM_TOGGLE_MAX}つまでです` };
  for (const t of rawToggles) {
    const title = String(t?.title ?? '').trim();
    const opts = (Array.isArray(t?.options) ? t.options : []).map((x) => String(x).trim()).filter(Boolean);
    if (!title) return { ok: false, error: '出勤情報の項目に題名を入れてください' };
    if (title.length > CRM_TOGGLE_TITLE_LEN) return { ok: false, error: `項目の題名は${CRM_TOGGLE_TITLE_LEN}文字までです` };
    if (opts.length === 0) return { ok: false, error: `「${title}」に選択肢を1つ以上入れてください` };
    if (opts.length > CRM_TOGGLE_OPTION_MAX) return { ok: false, error: `選択肢は1つの項目に${CRM_TOGGLE_OPTION_MAX}個までです` };
    if (opts.some((o) => o.length > CRM_TOGGLE_OPTION_LEN)) return { ok: false, error: `選択肢は${CRM_TOGGLE_OPTION_LEN}文字までです` };
  }
  const customToggles = normalizeCrmToggles(rawToggles);
  const allowed = new Set(CRM_ROOM_COLORS.map((c) => c.key));
  const roomColors: Record<string, string> = {};
  for (const r of rooms) {
    const c = settings.roomColors?.[r];
    if (c && allowed.has(c)) roomColors[r] = c;
  }
  const { error } = await auth.svc.from('crm_settings').upsert({
    salon_id: salonId,
    day_start_min: start,
    day_end_min: end,
    default_end_type: settings.defaultEndType === 'accept' ? 'accept' : 'finish',
    rooms,
    room_colors: roomColors,
    alarms: normalizeCrmAlarms(rawAlarms),
    consent_enabled: !!settings.consentEnabled,
    consent_title: consentTitle,
    consent_body: consentBody,
    cast_pay_enabled: !!settings.castPayEnabled,
    custom_toggles: customToggles,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** その日のそのセラピストの「受まで／上がり」を決める */
export async function setCrmWorkEnd(
  salonId: number,
  therapistId: number,
  dateISO: string,
  endType: CrmEndType,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  if (endType !== 'accept' && endType !== 'finish') return { ok: false, error: '種類が不正です' };
  const { data: t } = await auth.svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };
  const { error } = await auth.svc.from('crm_work_ends').upsert({
    salon_id: salonId, therapist_id: therapistId, business_date: dateISO, end_type: endType,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── 出勤情報（第550便）──────────────────────────────
// ★ 出勤の開始・終了時刻はここでは変えない（therapist_schedules はサイトと媒体の元・カッキーさんの決定）。
async function readWorkDays(svc: Svc, salonId: number, dateISO: string): Promise<Record<number, CrmWorkDay>> {
  if (!validDate(dateISO)) return {};
  const { data } = await svc
    .from('crm_work_days')
    .select('therapist_id, break_start_min, break_end_min, break_memo, room, attendance, transport, toggle_values')
    .eq('salon_id', salonId).eq('business_date', dateISO);
  const out: Record<number, CrmWorkDay> = {};
  for (const r of data ?? []) {
    out[Number(r.therapist_id)] = {
      breakStartMin: r.break_start_min == null ? null : Number(r.break_start_min),
      breakEndMin: r.break_end_min == null ? null : Number(r.break_end_min),
      breakMemo: String(r.break_memo ?? ''),
      room: String(r.room ?? ''),
      attendance: (['late', 'absent', 'sent_home'].includes(String(r.attendance)) ? r.attendance : '') as CrmAttendance,
      transport: Number(r.transport) || 0,
      toggles: readToggleValues(r.toggle_values),
    };
  }
  return out;
}

/** crm_work_days.toggle_values を { id: 選択肢 } に整える（第597便） */
function readToggleValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z0-9]{1,12}$/.test(k) && typeof v === 'string' && v) out[k] = v.slice(0, CRM_TOGGLE_OPTION_LEN);
  }
  return out;
}

export async function saveCrmWorkDay(
  salonId: number,
  therapistId: number,
  dateISO: string,
  wd: CrmWorkDay,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  const { data: t } = await auth.svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };
  const bs = wd.breakStartMin == null ? null : Math.round(Number(wd.breakStartMin));
  const be = wd.breakEndMin == null ? null : Math.round(Number(wd.breakEndMin));
  if ((bs == null) !== (be == null)) return { ok: false, error: '休憩は開始と終了の両方を選んでください' };
  if (bs != null && be != null) {
    if (bs < 0 || be > 1860) return { ok: false, error: '休憩の時刻が不正です' };
    if (be <= bs) return { ok: false, error: '休憩の終了は開始より後にしてください' };
  }
  const memo = String(wd.breakMemo ?? '').trim();
  const room = String(wd.room ?? '').trim();
  const transport = Math.round(Number(wd.transport) || 0);
  if (memo.length > 100) return { ok: false, error: '休憩メモは100文字までです' };
  if (room.length > 30) return { ok: false, error: '待機場所が長すぎます' };
  if (transport < 0 || transport > 100000) return { ok: false, error: '交通費は0〜100,000円で入れてください' };
  const attendance = ['late', 'absent', 'sent_home'].includes(String(wd.attendance)) ? wd.attendance : '';
  // 自由項目（第597便）：いまの設定にある項目・選択肢だけを保存する
  const toggleDefs = (await readSettings(auth.svc, salonId)).customToggles;
  const toggleValues: Record<string, string> = {};
  for (const t of toggleDefs) {
    const v = wd.toggles?.[t.id];
    if (v && t.options.includes(v)) toggleValues[t.id] = v;
  }
  // ★ 同じ部屋で、出勤の時間がほかの人と重なるなら保存しない（第553便）
  if (room) {
    const clash = await roomClash(auth.svc, salonId, therapistId, dateISO, room);
    if (clash) return { ok: false, error: clash };
  }
  const { error } = await auth.svc.from('crm_work_days').upsert({
    salon_id: salonId, therapist_id: therapistId, business_date: dateISO,
    break_start_min: bs, break_end_min: be, break_memo: memo, room, attendance, transport,
    toggle_values: toggleValues,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * 同じ部屋を同じ時間に使う人がいないか（第553便）。
 * ★ その営業日にその部屋を選んでいるほかのセラピストの出勤（therapist_schedules）と、この人の出勤が重なれば文を返す。
 * ★ 出勤が無い人どうしは比べられないので止めない。
 */
async function roomClash(svc: Svc, salonId: number, therapistId: number, dateISO: string, room: string): Promise<string | null> {
  const { data: others } = await svc
    .from('crm_work_days').select('therapist_id')
    .eq('salon_id', salonId).eq('business_date', dateISO).eq('room', room)
    .neq('therapist_id', therapistId);
  const otherIds = (others ?? []).map((o) => Number(o.therapist_id));
  if (otherIds.length === 0) return null;
  const ids = [therapistId, ...otherIds];
  const { data: sch } = await svc
    .from('therapist_schedules')
    .select('therapist_id, start_time, end_time')
    .in('therapist_id', ids).eq('schedule_date', dateISO).eq('is_active', true);
  const win = new Map<number, Array<{ s: number; e: number; label: string }>>();
  for (const r of sch ?? []) {
    if (!r.start_time || !r.end_time) continue;
    const start = String(r.start_time).slice(0, 5);
    const end = String(r.end_time).slice(0, 5);
    const { startUtc, endUtc } = scheduleWindowUtc(dateISO, start, end);
    const list = win.get(Number(r.therapist_id)) ?? [];
    list.push({ s: startUtc.getTime(), e: endUtc.getTime(), label: `${start}-${end}` });
    win.set(Number(r.therapist_id), list);
  }
  const mine = win.get(therapistId) ?? [];
  if (mine.length === 0) return null;
  for (const oid of otherIds) {
    for (const o of win.get(oid) ?? []) {
      if (mine.some((m) => m.s < o.e && m.e > o.s)) {
        const { data: t } = await svc.from('therapists').select('name').eq('id', oid).maybeSingle();
        return `${room} は ${String(t?.name ?? 'ほかの人')} さん（${o.label}）が使っています。時間が重なるので選べません`;
      }
    }
  }
  return null;
}

// ── 金銭授受（第558便・2026-09-20）──────────────────────
// ★ 表（crm_money_moves）には「動き」だけを持ち、残高はここで毎回計算する（types.ts の式）。
// ★ 報酬：報酬確定した日は確定の数字（手当込み）、まだの日は予約の報酬の合計（見込み）。

/** slot_start（UTC ISO）→ 営業日（朝6時区切り・JST） */
function businessDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
}

type MoneyAgg = { received: number; pay: number; toShop: number; toTherapist: number };
const emptyAgg = (): MoneyAgg => ({ received: 0, pay: 0, toShop: 0, toTherapist: 0 });

/** 1000行ずつ全部読む（PostgREST の上限対策） */
async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data } = await fetchPage(from, from + 999);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function toMove(r: Record<string, unknown>, names: Map<number, string>): CrmMoneyMove {
  const tid = Number(r.therapist_id);
  return {
    id: Number(r.id),
    therapistId: tid,
    therapistName: names.get(tid) ?? '(不明)',
    date: String(r.business_date),
    direction: r.direction === 'to_therapist' ? 'to_therapist' : 'to_shop',
    category: (CRM_MONEY_CATEGORIES as readonly string[]).includes(String(r.category)) ? (r.category as CrmMoneyCategory) : 'other',
    amount: Number(r.amount) || 0,
    memo: String(r.memo ?? ''),
    createdAt: String(r.created_at),
    cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
  };
}

async function therapistNames(svc: Svc, salonId: number): Promise<Map<number, string>> {
  const { data } = await svc.from('therapists').select('id, name').eq('salon_id', salonId);
  return new Map((data ?? []).map((t) => [Number(t.id), String(t.name ?? '')]));
}

/**
 * 女子ごと×営業日ごとの受領・報酬・動きを集める。
 * filter: therapistId を絞る／untilDate（この日まで・含む）。
 */
async function moneyByDay(
  svc: Svc,
  salonId: number,
  opt: { therapistId?: number; untilDate?: string } = {},
): Promise<Map<number, Map<string, MoneyAgg>>> {
  const untilEnd = opt.untilDate ? businessWindow(opt.untilDate).endISO : null;
  const bookings = await readAll<Record<string, unknown>>((from, to) => {
    let q = svc.from('salon_bookings')
      .select('therapist_id, price_total, pay_total, received_by, slot_start')
      .eq('salon_id', salonId)
      .neq('status', 'cancelled')
      .not('therapist_id', 'is', null)
      .or('price_total.not.is.null,pay_total.not.is.null');
    if (opt.therapistId) q = q.eq('therapist_id', opt.therapistId);
    if (untilEnd) q = q.lt('slot_start', untilEnd);
    return q.order('slot_start').range(from, to);
  });
  const confirms = await readAll<Record<string, unknown>>((from, to) => {
    let q = svc.from('crm_pay_confirms').select('therapist_id, business_date, pay_total, allowance').eq('salon_id', salonId);
    if (opt.therapistId) q = q.eq('therapist_id', opt.therapistId);
    if (opt.untilDate) q = q.lte('business_date', opt.untilDate);
    return q.order('business_date').range(from, to);
  });
  const moves = await readAll<Record<string, unknown>>((from, to) => {
    let q = svc.from('crm_money_moves').select('therapist_id, business_date, direction, amount')
      .eq('salon_id', salonId).is('cancelled_at', null);
    if (opt.therapistId) q = q.eq('therapist_id', opt.therapistId);
    if (opt.untilDate) q = q.lte('business_date', opt.untilDate);
    return q.order('id').range(from, to);
  });

  const out = new Map<number, Map<string, MoneyAgg>>();
  const cell = (tid: number, date: string) => {
    let m = out.get(tid);
    if (!m) { m = new Map(); out.set(tid, m); }
    let a = m.get(date);
    if (!a) { a = emptyAgg(); m.set(date, a); }
    return a;
  };
  const confirmed = new Map<string, number>();
  for (const c of confirms) {
    confirmed.set(`${Number(c.therapist_id)}|${String(c.business_date)}`, (Number(c.pay_total) || 0) + (Number(c.allowance) || 0));
  }
  for (const b of bookings) {
    const tid = Number(b.therapist_id);
    const date = businessDateOf(String(b.slot_start));
    const a = cell(tid, date);
    if (b.received_by === 'therapist') a.received += Number(b.price_total) || 0;
    if (!confirmed.has(`${tid}|${date}`)) a.pay += Number(b.pay_total) || 0;
  }
  for (const [key, pay] of confirmed) {
    const [tid, date] = key.split('|');
    cell(Number(tid), date).pay += pay;
  }
  for (const mv of moves) {
    const a = cell(Number(mv.therapist_id), String(mv.business_date));
    if (mv.direction === 'to_therapist') a.toTherapist += Number(mv.amount) || 0;
    else a.toShop += Number(mv.amount) || 0;
  }
  return out;
}

const aggBalance = (a: MoneyAgg) => a.received - a.pay - a.toShop + a.toTherapist;

/** 金銭授受タブ：女子ごとの残高（通算）と、月の動き（ym は YYYY-MM） */
export async function getCrmMoney(
  salonId: number,
  ym: string,
): Promise<{ ok: true; balances: CrmMoneyBalance[]; moves: CrmMoneyMove[]; therapists: { id: number; name: string }[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: '月が不正です' };
  const svc = auth.svc;
  const [names, byDay] = await Promise.all([therapistNames(svc, salonId), moneyByDay(svc, salonId)]);
  const balances: CrmMoneyBalance[] = [];
  for (const [tid, days] of byDay) {
    const t = emptyAgg();
    for (const a of days.values()) { t.received += a.received; t.pay += a.pay; t.toShop += a.toShop; t.toTherapist += a.toTherapist; }
    balances.push({ therapistId: tid, name: names.get(tid) ?? '(不明)', ...t, balance: aggBalance(t) });
  }
  balances.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name, 'ja'));

  const [y, m] = ym.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { data: mv } = await svc.from('crm_money_moves')
    .select('id, therapist_id, business_date, direction, category, amount, memo, created_at, cancelled_at')
    .eq('salon_id', salonId).gte('business_date', `${ym}-01`).lt('business_date', next)
    .order('business_date', { ascending: false }).order('id', { ascending: false }).limit(1000);
  const { data: ts } = await svc.from('therapists').select('id, name, is_active').eq('salon_id', salonId).order('id');
  return {
    ok: true,
    balances,
    moves: (mv ?? []).map((r) => toMove(r, names)),
    therapists: (ts ?? []).filter((t) => t.is_active !== false).map((t) => ({ id: Number(t.id), name: String(t.name ?? '') })),
  };
}

/** 報酬確定の画面の「精算」欄 */
export async function getCrmMoneyDay(
  salonId: number,
  therapistId: number,
  dateISO: string,
): Promise<{ ok: true; day: CrmMoneyDay } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO) || !Number.isInteger(therapistId)) return { ok: false, error: '指定が不正です' };
  const svc = auth.svc;
  const [byDay, names, { data: conf }, { data: mv }] = await Promise.all([
    moneyByDay(svc, salonId, { therapistId, untilDate: dateISO }),
    therapistNames(svc, salonId),
    svc.from('crm_pay_confirms').select('therapist_id').eq('salon_id', salonId).eq('therapist_id', therapistId).eq('business_date', dateISO).maybeSingle(),
    svc.from('crm_money_moves')
      .select('id, therapist_id, business_date, direction, category, amount, memo, created_at, cancelled_at')
      .eq('salon_id', salonId).eq('therapist_id', therapistId).eq('business_date', dateISO).order('id'),
  ]);
  const days = byDay.get(therapistId) ?? new Map<string, MoneyAgg>();
  let prior = 0;
  for (const [d, a] of days) if (d < dateISO) prior += aggBalance(a);
  const today = days.get(dateISO) ?? emptyAgg();
  return {
    ok: true,
    day: {
      prior,
      received: today.received,
      pay: today.pay,
      payConfirmed: !!conf,
      moves: (mv ?? []).map((r) => toMove(r, names)),
      balance: prior + aggBalance(today),
    },
  };
}

/** お金の動きを1件足す */
export async function addCrmMoneyMove(
  salonId: number,
  input: { therapistId: number; date: string; direction: string; category: string; amount: number; memo: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const tid = Number(input.therapistId);
  if (!Number.isInteger(tid) || tid <= 0) return { ok: false, error: 'セラピストを選んでください' };
  if (!validDate(String(input.date))) return { ok: false, error: '日付が不正です' };
  if (!(CRM_MONEY_DIRECTIONS as readonly string[]).includes(String(input.direction))) return { ok: false, error: '渡す向きが不正です' };
  if (!(CRM_MONEY_CATEGORIES as readonly string[]).includes(String(input.category))) return { ok: false, error: '種別が不正です' };
  const amount = Math.round(Number(input.amount) || 0);
  if (amount < 1 || amount > 10000000) return { ok: false, error: '金額は1円以上で入れてください' };
  const { data: t } = await auth.svc.from('therapists').select('salon_id').eq('id', tid).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'このお店のセラピストではありません' };
  const { error } = await auth.svc.from('crm_money_moves').insert({
    salon_id: salonId,
    therapist_id: tid,
    business_date: input.date,
    direction: input.direction,
    category: input.category,
    amount,
    memo: String(input.memo ?? '').trim().slice(0, 200),
    created_by: auth.userId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** お金の動きを取り消す（消さずに取り消した時刻を入れる） */
export async function cancelCrmMoneyMove(
  salonId: number,
  moveId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc.from('crm_money_moves')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('salon_id', salonId).eq('id', moveId).is('cancelled_at', null).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: '見つからないか、もう取り消してあります' };
  return { ok: true };
}

// ── 来店時の同意書（第560便・2026-09-20）──────────────────
// ★ 公開側（QR から開くページ）は actions/consent.ts。ここはオーナー（CRM）側。

/**
 * 部屋の QR（第560便・第561便）。使える QR はいつも1つ（token）。一つ前（prev_token）は使えないが戻せる。
 *   get：無ければ作る／regenerate：作り直す（今のを一つ前に）／revert：一つ前と入れ替える
 */
export async function getCrmRoomQr(
  salonId: number,
  room: string,
  action: 'get' | 'regenerate' | 'revert' = 'get',
): Promise<{ ok: true; url: string; createdAt: string; prevCreatedAt: string | null } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const r = String(room ?? '').trim();
  if (!r || r.length > 30) return { ok: false, error: '部屋が不正です' };
  const st = await readSettings(auth.svc, salonId);
  if (!st.rooms.includes(r)) return { ok: false, error: 'この部屋は設定にありません（保存してからもう一度）' };
  const { data: cur } = await auth.svc
    .from('crm_room_tokens').select('token, created_at, prev_token, prev_created_at')
    .eq('salon_id', salonId).eq('room', r).maybeSingle();
  const newToken = async () => (await import('node:crypto')).randomBytes(18).toString('base64url');
  let row = cur
    ? { token: String(cur.token), created_at: String(cur.created_at), prev_token: cur.prev_token ? String(cur.prev_token) : null, prev_created_at: cur.prev_created_at ? String(cur.prev_created_at) : null }
    : null;

  if (!row || action === 'regenerate') {
    row = {
      token: await newToken(),
      created_at: new Date().toISOString(),
      prev_token: row?.token ?? null,
      prev_created_at: row?.created_at ?? null,
    };
  } else if (action === 'revert') {
    if (!row.prev_token || !row.prev_created_at) return { ok: false, error: '一つ前の QR はありません' };
    row = { token: row.prev_token, created_at: row.prev_created_at, prev_token: row.token, prev_created_at: row.created_at };
  }
  if (!cur || action !== 'get') {
    // 入れ替えのとき unique にぶつからないよう、先に prev を空にしてから書く
    if (cur) await auth.svc.from('crm_room_tokens').update({ prev_token: null }).eq('salon_id', salonId).eq('room', r);
    const { error } = await auth.svc.from('crm_room_tokens').upsert({ salon_id: salonId, room: r, ...row });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, url: `https://fukues.com/g/${row.token}`, createdAt: row.created_at, prevCreatedAt: row.prev_created_at };
}

/** 予約の同意書（新しい順・サインし直した古いものも含む） */
export async function getCrmBookingConsents(
  salonId: number,
  bookingId: string,
): Promise<{ ok: true; consents: CrmConsent[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc
    .from('crm_consents')
    .select('id, created_at, room, agreed_title, agreed_body, signature_png, superseded_at, user_agent')
    .eq('salon_id', salonId).eq('booking_id', bookingId)
    .order('created_at', { ascending: false }).limit(20);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    consents: (data ?? []).map((r) => ({
      id: Number(r.id),
      createdAt: String(r.created_at),
      room: String(r.room ?? ''),
      title: String(r.agreed_title ?? ''),
      body: String(r.agreed_body ?? ''),
      signaturePng: String(r.signature_png ?? ''),
      superseded: !!r.superseded_at,
      manual: String(r.user_agent ?? '').startsWith(CONSENT_MANUAL_UA),
      manualByAdmin: String(r.user_agent ?? '') === CONSENT_MANUAL_UA + ':admin',
    })),
  };
}

// ── 同意書を紙でもらったとき（第639便・2026-09-22・カッキーさんの指示）──────────────────
// ★ QR のサインと同じ表（crm_consents）に1行足す。★ 表の形は変えない：signature_png は空・user_agent に目印を入れる。
//   user_agent = 'manual'（店舗）／'manual:admin'（運営が押した）。★ 画面では「手動（紙で受け取り）」と出す。
// ★ 取り消しは消さずに superseded_at を入れる（サインし直しと同じ）。★ 取り消せるのは手動のものだけ（QR のサインは消させない）。
const CONSENT_MANUAL_UA = 'manual';

export async function markCrmConsentManual(
  salonId: number,
  bookingId: string,
): Promise<{ ok: true; consentAt: string } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data: b } = await auth.svc
    .from('salon_bookings').select('id, salon_id, slot_start, therapist_id, status')
    .eq('id', bookingId).maybeSingle();
  if (!b || Number(b.salon_id) !== salonId) return { ok: false, error: '予約が見つかりません' };
  if (b.status === 'cancelled') return { ok: false, error: 'キャンセルの予約には付けられません' };
  const { count } = await auth.svc
    .from('crm_consents').select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId).eq('booking_id', bookingId).is('superseded_at', null);
  if ((count ?? 0) > 0) return { ok: false, error: 'もう了承済みです（画面を開き直してください）' };
  const { data: st } = await auth.svc.from('crm_settings').select('consent_title, consent_body').eq('salon_id', salonId).maybeSingle();
  // 部屋：その日のセラピストの待機場所（分かれば）
  const businessDate = businessDateNowJST(new Date(String(b.slot_start)).getTime());
  let room = '';
  if (b.therapist_id != null) {
    const { data: wd } = await auth.svc.from('crm_work_days').select('room')
      .eq('salon_id', salonId).eq('therapist_id', b.therapist_id).eq('business_date', businessDate).maybeSingle();
    room = String(wd?.room ?? '');
  }
  const { data: ins, error } = await auth.svc.from('crm_consents').insert({
    salon_id: salonId,
    booking_id: bookingId,
    room,
    therapist_id: b.therapist_id ?? null,
    business_date: businessDate,
    agreed_title: String(st?.consent_title ?? ''),
    agreed_body: String(st?.consent_body ?? ''),
    signature_png: '',
    user_agent: auth.userId === ADMIN_UUID ? CONSENT_MANUAL_UA + ':admin' : CONSENT_MANUAL_UA,
  }).select('created_at').single();
  if (error || !ins) return { ok: false, error: error?.message ?? '保存できませんでした' };
  return { ok: true, consentAt: String(ins.created_at) };
}

export async function revokeCrmConsentManual(
  salonId: number,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc.from('crm_consents')
    .update({ superseded_at: new Date().toISOString() })
    .eq('salon_id', salonId).eq('booking_id', bookingId).is('superseded_at', null)
    .like('user_agent', CONSENT_MANUAL_UA + '%')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: '取り消せる手動の了承がありません（QR のサインは取り消せません）' };
  return { ok: true };
}

// ── 顧客の取り込み（第566便・2026-09-20）──────────────────
// ★ スマホの連絡先（.vcf）・CSV から読んだ「名前・電話番号」を台帳に入れる（読むのはブラウザ・lib/crm/importParse.ts）。
// ★ 電話番号で名寄せする：もう台帳にいる番号の人は新しく作らない（名前が空なら名前だけ入れる・足りない番号を足す）。
// ★ 電話番号が無い（形が違う）行は取り込まない（名寄せできないため）。

const IMPORT_MAX = 3000;
export type CrmImportStatus = 'new' | 'exists' | 'dup' | 'invalid';
export type CrmImportPreviewRow = { name: string; phones: string[]; status: CrmImportStatus; existingName: string };

function cleanImportRows(rows: { name: string; phones: string[] }[]) {
  return (rows ?? []).slice(0, IMPORT_MAX).map((r) => ({
    name: String(r?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    phones: [...new Set((Array.isArray(r?.phones) ? r.phones : []).map((p) => String(p).replace(/[^0-9]/g, '')).filter((p) => /^\d{10,13}$/.test(p)))].slice(0, 5),
  }));
}

async function phoneOwners(svc: Svc, salonId: number, phones: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(phones)];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await svc.from('salon_customer_phones').select('phone, customer_id').eq('salon_id', salonId).in('phone', uniq.slice(i, i + 300));
    (data ?? []).forEach((d) => out.set(String(d.phone), Number(d.customer_id)));
  }
  return out;
}

async function classifyImport(svc: Svc, salonId: number, rows: { name: string; phones: string[] }[]) {
  const owners = await phoneOwners(svc, salonId, rows.flatMap((r) => r.phones));
  const ids = [...new Set([...owners.values()])];
  const names = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await svc.from('salon_customers').select('id, name').eq('salon_id', salonId).in('id', ids.slice(i, i + 300));
    (data ?? []).forEach((c) => names.set(Number(c.id), String(c.name ?? '')));
  }
  const seen = new Set<string>();
  return rows.map((r) => {
    let status: CrmImportStatus = 'new';
    let existingId: number | null = null;
    if (r.phones.length === 0) status = 'invalid';
    else if (r.phones.some((p) => seen.has(p))) status = 'dup';
    else {
      const hit = r.phones.find((p) => owners.has(p));
      if (hit) { status = 'exists'; existingId = owners.get(hit)!; }
    }
    r.phones.forEach((p) => seen.add(p));
    return { ...r, status, existingId, existingName: existingId != null ? names.get(existingId) ?? '' : '' };
  });
}

/** 取り込む前の確認（新規／もう台帳にいる／ファイルの中で重複／番号なし） */
export async function previewCrmImport(
  salonId: number,
  rows: { name: string; phones: string[] }[],
): Promise<{ ok: true; rows: CrmImportPreviewRow[]; truncated: boolean } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const clean = cleanImportRows(rows);
  const res = await classifyImport(auth.svc, salonId, clean);
  return {
    ok: true,
    truncated: (rows ?? []).length > IMPORT_MAX,
    rows: res.map((r) => ({ name: r.name, phones: r.phones, status: r.status, existingName: r.existingName })),
  };
}

/** 取り込む（画面でチェックが入っている行だけ送る） */
export async function importCrmCustomers(
  salonId: number,
  rows: { name: string; phones: string[] }[],
): Promise<{ ok: true; created: number; updated: number; skipped: number } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const res = await classifyImport(svc, salonId, cleanImportRows(rows));
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // 新規：まとめて作る（200人ずつ）
  const news = res.filter((r) => r.status === 'new');
  for (let i = 0; i < news.length; i += 200) {
    const chunk = news.slice(i, i + 200);
    const now = new Date().toISOString();
    const { data, error } = await svc.from('salon_customers')
      .insert(chunk.map((r) => ({ salon_id: salonId, name: r.name, updated_at: now })))
      .select('id');
    if (error || !data || data.length !== chunk.length) return { ok: false, error: `取り込みの途中で止まりました（${created}人まで登録済み）：${error?.message ?? ''}` };
    const phoneRows = chunk.flatMap((r, k) => r.phones.map((phone) => ({ customer_id: Number(data[k].id), salon_id: salonId, phone })));
    const { error: pErr } = await svc.from('salon_customer_phones').insert(phoneRows);
    if (pErr) {
      // まとめて入らなければ1件ずつ（その間に同じ番号が登録された等）
      for (const p of phoneRows) await svc.from('salon_customer_phones').insert(p);
    }
    created += chunk.length;
  }

  // もう台帳にいる人：名前が空なら入れる・足りない番号を足す（5件まで）
  for (const r of res.filter((x) => x.status === 'exists' && x.existingId != null)) {
    const id = r.existingId!;
    let changed = false;
    if (!r.existingName.trim() && r.name) {
      await svc.from('salon_customers').update({ name: r.name, updated_at: new Date().toISOString() }).eq('salon_id', salonId).eq('id', id);
      changed = true;
    }
    const { data: cur } = await svc.from('salon_customer_phones').select('phone').eq('customer_id', id);
    const have = new Set((cur ?? []).map((p) => String(p.phone)));
    const owners = await phoneOwners(svc, salonId, r.phones.filter((p) => !have.has(p)));
    const add = r.phones.filter((p) => !have.has(p) && !owners.has(p)).slice(0, Math.max(0, 5 - have.size));
    if (add.length > 0) {
      await svc.from('salon_customer_phones').insert(add.map((phone) => ({ customer_id: id, salon_id: salonId, phone })));
      changed = true;
    }
    if (changed) updated++; else skipped++;
  }
  skipped += res.filter((r) => r.status === 'dup' || r.status === 'invalid').length;
  return { ok: true, created, updated, skipped };
}

// ── 規約への同意・お客様の削除・書き出し（第569便・2026-09-20）──────────────

/** 今の版の規約・顧客データの取り扱いに同意する（オーナー本人だけ） */
export async function agreeCrmTerms(salonId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CRM_TERMS_VERSION) return { ok: true };
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const ua = ((await headers()).get('user-agent') ?? '').slice(0, 300);
  const { error } = await auth.svc.from('crm_terms_agreements')
    .upsert({ salon_id: salonId, version: CRM_TERMS_VERSION, agreed_by: auth.userId, user_agent: ua }, { onConflict: 'salon_id,version', ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * お客様を台帳から消す（お客様から削除を頼まれたときなど）。
 * その人の予約は名前「削除済み」・電話 0000000000・備考なしにし、その予約の同意書も消す（金額・日時は残す）。
 */
export async function deleteCrmCustomer(
  salonId: number,
  customerId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const { data: c } = await svc.from('salon_customers').select('id').eq('salon_id', salonId).eq('id', customerId).maybeSingle();
  if (!c) return { ok: false, error: 'お客様が見つかりません' };
  const ids = await readAll<Record<string, unknown>>((from, to) =>
    svc.from('salon_bookings').select('id').eq('salon_id', salonId).eq('customer_id', customerId).order('id').range(from, to));
  const bookingIds = ids.map((r) => String(r.id));
  for (let i = 0; i < bookingIds.length; i += 300) {
    const chunk = bookingIds.slice(i, i + 300);
    await svc.from('crm_consents').delete().eq('salon_id', salonId).in('booking_id', chunk);
    const { error } = await svc.from('salon_bookings')
      .update({ customer_name: '削除済み', customer_tel: '0000000000', note: null })
      .eq('salon_id', salonId).in('id', chunk);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await svc.from('salon_customers').delete().eq('salon_id', salonId).eq('id', customerId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
function jst(iso: unknown): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(String(iso)));
}

/** 店舗データの書き出し（CSV・Excel で開けるよう先頭に BOM を付けるのは画面側） */
export async function exportCrmCsv(
  salonId: number,
  kind: 'customers' | 'bookings',
): Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const names = await therapistNames(svc, salonId);
  if (kind === 'customers') {
    const cs = await readAll<Record<string, unknown>>((from, to) =>
      svc.from('salon_customers').select('id, name, name_kana, category, member_no, ng_therapist_ids, caution_memo, memo, created_at, updated_at')
        .eq('salon_id', salonId).order('id').range(from, to));
    const ph = await readAll<Record<string, unknown>>((from, to) =>
      svc.from('salon_customer_phones').select('customer_id, phone').eq('salon_id', salonId).order('id').range(from, to));
    const phones = new Map<number, string[]>();
    ph.forEach((p) => { const k = Number(p.customer_id); phones.set(k, [...(phones.get(k) ?? []), String(p.phone)]); });
    const label: Record<string, string> = { general: '一般', member: '会員', regular: '常連', vip: 'VIP', ng: 'NG' };
    const rows: unknown[][] = [['顧客ID', '名前', 'フリガナ', '電話番号', '分類', '会員番号', '女子NG', '要注意メモ', 'メモ', '登録日時', '更新日時']];
    cs.forEach((c) => rows.push([
      c.id, c.name, c.name_kana, (phones.get(Number(c.id)) ?? []).join(' / '), label[String(c.category)] ?? String(c.category),
      c.member_no, ((c.ng_therapist_ids as number[] | null) ?? []).map((id) => names.get(Number(id)) ?? id).join(' / '),
      c.caution_memo, c.memo, jst(c.created_at), jst(c.updated_at),
    ]));
    return { ok: true, csv: toCsv(rows), count: cs.length };
  }
  const bs = await readAll<Record<string, unknown>>((from, to) =>
    svc.from('salon_bookings')
      .select('id, slot_start, slot_end, therapist_id, course_name, customer_name, customer_tel, status, cancel_bad, price_total, pay_total, payment_method, received_by, source, note, customer_id')
      .eq('salon_id', salonId).order('slot_start').range(from, to));
  const st: Record<string, string> = { new: '未確定', confirmed: '確定', cancelled: 'キャンセル' };
  const rcv: Record<string, string> = { '': '', therapist: '女子が受領', shop: 'お店が受領' };
  const rows: unknown[][] = [['予約ID', '開始', '終了', '担当', 'コース', '名前', '電話番号', '状態', '悪質', '料金', '女子報酬', '支払い', '受領', '入り口', '備考', '顧客ID']];
  bs.forEach((b) => rows.push([
    b.id, jst(b.slot_start), jst(b.slot_end), b.therapist_id == null ? 'フリー' : names.get(Number(b.therapist_id)) ?? b.therapist_id,
    b.course_name, b.customer_name, b.customer_tel, st[String(b.status)] ?? b.status, b.cancel_bad ? '悪質' : '',
    b.price_total, b.pay_total, b.payment_method, rcv[String(b.received_by ?? '')] ?? '', b.source === 'web' ? 'フクエス' : '店で受付', b.note, b.customer_id,
  ]));
  return { ok: true, csv: toCsv(rows), count: bs.length };
}

// ── 予約一覧・検索（第571便・2026-09-20）─────────────────
const BOOKING_LIST_MAX = 1000;

/** 日付の範囲（営業日・最大1年）と条件で予約を探す。新しい順・1000件まで */
export async function searchCrmBookings(
  salonId: number,
  f: CrmBookingSearch,
): Promise<{ ok: true; rows: CrmBookingListRow[]; truncated: boolean } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(f.from) || !validDate(f.to) || f.from > f.to) return { ok: false, error: '日付の範囲が正しくありません' };
  const days = (new Date(`${f.to}T00:00:00Z`).getTime() - new Date(`${f.from}T00:00:00Z`).getTime()) / 86400000;
  if (days > 366) return { ok: false, error: '期間は1年以内にしてください' };
  const svc = auth.svc;
  let q = svc.from('salon_bookings')
    .select('id, slot_start, slot_end, therapist_id, course_name, customer_name, customer_tel, customer_id, status, cancel_bad, source, price_total, pay_total, received_by')
    .eq('salon_id', salonId)
    .gte('slot_start', businessWindow(f.from).startISO)
    .lt('slot_start', businessWindow(f.to).endISO);
  if (f.therapistId === 0) q = q.is('therapist_id', null);
  else if (f.therapistId) q = q.eq('therapist_id', f.therapistId);
  if (f.status === 'active') q = q.neq('status', 'cancelled');
  else if (f.status === 'unconfirmed') q = q.eq('status', 'new');
  else if (f.status === 'cancelled') q = q.eq('status', 'cancelled');
  else if (f.status === 'bad') q = q.eq('status', 'cancelled').eq('cancel_bad', true);
  if (f.source === 'web' || f.source === 'manual') q = q.eq('source', f.source);
  const text = String(f.q ?? '').trim().slice(0, 40);
  if (text) {
    const digits = normalizePhone(text).replace(/[^0-9]/g, '');
    if (digits.length >= 3 && digits.length === normalizePhone(text).length) q = q.ilike('customer_tel', `%${digits}%`);
    else q = q.ilike('customer_name', `%${text.replace(/[%_\\]/g, '')}%`);
  }
  const { data, error } = await q.order('slot_start', { ascending: false }).limit(BOOKING_LIST_MAX + 1);
  if (error) return { ok: false, error: error.message };
  const names = await therapistNames(svc, salonId);
  const rows = (data ?? []).slice(0, BOOKING_LIST_MAX).map((b) => ({
    id: String(b.id),
    slotStartISO: String(b.slot_start),
    slotEndISO: String(b.slot_end),
    therapistName: b.therapist_id == null ? 'フリー' : names.get(Number(b.therapist_id)) ?? '(不明)',
    courseName: String(b.course_name ?? ''),
    customerName: String(b.customer_name ?? ''),
    customerTel: String(b.customer_tel ?? ''),
    customerId: b.customer_id == null ? null : Number(b.customer_id),
    status: String(b.status),
    cancelBad: Boolean(b.cancel_bad),
    source: String(b.source ?? ''),
    priceTotal: b.price_total == null ? null : Number(b.price_total),
    payTotal: b.pay_total == null ? null : Number(b.pay_total),
    receivedBy: String(b.received_by ?? ''),
    consentAt: null as string | null,
  }));
  const cMap = await consentMap(svc, salonId, rows.map((r) => r.id));
  rows.forEach((r) => { r.consentAt = cMap.get(r.id) ?? null; });
  return { ok: true, rows, truncated: (data ?? []).length > BOOKING_LIST_MAX };
}

/** 予約ID → 有効な同意書の時刻（第574便） */
async function consentMap(svc: Svc, salonId: number, bookingIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < bookingIds.length; i += 300) {
    const { data } = await svc.from('crm_consents').select('booking_id, created_at')
      .eq('salon_id', salonId).is('superseded_at', null).in('booking_id', bookingIds.slice(i, i + 300));
    (data ?? []).forEach((c) => out.set(String(c.booking_id), String(c.created_at)));
  }
  return out;
}
