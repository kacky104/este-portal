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
  type CrmBookingItem,
  type CrmPriceItem,
  type CrmPriceKind,
  type CrmPayConfirm,
  type CrmDailyReport,
  type CrmDaySummary,
  CRM_PRICE_KINDS,
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
  type Extra = {
    customerId: number | null; cancelBad: boolean; source: string;
    items: CrmBookingItem[]; priceAdjust: number; payAdjust: number;
    priceTotal: number | null; payTotal: number | null; paymentMethod: string; playStatus: string;
  };
  const extra = new Map<string, Extra>();
  if (bookingIds.length > 0) {
    const { data } = await svc
      .from('salon_bookings')
      .select('id, customer_id, cancel_bad, source, crm_items, price_adjust, pay_adjust, price_total, pay_total, payment_method, play_status')
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
      });
    }
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

async function readPriceItems(svc: Svc, salonId: number): Promise<CrmPriceItem[]> {
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
  // ★ 予約は項目を写して持っているので、消しても過去の予約の金額は変わらない
  const { error } = await auth.svc.from('crm_price_items').delete().eq('salon_id', salonId).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * 公開のコースメニュー（salons.booking_courses）から、コースの名前・分数・料金を取り込む。
 * ★ 報酬は 0 で入る（あとで店が入れる）。★ 同じ名前・分数のコースがすでにあれば足さない。
 */
export async function importCrmCoursesFromMenu(
  salonId: number,
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const { data: salon } = await svc.from('salons').select('booking_courses').eq('id', salonId).maybeSingle();
  const raw = Array.isArray(salon?.booking_courses) ? (salon!.booking_courses as Record<string, unknown>[]) : [];
  const existing = await readPriceItems(svc, salonId);
  const have = new Set(existing.filter((e) => e.kind === 'course').map((e) => `${e.name}|${e.minutes}`));
  const rows: Array<Record<string, unknown>> = [];
  let sort = existing.filter((e) => e.kind === 'course').length;
  for (const c of raw) {
    const name = String(c?.name ?? '').trim().slice(0, 40);
    const minutes = Number(c?.duration_min) || 0;
    const price = parseInt(String(c?.price ?? '').replace(/[^0-9]/g, ''), 10) || 0;
    if (!name || have.has(`${name}|${minutes}`)) continue;
    have.add(`${name}|${minutes}`);
    rows.push({ salon_id: salonId, kind: 'course', name, minutes, price: Math.min(price, 1000000), pay: 0, sort: sort++, is_active: true });
  }
  if (rows.length > 0) {
    const { error } = await svc.from('crm_price_items').insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, added: rows.length };
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

type DayBooking = { therapistId: number | null; status: string; priceTotal: number; payTotal: number; paymentMethod: string };

async function readDayBookings(svc: Svc, salonId: number, dateISO: string): Promise<DayBooking[]> {
  const { startISO, endISO } = businessWindow(dateISO);
  const { data } = await svc
    .from('salon_bookings')
    .select('therapist_id, status, price_total, pay_total, payment_method')
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
