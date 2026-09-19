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
import {
  toCrmCategory,
  type CrmAccess,
  type CrmBookingRow,
  type CrmCustomerDetail,
  type CrmCustomerRow,
  type CrmScheduleData,
  type CrmScheduleCustomer,
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
  return {
    ok: true,
    salonId: Number(data.id),
    salonName: (data.name as string | null) ?? '',
    crmUntil,
    active: isAdmin || isCrmActive(crmUntil),
    isAdmin,
  };
}

/** 有料CRMを使ってよいか確かめてから service_role を返す */
async function assertCrm(salonId: number): Promise<{ ok: true; svc: Svc } | { ok: false; error: string }> {
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
  return { ok: true, svc };
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

const LIST_COLS = 'id, name, name_kana, category, member_no, caution_memo';

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
      .or(`name.ilike.%${safe}%,name_kana.ilike.%${safe}%,member_no.ilike.%${safe}%`)
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
    })),
  };
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
  }));

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
  const extra = new Map<string, { customerId: number | null; cancelBad: boolean; source: string }>();
  if (bookingIds.length > 0) {
    const { data } = await svc
      .from('salon_bookings')
      .select('id, customer_id, cancel_bad, source')
      .eq('salon_id', salonId)
      .in('id', bookingIds);
    for (const r of data ?? []) {
      extra.set(String(r.id), {
        customerId: r.customer_id == null ? null : Number(r.customer_id),
        cancelBad: Boolean(r.cancel_bad),
        source: String(r.source ?? ''),
      });
    }
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
      therapists: therapists.map((t) => ({
        id: t.id,
        name: t.name,
        profileImageUrl: t.profileImageUrl,
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
        };
      }),
    },
  };
}
