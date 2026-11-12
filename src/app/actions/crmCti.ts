'use server';

// フクエスCRM 着信ポップ（CTI）：店舗様の画面から呼ぶ口（第1686便・2026-10-28）。設計メモ_2026-10-28_CTI着信ポップ_D方式.md §4
// ★ 守り: assertCrmOwner（オーナー本人か運営・契約中・規約同意）＋ service_role。表は追加SQL_第1685便。
// ★ ここにあるもの:
//   ・getCrmIncomingCalls … CRM を開いているブラウザが 3 秒ごとに「この id より後の着信は？」と聞く（軽い読み）
//   ・lookupCtiCaller     … 番号から台帳のお客様＋グループ共有＋「次は◯回目」を引く（ポップの中身）
//   ・listCrmCtiDevices   … 設定タブの端末一覧（読むだけ。発行は /admin）
//   ・crmCtiTestCall      … 店舗様の「テスト着信」ボタン
//   ・listCrmCalls        … 着信履歴のタブ（第1994便）

import { assertCrmOwner } from '@/app/lib/crm/auth';
import { dbMessage } from '@/app/lib/crm/dbError';
import { normalizeIncomingPhone, parseHiddenReason, recordCtiCall, type CtiHiddenReason } from '@/app/lib/crm/cti';
import { lookupCrmCustomerByPhone } from '@/app/actions/crmSchedule';
import { paymentLabel, parsePaymentSplit, type CrmBookingItem, type CrmReceivedBy, type CrmScheduleCustomer } from '@/app/lib/crm/types';
import { businessWindow, parseItems, readFail, therapistNames, validDate } from '@/app/lib/crm/server/core';
import type { CrmGroupHit } from '@/lib/crmGroup';

type Err = { ok: false; error: string };

function tableMissing(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /crm_cti_/.test(e.message ?? '') && /does not exist|schema cache/.test(e.message ?? ''));
}

export type CrmIncomingCall = {
  id: number;
  phone: string | null;
  hidden: CtiHiddenReason | null;
  /** テスト着信（device_id null）か */
  test: boolean;
  rangAtISO: string;
};

/**
 * 着信の見張り。afterId より後の着信を古い順に（最大 10 件）。
 * ★ afterId が null（開いた直後）のときは「今より 2 分以内」の着信だけ返す（開いた瞬間に昨日の着信が積まれないように）。
 * ★ CTI の端末が1台も無く、テスト着信も無い店は enabled: false（ブラウザはそれ以上聞かない）。
 */
export async function getCrmIncomingCalls(
  salonId: number,
  afterId: number | null,
): Promise<{ ok: true; enabled: boolean; calls: CrmIncomingCall[]; latestId: number | null } | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const svc = a.svc;

  if (afterId == null) {
    // 端末があるか（止めている端末も「ある」に数える＝運営が止めただけで店にはある）
    const { count, error } = await svc.from('crm_cti_devices').select('id', { count: 'exact', head: true }).eq('salon_id', salonId);
    if (tableMissing(error)) return { ok: true, enabled: false, calls: [], latestId: null };
    if (error) return { ok: false, error: dbMessage(error, '読み込み') };
    // 端末が無くてもテスト着信（直近 1 日）があれば見張る（端末が届く前の確認用）
    let enabled = (count ?? 0) > 0;
    if (!enabled) {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { count: tc } = await svc.from('crm_cti_calls').select('id', { count: 'exact', head: true })
        .eq('salon_id', salonId).gte('received_at', since);
      enabled = (tc ?? 0) > 0;
    }
    if (!enabled) return { ok: true, enabled: false, calls: [], latestId: null };
    // 開いた直後は「最新の id」と、2 分以内の着信だけ
    const since2 = new Date(Date.now() - 120_000).toISOString();
    const { data, error: e2 } = await svc.from('crm_cti_calls')
      .select('id, phone, hidden_reason, device_id, rang_at')
      .eq('salon_id', salonId).order('id', { ascending: false }).limit(10);
    if (e2) return { ok: false, error: dbMessage(e2, '読み込み') };
    const rows = (data ?? []);
    const latestId = rows.length > 0 ? Number(rows[0].id) : 0;
    const recent = rows.filter((r) => String(r.rang_at) >= since2).reverse();
    return { ok: true, enabled: true, latestId, calls: recent.map(toCall) };
  }

  const { data, error } = await svc.from('crm_cti_calls')
    .select('id, phone, hidden_reason, device_id, rang_at')
    .eq('salon_id', salonId).gt('id', afterId).order('id', { ascending: true }).limit(10);
  if (tableMissing(error)) return { ok: true, enabled: false, calls: [], latestId: afterId };
  if (error) return { ok: false, error: dbMessage(error, '読み込み') };
  const rows = data ?? [];
  return { ok: true, enabled: true, calls: rows.map(toCall), latestId: rows.length > 0 ? Number(rows[rows.length - 1].id) : afterId };
}

