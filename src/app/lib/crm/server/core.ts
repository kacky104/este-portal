
// フクエスCRM（有料）のサーバー処理（第1段階・2026-09-19）。
//
// ★ 無料／有料の棲み分け（カッキーさん 2026-09-19）
//   ・予約ボードは無料。CRM（顧客台帳）は有料。有料かどうかは salons.crm_until（この日まで・JST）。
//   ・判定は【必ずここ（サーバー）】で行う。画面で隠すだけにしない。
//   ・無料の店でも名寄せ（記録）はしている（src/app/lib/crm/linkCustomer.ts）。見せないだけ。
// ★ 読み書きは service_role。その前にログイン中のユーザーが店のオーナー本人（か運営）か確かめる。
// ★ テーブル: salon_customers / salon_customer_phones / salon_bookings.customer_id・cancel_bad
//   （supabase/migrations/20260919_salon_customers.sql）。
//
// ★ 第1992便: 3,174行の actions/crm.ts を分けた。画面から呼ぶ処理は仕事ごとに actions/crm〇〇.ts（Access・Customers・Schedule・Prices・Close・Reports・Settings・Money・Consent・Import・Terms・BookingList）、
//   いくつかのファイルが一緒に使う部品はこのファイル。中身は分ける前と同じ。
// フクエスCRM のサーバー処理で、いくつかのファイルが一緒に使う部品（第1992便で actions/crm.ts から分けた）。
// ★ ここは 'use server' ではない（画面から直接は呼べない）。入口の確かめ（assertCrm）もここ。

import { createServiceClient } from '@/app/lib/supabase/service';
import { normalizeIntervalMin } from '@/app/lib/booking/boardData';
import { assertCrmOwner } from '@/app/lib/crm/auth';
import { pointsYenBySalon } from '@/app/lib/points/server';
import { crmBookingOrdinals } from '@/lib/crmBookingOrdinal';
import { crmGroupTableMissing } from '@/app/lib/crm/groupAlerts';
import { type CrmBookingItem, type CrmPriceItem, type CrmPriceOverride, type CrmPriceKind, type CrmPayConfirm, type CrmDailyReport, CRM_PRICE_KINDS, CRM_FIXED_NOMINATIONS, CRM_DEFAULT_SETTINGS, normalizeCrmAlarms, normalizeCrmToggles, CRM_TOGGLE_OPTION_LEN, crmReceivedByTherapist, type CrmSettings, type CrmEndType, type CrmWorkDay, type CrmAttendance, isFixedNomination, type CrmStats, parsePaymentSplit } from '@/app/lib/crm/types';

export type Svc = ReturnType<typeof createServiceClient>;

export const LIST_LIMIT = 50;
export const HISTORY_LIMIT = 300;


/** 有料CRMを使ってよいか確かめてから service_role を返す */
// ★ 第1113便: 予約ボードの読み込みに要る店舗の値も一緒に返す（★ getCrmSchedule が salons を読み直さないため）
export type CrmAuthOk = { ok: true; svc: Svc; userId: string; bookingCoursesRaw: unknown; defaultIntervalMin: number };
export async function assertCrm(salonId: number, opts?: { skipTerms?: boolean }): Promise<CrmAuthOk | { ok: false; error: string }> {
  // ★ 2026-10-09 点検#9: 判定は lib/crm/auth.ts の assertCrmOwner に1本化（規約の同意もサーバーで確かめる）
  const a = await assertCrmOwner(salonId, opts);
  if (!a.ok) return a;
  return { ok: true, svc: a.svc, userId: a.userId, bookingCoursesRaw: a.salon.booking_courses, defaultIntervalMin: normalizeIntervalMin(a.salon.default_interval_min) };
}

export function emptyStats(): CrmStats {
  return { visits: 0, upcoming: 0, cancels: 0, badCancels: 0, lastVisitISO: null };
}

