'use server';

import { normalizePhone } from '@/app/lib/validation/phone';
import { dbMessage } from '@/app/lib/crm/dbError';
import { type CrmBookingSearch, type CrmBookingListRow } from '@/app/lib/crm/types';
import { assertCrm, businessWindow, validDate, readFail, therapistNames, displayTel, consentMap } from '@/app/lib/crm/server/core';

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
  if (error) return { ok: false, error: dbMessage(error) };
  let names: Map<number, string>;
  try {
    names = await therapistNames(svc, salonId);
  } catch (e) {
    return readFail(e); // ★ 第1987便
  }
  const rows = (data ?? []).slice(0, BOOKING_LIST_MAX).map((b) => ({
    id: String(b.id),
    slotStartISO: String(b.slot_start),
    slotEndISO: String(b.slot_end),
    therapistName: b.therapist_id == null ? 'フリー' : names.get(Number(b.therapist_id)) ?? '(不明)',
    courseName: String(b.course_name ?? ''),
    customerName: String(b.customer_name ?? ''),
    customerTel: displayTel(b.customer_tel), // ★ 第1220便: 削除済み（0000000000）は出さない
    customerId: b.customer_id == null ? null : Number(b.customer_id),
    status: String(b.status),
    cancelBad: Boolean(b.cancel_bad),
    source: String(b.source ?? ''),
    priceTotal: b.price_total == null ? null : Number(b.price_total),
    payTotal: b.pay_total == null ? null : Number(b.pay_total),
    receivedBy: String(b.received_by ?? ''),
    consentAt: null as string | null,
  }));
  let cMap: Map<string, string>;
  try {
    cMap = await consentMap(svc, salonId, rows.map((r) => r.id));
  } catch (e) {
    return readFail(e); // ★ 第1987便（同意書の印を「無し」と出さない）
  }
  rows.forEach((r) => { r.consentAt = cMap.get(r.id) ?? null; });
  return { ok: true, rows, truncated: (data ?? []).length > BOOKING_LIST_MAX };
}