function toCall(r: Record<string, unknown>): CrmIncomingCall {
  return {
    id: Number(r.id),
    phone: (r.phone as string | null) ?? null,
    hidden: parseHiddenReason(r.hidden_reason),
    test: r.device_id == null,
    rangAtISO: new Date(String(r.rang_at)).toISOString(),
  };
}

/** ★ 第1994便: 大きな窓の「利用履歴」の1行 */
export type CtiHistoryRow = {
  id: string;
  startISO: string;
  therapistName: string;
  nomination: string;   // 指名の項目名（無ければ ''）
  course: string;       // コース名（分）
  price: number | null;
  status: string;       // new / confirmed / cancelled
  cancelBad: boolean;
};
/** ★ 第1994便: 大きな窓の「前回の予約データ」 */
export type CtiLastBooking = {
  startISO: string;
  endISO: string;
  therapistName: string;
  course: string;
  nomination: string;
  extensions: string;
  options: string;
  discounts: string;
  priceTotal: number | null;
  payTotal: number | null;
  payment: string;
  receivedBy: CrmReceivedBy;
  playStatus: string;
  web: boolean;
  note: string;
  createdAtISO: string;
};
export type CtiCallerInfo = {
  customer: CrmScheduleCustomer | null;
  groupHits: CrmGroupHit[];
  groupFailed: boolean;
  /** この番号の人の、CRM に入れた予約の数（キャンセル込み）。次の予約は bookingCount+1 回目。台帳に無ければ 0 */
  bookingCount: number;
  /** ★ 第1994便（風俗CTI の着信の窓にならう）。台帳に無ければ空 */
  memo: string;              // お店のメモ（事業所メモ）
  totalSpent: number;        // 来店した予約の料金の合計
  ngNames: string[];         // 女子NG の名前
  usedNames: string[];       // 利用した女子（新しい順・重なりなし）
  history: CtiHistoryRow[];  // 新しい順・最大 30 件
  last: CtiLastBooking | null;
};

const CTI_HISTORY_MAX = 30;
function itemNames(items: CrmBookingItem[], kind: CrmBookingItem['kind']): string {
  return items.filter((i) => i.kind === kind).map((i) => i.name).filter(Boolean).join('・');
}