/** 顧客ごとの利用状況を予約から数える */
export async function statsFor(svc: Svc, salonId: number, ids: number[]): Promise<Map<number, CrmStats>> {
  const out = new Map<number, CrmStats>();
  ids.forEach((id) => out.set(id, emptyStats()));
  if (ids.length === 0) return out;

  // ★ 第1115便（2026-10-03）: 数えるのは DB 側（crm_customer_stats・お客様1人につき1行）。
  //   ★ それまで お客様ごとの過去の予約を【全件】（最大5,000行）読んで JS で数えていた＝CRM の読み取り量の大半。
  //   ★ 関数がまだ無い（SQL を流す前）・読めないときは、今までの読み方に戻る（画面を空にしない）。
  const { data: agg, error } = await svc.rpc('crm_customer_stats', { p_salon_id: salonId, p_ids: ids });
  if (!error && Array.isArray(agg)) {
    for (const r of agg as Array<Record<string, unknown>>) {
      const s = out.get(Number(r.customer_id));
      if (!s) continue;
      s.visits = Number(r.visits) || 0;
      s.upcoming = Number(r.upcoming) || 0;
      s.cancels = Number(r.cancels) || 0;
      s.badCancels = Number(r.bad_cancels) || 0;
      s.lastVisitISO = r.last_visit ? new Date(String(r.last_visit)).toISOString() : null;
    }
    return out;
  }
  if (error) console.error('[crm] crm_customer_stats を読めませんでした（今までの読み方で数えます）:', error.message);

  const { data, error: fbErr } = await svc
    .from('salon_bookings')
    .select('customer_id, slot_start, status, cancel_bad')
    .eq('salon_id', salonId)
    .in('customer_id', ids)
    .limit(5000);
  // ★ 第1987便（点検 §3）: 予備の道も読めなければ投げる（「利用0回」と出さない）。呼び出し側は try/catch → readFail
  if (fbErr) throw new Error(fbErr.message);
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

/**
 * ★ 第1514便（2026-10-16・ラビリンス様のご要望）: 予約ID → そのお客様の何件目の予約か（キャンセル込み・入れた順）。
 *   ・数え方は src/lib/crmBookingOrdinal.ts。状態（キャンセル）・日時の過ぎた/まだ は見ない。
 *   ・★ 台帳の「利用◯回」（crm_customer_stats＝来店回数）は変えない。
 *   ・読めなければ null（カードに「新規／◯回目」を出さない＝間違った数字を出さない）。
 */
export async function bookingOrdinalsFor(svc: Svc, salonId: number, customerIds: number[]): Promise<Map<string, number> | null> {
  if (customerIds.length === 0) return new Map();
  try {
    const rows: Array<{ id: string; customerId: number | null; createdAt: string }> = [];
    for (let i = 0; i < customerIds.length; i += 200) {
      const { data, error } = await svc
        .from('salon_bookings')
        .select('id, customer_id, created_at')
        .eq('salon_id', salonId)
        .in('customer_id', customerIds.slice(i, i + 200))
        .limit(20000);
      if (error) {
        console.error('[crm] 予約の何件目を読めなかった', salonId, error.message);
        return null;
      }
      for (const r of data ?? []) {
        rows.push({ id: String(r.id), customerId: r.customer_id == null ? null : Number(r.customer_id), createdAt: String(r.created_at) });
      }
    }
    return crmBookingOrdinals(rows);
  } catch (e) {
    console.error('[crm] 予約の何件目を読めなかった', salonId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ── 料金と報酬（第2段階・第536便）──────────────────────

export function toKind(v: unknown): CrmPriceKind | null {
  return (CRM_PRICE_KINDS as readonly string[]).includes(String(v)) ? (v as CrmPriceKind) : null;
}

/** 予約の crm_items（jsonb）→ 型付き配列（おかしな要素は捨てる） */
export function parseItems(raw: unknown): CrmBookingItem[] {
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

export async function readPriceItemsRaw(svc: Svc, salonId: number): Promise<CrmPriceItem[]> {
  const { data, error } = await svc
    .from('crm_price_items')
    .select('id, kind, name, minutes, price, pay, sort, is_active')
    .eq('salon_id', salonId)
    .order('kind', { ascending: true })
    .order('sort', { ascending: true })
    .order('id', { ascending: true });
  // ★ 2026-11-12 点検#6: 読めなかったら投げる。前は「料金表が空」と受け取って、固定の指名をもう一度作りに行き、画面にも空の料金表が出ていた
  if (error) throw new Error(error.message);
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
  // ★ 第1782便: 女の子別の料金を項目に付ける（表がまだ無い＝SQL を流す前・読めないときは付けない＝基本のまま）
  if (out.length > 0) {
    const { data: ov, error: ovErr, status: ovStatus } = await svc
      .from('crm_price_overrides').select('therapist_id, price_item_id, price, pay').eq('salon_id', salonId);
    // ★ 2026-11-12 点検#7: 表が無い（SQL の前）ときだけ「基本のまま」。ほかの失敗は投げる
    //   （前は読めなかった回に黙って基本の料金に戻り、その回に保存した予約が基本の料金・報酬で写されていた）
    if (ovErr && !crmGroupTableMissing(ovErr, ovStatus)) throw new Error(ovErr.message);
    if (!ovErr) {
      const byItem = new Map(out.map((p) => [p.id, p]));
      for (const r of ov ?? []) {
        const p = byItem.get(Number(r.price_item_id));
        if (!p) continue;
        const o: CrmPriceOverride = { price: r.price == null ? null : Number(r.price), pay: r.pay == null ? null : Number(r.pay) };
        if (o.price == null && o.pay == null) continue;
        (p.byTherapist ??= {})[String(Number(r.therapist_id))] = o;
      }
    }
  }
  // 種類の並び（コース→指名→延長→オプション→割引）
  const order = new Map(CRM_PRICE_KINDS.map((k, i) => [k, i]));
  return out.sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!) || a.sort - b.sort || a.id - b.id);
}

/**
 * 料金表を読む。★ 固定の指名（フリー・ネット指名・本指名）が無ければ先に作る（第546便）。
 *   名前は変えられず消せない。要らない店は「使う」を外す。
 */
export async function readPriceItems(svc: Svc, salonId: number): Promise<CrmPriceItem[]> {
  const items = await readPriceItemsRaw(svc, salonId);
  const missing = CRM_FIXED_NOMINATIONS.filter((n) => !items.some((i) => i.kind === 'nomination' && i.name === n));
  if (missing.length === 0) return dedupeFixed(items);
  // ★ 第1224便（カッキーさん）: 初回に2つの読み取りが同時に走ると両方が「無い」と判断して2回 insert していた（同じ名前の指名が2行）。
  //   → 作った行の id を受け取り、直後にもう一度読んで、同じ名前の固定指名が【自分の作った行以外】にもあれば、自分が作った行だけ消す。
  //   ★ 消すのは「たった今自分が入れた行」に限る（既存の行は触らない）。
  const { data: made } = await svc.from('crm_price_items').insert(
    missing.map((name) => ({
      salon_id: salonId, kind: 'nomination', name, minutes: 0, price: 0, pay: 0,
      sort: CRM_FIXED_NOMINATIONS.indexOf(name), is_active: true,
    })),
  ).select('id, name');
  const after = await readPriceItemsRaw(svc, salonId);
  const mineIds = new Set((made ?? []).map((r) => Number(r.id)));
  const extra: number[] = [];
  for (const name of missing) {
    const same = after.filter((i) => i.kind === 'nomination' && i.name === name);
    if (same.length <= 1) continue;
    const others = same.filter((i) => !mineIds.has(i.id));
    if (others.length > 0) extra.push(...same.filter((i) => mineIds.has(i.id)).map((i) => i.id));
  }
  if (extra.length > 0) {
    await svc.from('crm_price_items').delete().eq('salon_id', salonId).in('id', extra);
    return dedupeFixed(after.filter((i) => !extra.includes(i.id)));
  }
  return dedupeFixed(after);
}

/** ★ 第1224便: 同じ名前の固定指名が複数あれば id の小さい1行だけ返す（画面に2つ並ばない）。行そのものは消さない。 */
export function dedupeFixed(items: CrmPriceItem[]): CrmPriceItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!isFixedNomination(i.kind, i.name)) return true;
    if (seen.has(i.name)) return false;
    seen.add(i.name);
    return true;
  });
}

