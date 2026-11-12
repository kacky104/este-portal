'use server';

import { dbMessage } from '@/app/lib/crm/dbError';
import { pointsYenByBooking } from '@/app/lib/points/server';
import { type CrmDaySummary, isUnreceived, type CrmPaymentSplit, parsePaymentSplit } from '@/app/lib/crm/types';
import { type Svc, assertCrm, businessWindow, validDate, readFail, readConfirms, readReport, readMoneyOpts, aggBalance, moneyTotals } from '@/app/lib/crm/server/core';

type DayBooking = {
  id: string;
  therapistId: number | null; status: string; priceTotal: number; payTotal: number; paymentMethod: string; paymentSplit: CrmPaymentSplit[];
  hasPrice: boolean; receivedBy: string; slotStartISO: string;
};

async function readDayBookings(svc: Svc, salonId: number, dateISO: string): Promise<DayBooking[]> {
  const { startISO, endISO } = businessWindow(dateISO);
  const { data, error } = await svc
    .from('salon_bookings')
    .select('id, therapist_id, status, price_total, pay_total, payment_method, payment_split, received_by, slot_start')
    .eq('salon_id', salonId)
    .gte('slot_start', startISO)
    .lt('slot_start', endISO)
    .limit(2000);
  // ★ 2026-10-09 点検#1: 読めなかったら投げる（空のふりをすると 0本・報酬0円の確定や売上0の日報が書かれる）。第1219便と同じ
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    therapistId: r.therapist_id == null ? null : Number(r.therapist_id),
    status: String(r.status),
    priceTotal: Number(r.price_total) || 0,
    payTotal: Number(r.pay_total) || 0,
    paymentMethod: String(r.payment_method ?? ''),
    paymentSplit: parsePaymentSplit(r.payment_split),
    hasPrice: r.price_total != null,
    receivedBy: String(r.received_by ?? ''),
    slotStartISO: String(r.slot_start),
  }));
}

/** その日に出勤しているセラピスト（在籍・その店） */
async function readWorking(svc: Svc, salonId: number, dateISO: string): Promise<Array<{ id: number; name: string }>> {
  const { data: ths, error: thErr } = await svc.from('therapists').select('id, name').eq('salon_id', salonId);
  if (thErr) throw new Error(thErr.message); // ★ 2026-10-09 点検#1
  const all = (ths ?? []).map((t) => ({ id: Number(t.id), name: String(t.name ?? '') }));
  if (all.length === 0) return [];
  const { data: sch, error: schErr } = await svc
    .from('therapist_schedules')
    .select('therapist_id')
    .in('therapist_id', all.map((t) => t.id))
    .eq('schedule_date', dateISO)
    .eq('is_active', true);
  if (schErr) throw new Error(schErr.message); // ★ 2026-10-09 点検#1
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
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: '女子が見つかりません' };
  const al = Math.round(Number(allowance) || 0);
  if (al < -1000000 || al > 1000000) return { ok: false, error: '手当の金額が大きすぎます' };
  let mine: DayBooking[];
  try {
    mine = (await readDayBookings(svc, salonId, dateISO)).filter((b) => b.therapistId === therapistId && b.status !== 'cancelled');
  } catch (e) {
    return readFail(e); // ★ 2026-10-09 点検#1: 読めなかった回は確定を書かない
  }
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
  if (error) return { ok: false, error: dbMessage(error) };
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
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

/** その日に受領・報酬・動きがあって、その日の終わりの残高が 0 でない人の名前（第558便） */
async function unsettledNames(svc: Svc, salonId: number, dateISO: string, known: Map<number, string>): Promise<string[]> {
  try {
    // ★ 第1226便: DB 側の関数で1人1行（その日に動きがあって、その日の終わりの残高が 0 でない人）
    const totals = await moneyTotals(svc, salonId, { untilDate: dateISO, day: dateISO });
    const ids: number[] = [];
    for (const [tid, t] of totals) {
      if (!t.dayActive) continue;
      if (aggBalance(t.total) !== 0) ids.push(tid);
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
  const [bookings, confirms, working, report, money] = await Promise.all([
    readDayBookings(svc, salonId, dateISO),
    readConfirms(svc, salonId, dateISO),
    readWorking(svc, salonId, dateISO),
    readReport(svc, salonId, dateISO),
    readMoneyOpts(svc, salonId),   // ★ 第1415便
  ]);
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const sales = active.reduce((a, b) => a + b.priceTotal, 0);
  // ★ 第1454便: フクエスポイントが使われた予約（フクエス負担）。売上はそのまま・現金で受け取らない分を「うち現金」から引く
  const pts = await pointsYenByBooking(svc, active.map((b) => b.id));
  const pointsYen = active.reduce((a, b) => a + (pts.get(b.id) ?? 0), 0);
  const pointsCount = active.filter((b) => (pts.get(b.id) ?? 0) > 0).length;
  // ★ 第1363便: 分けた予約は現金の分だけ（内訳が無ければ今までどおり payment_method が現金なら全額）
  const cashOf = (b: DayBooking) => (b.paymentSplit.length > 1 ? b.paymentSplit.filter((s) => s.method === '現金').reduce((x, s) => x + s.amount, 0) : (b.paymentMethod === '現金' ? b.priceTotal : 0));
  const cashSales = active.reduce((a, b) => { const c = cashOf(b); return a + Math.max(0, c - (c > 0 ? (pts.get(b.id) ?? 0) : 0)); }, 0);
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
    // ★ 第1415便: 金銭授受を使わないお店は、未受領・未精算の注意を出さない。受領を自動にした日から先は未受領に数えない
    unreceived: money.moneyEnabled
      ? bookings.filter((b) => isUnreceived({ ...b, priceTotal: b.hasPrice ? b.priceTotal : null }, Date.now(), money.autoReceivedFrom)).length
      : 0,
    unsettled: money.moneyEnabled ? await unsettledNames(svc, salonId, dateISO, names) : [],
    pointsCount,
    pointsYen,
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
  try {
    return { ok: true, summary: await computeDay(auth.svc, salonId, dateISO) };
  } catch (e) {
    return readFail(e); // ★ 第1219便
  }
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
  // ★ 第1219便: 確定などが読めなかったら日報を作らない（手当の入らない数字で作ってしまわないように）
  let d: CrmDaySummary;
  try { d = await computeDay(auth.svc, salonId, dateISO); } catch (e) { return readFail(e); }
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
  if (error) return { ok: false, error: dbMessage(error) };
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
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}