/** 番号からポップの中身を引く。★ 台帳の判定・グループ共有は受付フォームと同じ lookupCrmCustomerByPhone（1か所） */
export async function lookupCtiCaller(salonId: number, phone: string): Promise<({ ok: true } & CtiCallerInfo) | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const r = await lookupCrmCustomerByPhone(salonId, phone);
  if (!r.ok) return r;
  const empty = { memo: '', totalSpent: 0, ngNames: [] as string[], usedNames: [] as string[], history: [] as CtiHistoryRow[], last: null };
  if (!r.customer) return { ok: true, customer: null, groupHits: r.groupHits, groupFailed: r.groupFailed, bookingCount: 0, ...empty };
  const svc = a.svc;
  const cust = r.customer;
  // ★ 第1994便: 大きな窓の中身（メモ・利用履歴・前回の予約・女子の名前）。★ 読めなければ止める（欠けたまま出さない）
  try {
    const [cRes, bRes, cnt, names] = await Promise.all([
      svc.from('salon_customers').select('memo').eq('salon_id', salonId).eq('id', cust.id).maybeSingle(),
      svc.from('salon_bookings')
        .select('id, slot_start, slot_end, therapist_id, course_name, course_min, crm_items, price_total, pay_total, payment_method, payment_split, received_by, play_status, status, cancel_bad, source, note, created_at')
        .eq('salon_id', salonId).eq('customer_id', cust.id).order('slot_start', { ascending: false }).limit(CTI_HISTORY_MAX),
      svc.from('salon_bookings').select('id', { count: 'exact', head: true }).eq('salon_id', salonId).eq('customer_id', cust.id),
      therapistNames(svc, salonId),
    ]);
    if (cRes.error) throw new Error(cRes.error.message);
    if (bRes.error) throw new Error(bRes.error.message);
    if (cnt.error) throw new Error(cnt.error.message);
    const nameOf = (tid: unknown) => (tid == null ? 'フリー' : names.get(Number(tid)) ?? '(不明)');
    const now = Date.now();
    const rows = (bRes.data ?? []) as Array<Record<string, unknown>>;
    const history: CtiHistoryRow[] = rows.map((b) => {
      const items = parseItems(b.crm_items);
      return {
        id: String(b.id),
        startISO: new Date(String(b.slot_start)).toISOString(),
        therapistName: nameOf(b.therapist_id),
        nomination: itemNames(items, 'nomination'),
        course: `${String(b.course_name ?? '')}${Number(b.course_min) > 0 ? `（${Number(b.course_min)}分）` : ''}`,
        price: b.price_total == null ? null : Number(b.price_total),
        status: String(b.status ?? ''),
        cancelBad: Boolean(b.cancel_bad),
      };
    });
    const live = rows.filter((b) => b.status !== 'cancelled');
    const past = live.filter((b) => new Date(String(b.slot_start)).getTime() <= now);
    const totalSpent = past.reduce((s, b) => s + (Number(b.price_total) || 0), 0);
    const used: string[] = [];
    for (const b of live) { if (b.therapist_id == null) continue; const n = nameOf(b.therapist_id); if (!used.includes(n)) used.push(n); }
    const lb = past[0] ?? live[0] ?? null;
    let last: CtiLastBooking | null = null;
    if (lb) {
      const items = parseItems(lb.crm_items);
      last = {
        startISO: new Date(String(lb.slot_start)).toISOString(),
        endISO: new Date(String(lb.slot_end)).toISOString(),
        therapistName: nameOf(lb.therapist_id),
        course: `${String(lb.course_name ?? '')}${Number(lb.course_min) > 0 ? `（${Number(lb.course_min)}分）` : ''}`,
        nomination: itemNames(items, 'nomination'),
        extensions: itemNames(items, 'extension'),
        options: itemNames(items, 'option'),
        discounts: itemNames(items, 'discount'),
        priceTotal: lb.price_total == null ? null : Number(lb.price_total),
        payTotal: lb.pay_total == null ? null : Number(lb.pay_total),
        payment: lb.payment_method ? paymentLabel(String(lb.payment_method), parsePaymentSplit(lb.payment_split)) : '',
        receivedBy: (String(lb.received_by ?? '') as CrmReceivedBy),
        playStatus: String(lb.play_status ?? ''),
        web: lb.source === 'web',
        note: String(lb.note ?? ''),
        createdAtISO: new Date(String(lb.created_at)).toISOString(),
      };
    }
    return {
      ok: true, customer: cust, groupHits: r.groupHits, groupFailed: r.groupFailed,
      bookingCount: cnt.count ?? 0,
      memo: String(cRes.data?.memo ?? ''),
      totalSpent,
      ngNames: cust.ngTherapistIds.map((id) => names.get(Number(id)) ?? '(不明)'),
      usedNames: used,
      history,
      last,
    };
  } catch (e) {
    return readFail(e);
  }
}

// ── 着信履歴（第1994便・2026-11-12・カッキーさん／風俗CTI の「本日着信」にならう）──────────
// ★ 記録はもとから crm_cti_calls に 90 日（追加SQL_第1685便の定期削除）。ここは読むだけ（SQL は要らない）。
// ★ 種別「予約」＝その着信から 60 分以内に、同じ電話番号の予約が入った（作られた）。それ以外は「未設定」。
// ★ 新規＝台帳にいない番号、またはその着信のあとに台帳に入った人。
export type CrmCallLogRow = {
  id: number;
  rangAtISO: string;
  phone: string | null;
  hidden: CtiHiddenReason | null;
  test: boolean;
  customerName: string;
  isNew: boolean;
  booked: boolean;
};
const CALL_LOG_MAX = 500;
const BOOKED_WITHIN_MS = 60 * 60_000;