// ── 報酬確定と締め（第538便）──────────────────────────
// ★ 営業日＝朝6時区切り。その日 6:00〜翌 6:00（JST）に【始まる】予約をその日の分として数える。

export function businessWindow(dateISO: string): { startISO: string; endISO: string } {
  const start = new Date(`${dateISO}T06:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function validDate(dateISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const t = new Date(`${dateISO}T00:00:00Z`).getTime();
  // ★ 点検（低）: '2026-02-30' は V8 が 3/2 として受けてしまう → 戻した文字が同じときだけ有効（Postgres の生エラーを画面に出さない）
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === dateISO;
}

// ★★ 第1219便（カッキーさん）: 読み取りの失敗を「空」と区別する。
//   readConfirms / readReport / readSettings / readWorkEnds / readWorkDays は、Supabase が error を返したら【投げる】（空のふりをしない）。
//   それまでは一時的なDBエラーで「設定が空」「確定なし」として進み、出勤情報の自由項目が全部落ちて保存されたり、
//   手当の入らない数字で日報が作られたりする道があった。呼び出し側は readFail で受けて ok:false を返す（止まってエラーを出す）。
/** ★ 2026-10-09 点検#2: 読み取りの結果を「失敗なら投げる・成功なら行」に。.then(rowsOrThrow) で使う（空のふりをしない） */
export function rowsOrThrow<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}

export function readFail(e: unknown): { ok: false; error: string } {
  const m = e instanceof Error ? e.message : String(e);
  // ★ 2026-11-12 点検#12: Postgres の英語の文は画面に出さない（記録には残す）。日本語の文（こちらで書いた理由）はそのまま出す
  if (!/[぀-ヿ一-龯]/.test(m)) {
    console.error('[crm] 読み込めなかった:', m);
    return { ok: false, error: '読み込めませんでした。もう一度お試しください' };
  }
  return { ok: false, error: `読み込めませんでした（${m}）。もう一度お試しください` };
}

export async function readConfirms(svc: Svc, salonId: number, dateISO: string): Promise<CrmPayConfirm[]> {
  if (!validDate(dateISO)) return [];
  const { data, error } = await svc
    .from('crm_pay_confirms')
    .select('therapist_id, booking_count, pay_total, allowance, note, confirmed_at')
    .eq('salon_id', salonId)
    .eq('business_date', dateISO);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    therapistId: Number(r.therapist_id),
    bookingCount: Number(r.booking_count) || 0,
    payTotal: Number(r.pay_total) || 0,
    allowance: Number(r.allowance) || 0,
    note: String(r.note ?? ''),
    confirmedAt: String(r.confirmed_at),
  }));
}

export function toReport(r: Record<string, unknown>): CrmDailyReport {
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

export async function readReport(svc: Svc, salonId: number, dateISO: string): Promise<CrmDailyReport | null> {
  if (!validDate(dateISO)) return null;
  const { data, error } = await svc
    .from('crm_daily_reports').select('*').eq('salon_id', salonId).eq('business_date', dateISO).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toReport(data as Record<string, unknown>) : null;
}

// ── 設定と「受まで／上がり」（第548便）──────────────────
/**
 * ★ 第1415便: 金銭授受の設定（使うか・受領を自動で）だけを読む。
 *   ★ 列が無い（追加SQL_第1415便がまだ）・読めないときは既定（使う・自動なし）＝今までどおり。
 */
export async function readMoneyOpts(svc: Svc, salonId: number): Promise<{ moneyEnabled: boolean; autoReceivedFrom: string | null }> {
  const { data, error } = await svc.from('crm_settings').select('money_enabled, auto_received_from').eq('salon_id', salonId).maybeSingle();
  if (error || !data) return { moneyEnabled: true, autoReceivedFrom: null };
  const from = data.auto_received_from ? String(data.auto_received_from).slice(0, 10) : null;
  return { moneyEnabled: data.money_enabled !== false, autoReceivedFrom: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null };
}

export async function readSettings(svc: Svc, salonId: number): Promise<CrmSettings> {
  const money = await readMoneyOpts(svc, salonId);
  const { data, error } = await svc
    .from('crm_settings').select('day_start_min, day_end_min, default_end_type, rooms, room_colors, alarms, consent_enabled, consent_title, consent_body, cast_pay_enabled, custom_toggles').eq('salon_id', salonId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ...CRM_DEFAULT_SETTINGS, alarms: normalizeCrmAlarms(null), ...money };
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
    ...money,
  };
}

export async function readWorkEnds(svc: Svc, salonId: number, dateISO: string): Promise<Record<number, CrmEndType>> {
  if (!validDate(dateISO)) return {};
  const { data, error } = await svc
    .from('crm_work_ends').select('therapist_id, end_type').eq('salon_id', salonId).eq('business_date', dateISO);
  if (error) throw new Error(error.message);
  const out: Record<number, CrmEndType> = {};
  for (const r of data ?? []) out[Number(r.therapist_id)] = r.end_type === 'accept' ? 'accept' : 'finish';
  return out;
}

// ── 出勤情報（第550便）──────────────────────────────
// ★ 出勤の開始・終了時刻はここでは変えない（therapist_schedules はサイトと媒体の元・カッキーさんの決定）。
export async function readWorkDays(svc: Svc, salonId: number, dateISO: string): Promise<Record<number, CrmWorkDay>> {
  if (!validDate(dateISO)) return {};
  const { data, error } = await svc
    .from('crm_work_days')
    .select('therapist_id, break_start_min, break_end_min, break_memo, room, room_salon_id, attendance, transport, toggle_values')
    .eq('salon_id', salonId).eq('business_date', dateISO);
  if (error) throw new Error(error.message);
  const out: Record<number, CrmWorkDay> = {};
  for (const r of data ?? []) {
    out[Number(r.therapist_id)] = {
      breakStartMin: r.break_start_min == null ? null : Number(r.break_start_min),
      breakEndMin: r.break_end_min == null ? null : Number(r.break_end_min),
      breakMemo: String(r.break_memo ?? ''),
      room: String(r.room ?? ''),
      roomSalonId: r.room_salon_id == null ? null : Number(r.room_salon_id),
      attendance: (['late', 'absent', 'sent_home'].includes(String(r.attendance)) ? r.attendance : '') as CrmAttendance,
      transport: Number(r.transport) || 0,
      toggles: readToggleValues(r.toggle_values),
    };
  }
  return out;
}

/** crm_work_days.toggle_values を { id: 選択肢 } に整える（第597便） */
export function readToggleValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z0-9]{1,12}$/.test(k) && typeof v === 'string' && v) out[k] = v.slice(0, CRM_TOGGLE_OPTION_LEN);
  }
  return out;
}

// ── 金銭授受（第558便・2026-09-20）──────────────────────
// ★ 表（crm_money_moves）には「動き」だけを持ち、残高はここで毎回計算する（types.ts の式）。
// ★ 報酬：報酬確定した日は確定の数字（手当込み）、まだの日は予約の報酬の合計（見込み）。

/** slot_start（UTC ISO）→ 営業日（朝6時区切り・JST） */
export function businessDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
}

export type MoneyAgg = { received: number; pay: number; toShop: number; toTherapist: number };
export const emptyAgg = (): MoneyAgg => ({ received: 0, pay: 0, toShop: 0, toTherapist: 0 });

/** 1000行ずつ全部読む（PostgREST の上限対策） */
// ★ 2026-10-09 点検#10: 読めなかったら投げる（空のふりをすると、顧客の削除で予約を匿名化せずに顧客行だけ消す道があった）。呼び出し側は try/catch → readFail
export async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function therapistNames(svc: Svc, salonId: number): Promise<Map<number, string>> {
  const { data, error } = await svc.from('therapists').select('id, name').eq('salon_id', salonId);
  // ★ 第1987便（点検 §3）: 読めなければ投げる（全員「(不明)」と出さない）。呼び出し側は try/catch → readFail
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((t) => [Number(t.id), String(t.name ?? '')]));
}

/**
 * 女子ごと×営業日ごとの受領・報酬・動きを集める。
 * filter: therapistId を絞る／untilDate（この日まで・含む）。
 */
export async function moneyByDay(
  svc: Svc,
  salonId: number,
  opt: { therapistId?: number; untilDate?: string } = {},
): Promise<Map<number, Map<string, MoneyAgg>>> {
  const untilEnd = opt.untilDate ? businessWindow(opt.untilDate).endISO : null;
  const bookings = await readAll<Record<string, unknown>>((from, to) => {
    let q = svc.from('salon_bookings')
      .select('id, therapist_id, price_total, pay_total, received_by, slot_start, payment_method, payment_split')
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

  // ★ 第1415便: 受領が未入力の予約を「女子が受領」とみなす設定（DB の関数 crm_money_balances と同じ決め方）
  const { autoReceivedFrom } = await readMoneyOpts(svc, salonId);
  // ★ 第1454便: フクエスポイントの分は受け取った額から引く（DB の関数と同じ）
  const ptsByBooking = await pointsYenBySalon(svc, salonId);
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
    a.received += crmReceivedByTherapist({
      receivedBy: String(b.received_by ?? ''),
      priceTotal: b.price_total == null ? null : Number(b.price_total),
      paymentMethod: String(b.payment_method ?? ''),
      paymentSplit: parsePaymentSplit(b.payment_split),
      slotStartISO: String(b.slot_start),
      pointsYen: ptsByBooking.get(String(b.id)) ?? 0,
    }, autoReceivedFrom);
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

export const aggBalance = (a: MoneyAgg) => a.received - a.pay - a.toShop + a.toTherapist;

export type MoneyTotal = { total: MoneyAgg; day: MoneyAgg; dayActive: boolean };

/**
 * ★★ 第1226便（カッキーさん）: 残高の集計を DB 側の関数 crm_money_balances で行い、セラピスト1人につき1行だけ受け取る。
 *   それまでは moneyByDay で開店以来の全予約・確定・動きを 3 表ぶん読んで JS で足していた（CRM の店が増える・1年分たまると締めのたびに数万行）。
 *   ★ 関数が無い・失敗したときは今までの読み方（moneyByDay）に戻る＝SQL を流す前に push しても壊れない。
 *   ★ 数え方は同じ（received − pay − toShop + toTherapist・営業日 6:00 区切り・確定した日は確定の報酬＋手当）。
 * @param opt.untilDate この営業日まで（含む）／opt.therapistId この人だけ／opt.day この日の分を day・dayActive で返す
 */
export async function moneyTotals(
  svc: Svc,
  salonId: number,
  opt: { therapistId?: number; untilDate?: string; day?: string } = {},
): Promise<Map<number, MoneyTotal>> {
  const out = new Map<number, MoneyTotal>();
  const { data, error } = await svc.rpc('crm_money_balances', {
    p_salon_id: salonId,
    p_until: opt.untilDate ?? null,
    p_therapist_id: opt.therapistId ?? null,
    p_day: opt.day ?? null,
  });
  if (!error && Array.isArray(data)) {
    for (const r of data as Record<string, unknown>[]) {
      out.set(Number(r.therapist_id), {
        total: { received: Number(r.received) || 0, pay: Number(r.pay) || 0, toShop: Number(r.to_shop) || 0, toTherapist: Number(r.to_therapist) || 0 },
        day: { received: Number(r.day_received) || 0, pay: Number(r.day_pay) || 0, toShop: Number(r.day_to_shop) || 0, toTherapist: Number(r.day_to_therapist) || 0 },
        dayActive: Boolean(r.day_active),
      });
    }
    return out;
  }
  if (error) console.error('[crm] crm_money_balances を読めませんでした（今までの読み方で足します）:', error.message);
  const byDay = await moneyByDay(svc, salonId, { therapistId: opt.therapistId, untilDate: opt.untilDate }); // ★ 読めなければ投げる（呼び出し側で readFail）
  for (const [tid, days] of byDay) {
    const total = emptyAgg();
    for (const a of days.values()) { total.received += a.received; total.pay += a.pay; total.toShop += a.toShop; total.toTherapist += a.toTherapist; }
    const day = (opt.day && days.get(opt.day)) || emptyAgg();
    out.set(tid, { total, day: { ...day }, dayActive: !!opt.day && days.has(opt.day) });
  }
  return out;
}

/** ★ 第1220便: 画面に出す電話番号。以前の削除で入れた 0000000000（全部同じ数字）は出さない */
export function displayTel(v: unknown): string {
  const t = String(v ?? '');
  return /^(\d)\1{5,}$/.test(t) ? '' : t;
}

/** 予約ID → 有効な同意書の時刻（第574便） */
export async function consentMap(svc: Svc, salonId: number, bookingIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < bookingIds.length; i += 300) {
    const { data, error } = await svc.from('crm_consents').select('booking_id, created_at')
      .eq('salon_id', salonId).is('superseded_at', null).in('booking_id', bookingIds.slice(i, i + 300));
    if (error) throw new Error(error.message); // ★ 第1987便（点検 §3）。呼び出し側は try/catch → readFail
    (data ?? []).forEach((c) => out.set(String(c.booking_id), String(c.created_at)));
  }
  return out;
}