export async function listCrmCalls(salonId: number, dateISO: string): Promise<{ ok: true; rows: CrmCallLogRow[]; truncated: boolean } | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  if (!validDate(dateISO)) return { ok: false, error: '日付が正しくありません' };
  const svc = a.svc;
  const w = businessWindow(dateISO);
  const { data, error } = await svc.from('crm_cti_calls')
    .select('id, phone, hidden_reason, device_id, rang_at')
    .eq('salon_id', salonId).gte('rang_at', w.startISO).lt('rang_at', w.endISO)
    .order('rang_at', { ascending: false }).limit(CALL_LOG_MAX + 1);
  if (tableMissing(error)) return { ok: true, rows: [], truncated: false };
  if (error) return readFail(new Error(error.message));
  const calls = (data ?? []).slice(0, CALL_LOG_MAX);
  const phones = [...new Set(calls.map((c) => c.phone).filter((p): p is string => !!p))];
  const owner = new Map<string, { name: string; createdMs: number }>();
  const bookedAt = new Map<string, number[]>();
  const bookName = new Map<string, string>();
  if (phones.length > 0) {
    const [ph, bk] = await Promise.all([
      svc.from('salon_customer_phones').select('phone, customer_id').eq('salon_id', salonId).in('phone', phones),
      svc.from('salon_bookings').select('customer_tel, customer_name, created_at')
        .eq('salon_id', salonId).in('customer_tel', phones)
        .gte('created_at', w.startISO).lt('created_at', new Date(new Date(w.endISO).getTime() + BOOKED_WITHIN_MS).toISOString()),
    ]);
    if (ph.error) return readFail(new Error(ph.error.message));
    if (bk.error) return readFail(new Error(bk.error.message));
    const ids = [...new Set((ph.data ?? []).map((p) => Number(p.customer_id)))];
    if (ids.length > 0) {
      const { data: cs, error: cErr } = await svc.from('salon_customers').select('id, name, created_at').eq('salon_id', salonId).in('id', ids);
      if (cErr) return readFail(new Error(cErr.message));
      const byId = new Map((cs ?? []).map((c) => [Number(c.id), { name: String(c.name ?? ''), createdMs: new Date(String(c.created_at)).getTime() }]));
      for (const p of ph.data ?? []) { const c = byId.get(Number(p.customer_id)); if (c) owner.set(String(p.phone), c); }
    }
    for (const b of bk.data ?? []) {
      const tel = String(b.customer_tel ?? '');
      bookedAt.set(tel, [...(bookedAt.get(tel) ?? []), new Date(String(b.created_at)).getTime()]);
      if (b.customer_name && !bookName.has(tel)) bookName.set(tel, String(b.customer_name));
    }
  }
  const rows: CrmCallLogRow[] = calls.map((c) => {
    const rang = new Date(String(c.rang_at)).getTime();
    const tel = c.phone ? String(c.phone) : null;
    const own = tel ? owner.get(tel) : undefined;
    return {
      id: Number(c.id),
      rangAtISO: new Date(rang).toISOString(),
      phone: tel,
      hidden: parseHiddenReason(c.hidden_reason),
      test: c.device_id == null,
      customerName: own?.name || (tel ? bookName.get(tel) ?? '' : ''),
      isNew: !!tel && (!own || own.createdMs >= rang - 60_000),
      booked: !!tel && (bookedAt.get(tel) ?? []).some((t) => t >= rang - 60_000 && t <= rang + BOOKED_WITHIN_MS),
    };
  });
  return { ok: true, rows, truncated: (data ?? []).length > CALL_LOG_MAX };
}

export type CrmCtiDeviceInfo = {
  id: number;
  name: string;
  isEnabled: boolean;
  lastSeenAt: string | null;
  lastCallAt: string | null;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
};

/** 設定タブの端末一覧（読むだけ）。★ 表が無ければ ready: false */
export async function listCrmCtiDevices(salonId: number): Promise<{ ok: true; ready: boolean; devices: CrmCtiDeviceInfo[] } | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const { data, error } = await a.svc.from('crm_cti_devices')
    .select('id, name, is_enabled, last_seen_at, last_call_at, device_model, android_version, app_version')
    .eq('salon_id', salonId).order('id', { ascending: true });
  if (tableMissing(error)) return { ok: true, ready: false, devices: [] };
  if (error) return { ok: false, error: dbMessage(error, '読み込み') };
  return {
    ok: true, ready: true,
    devices: (data ?? []).map((r) => ({
      id: Number(r.id), name: String(r.name ?? ''), isEnabled: !!r.is_enabled,
      lastSeenAt: (r.last_seen_at as string | null) ?? null, lastCallAt: (r.last_call_at as string | null) ?? null,
      deviceModel: String(r.device_model ?? ''), androidVersion: String(r.android_version ?? ''), appVersion: String(r.app_version ?? ''),
    })),
  };
}

/** 店舗様の「テスト着信」。device_id は null。phone が空なら非通知のテスト */
export async function crmCtiTestCall(salonId: number, input: { phone?: string; hidden?: boolean }): Promise<{ ok: true; duplicate: boolean } | Err> {
  const a = await assertCrmOwner(salonId);
  if (!a.ok) return a;
  const raw = String(input.phone ?? '').trim();
  const phone = input.hidden ? null : normalizeIncomingPhone(raw);
  if (!input.hidden && !phone) return { ok: false, error: '電話番号は数字10〜13桁で入れてください' };
  const r = await recordCtiCall(a.svc, { salonId, deviceId: null, phone, hidden: phone ? null : 'withheld' });
  if (!r.ok) {
    if (/crm_cti_/.test(r.error) && /does not exist|schema cache/.test(r.error)) return { ok: false, error: '着信ポップはまだ準備中です（運営が設定すると使えます）' };
    console.error('[cti] テスト着信を入れられなかった', salonId, r.error);
    return { ok: false, error: 'テスト着信を入れられませんでした。もう一度お試しください' };
  }
  return { ok: true, duplicate: r.duplicate };
}
