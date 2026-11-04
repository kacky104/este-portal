'use server';

// シフト提出（/cast）とシフト管理表（コネックエフ・マイページ）の受け口（2026-11-04・店舗様のご要望・カッキーさんの決定）。
// ★ 表は supabase/migrations/20261104_shift_requests.sql（shift_settings・shift_requests。RLS は閉じてある）。
// ★ セラピスト: ログイン中の user_id → therapists を確かめてから service_role で読む／書く（castSchedule と同じ流儀）。
//   ・書けるのは【次の提出期間】の日だけ。確定した日は本人からは変えない。締切なし（確定するまでは書き直せる）。
// ★ 店: 自分の店（運営が店を選んでいるときはその店・scopeConecfSalon）を確かめてから service_role。
//   ・確定すると therapist_schedules（出勤の正本）に書く → サイト・駅ちか・エステ魂へは今までどおり（媒体へは自動更新が拾う）。
//   ・部屋数を超える確定はさせない（入れ替え時間込み）。数えるのは【出勤の正本】（週間スケジュールで直接入れた出勤も数える）。
//   ・却下は無い。確定しなかった希望は希望のまま残す（欠勤が出たときの声かけ用）。
// ★ 使える店は SHIFT_SALON_IDS（lib/shift/access.ts）。テスト運用はラビリンス様（6）だけ。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateJST, getCalendarDateJST } from '@/lib/dutyStatus';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { readConecfGirlOrder } from '@/app/lib/conecf/girlOrder';
import { sortTherapistsByManual } from '@/lib/therapistOrder';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { shiftAllowedForSalon } from '@/app/lib/shift/access';
import {
  addDays, checkRooms, dateRange, isShiftPeriod, minToHM, roomErrorText, scheduleToMin, shiftPeriods, validRange,
  SHIFT_CHANGEOVER_OPTIONS, SHIFT_ROOM_MAX, type OccupyShift, type ShiftPeriod, type ShiftRequestView,
} from '@/lib/shift';

type Svc = ReturnType<typeof createServiceClient>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type ShiftSettings = { period: ShiftPeriod; roomCount: number; changeoverMin: number };
const DEFAULT_SETTINGS: ShiftSettings = { period: '1w', roomCount: 0, changeoverMin: 0 };
const NOT_OPEN = 'シフト提出はまだお使いいただけません';

async function readSettings(svc: Svc, salonId: number): Promise<ShiftSettings> {
  const { data } = await svc.from('shift_settings').select('period, room_count, changeover_min').eq('salon_id', salonId).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    period: isShiftPeriod(data.period) ? data.period : '1w',
    roomCount: Number(data.room_count) || 0,
    changeoverMin: Number(data.changeover_min) || 0,
  };
}

type ReqRow = { therapist_id: number; work_date: string; req_start_min: number; req_end_min: number; note: string; status: string; conf_start_min: number | null; conf_end_min: number | null; submitted_at?: string | null };
function toView(r: ReqRow): ShiftRequestView {
  return {
    reqS: Number(r.req_start_min), reqE: Number(r.req_end_min), note: String(r.note ?? ''),
    status: r.status === 'confirmed' ? 'confirmed' : 'requested',
    confS: r.conf_start_min == null ? null : Number(r.conf_start_min),
    confE: r.conf_end_min == null ? null : Number(r.conf_end_min),
    submittedAt: r.submitted_at ? String(r.submitted_at) : undefined,
  };
}

/** 出勤の正本（is_active の行だけ）を therapist × 日付 → 分 で読む */
async function readSchedules(svc: Svc, therapistIds: number[], from: string, to: string): Promise<Map<string, { s: number; e: number }>> {
  const out = new Map<string, { s: number; e: number }>();
  if (therapistIds.length === 0) return out;
  const { data } = await svc.from('therapist_schedules').select('therapist_id, schedule_date, is_active, start_time, end_time')
    .in('therapist_id', therapistIds).gte('schedule_date', from).lte('schedule_date', to);
  for (const x of data ?? []) {
    if (x.is_active !== true) continue;
    const m = scheduleToMin(x.start_time as string | null, x.end_time as string | null);
    if (m) out.set(`${x.therapist_id}#${x.schedule_date}`, m);
  }
  return out;
}

// ══════════════ セラピスト（/cast「シフト提出」）══════════════

async function resolveCast() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: t } = await svc.from('therapists').select('id, salon_id').eq('user_id', user.id).maybeSingle();
  if (!t || t.salon_id == null) return { ok: false as const, error: 'セラピストが見つかりません' };
  const salonId = Number(t.salon_id);
  if (!shiftAllowedForSalon(salonId)) return { ok: false as const, error: NOT_OPEN };
  return { ok: true as const, svc, therapistId: Number(t.id), salonId };
}

/** /cast のページで「シフト提出」タブを出すか */
export async function isCastShiftEnabled(salonId: number | null | undefined): Promise<boolean> {
  return shiftAllowedForSalon(salonId ?? null);
}

export type CastShiftDay = { date: string; req: ShiftRequestView | null; sched: { s: number; e: number } | null };
export type CastShiftData = {
  period: ShiftPeriod;
  current: { from: string; to: string; days: CastShiftDay[] };
  next: { from: string; to: string; days: CastShiftDay[] };
};

export async function getCastShift(): Promise<Result<CastShiftData>> {
  const r = await resolveCast();
  if (!r.ok) return r;
  const st = await readSettings(r.svc, r.salonId);
  const p = shiftPeriods(st.period, getBusinessDateJST());
  const from = p.current.from, to = p.next.to;
  const [{ data: reqs }, scheds] = await Promise.all([
    r.svc.from('shift_requests').select('therapist_id, work_date, req_start_min, req_end_min, note, status, conf_start_min, conf_end_min')
      .eq('therapist_id', r.therapistId).gte('work_date', from).lte('work_date', to),
    readSchedules(r.svc, [r.therapistId], from, to),
  ]);
  const reqMap = new Map((reqs ?? []).map((x) => [String(x.work_date), toView(x as ReqRow)]));
  const day = (d: string): CastShiftDay => ({ date: d, req: reqMap.get(d) ?? null, sched: scheds.get(`${r.therapistId}#${d}`) ?? null });
  return {
    ok: true,
    data: {
      period: st.period,
      current: { ...p.current, days: dateRange(p.current.from, p.current.to).map(day) },
      next: { ...p.next, days: dateRange(p.next.from, p.next.to).map(day) },
    },
  };
}

/**
 * 希望を出す・書き直す・消す。★ 次の提出期間の日だけ。★ 確定した日は触らない（断る）。
 * entries: { date, s, e, note } で希望、{ date, clear: true } で取り消し。
 */
export async function saveCastShift(input: {
  entries: Array<{ date: string; s?: number; e?: number; note?: string; clear?: boolean }>;
}): Promise<Result<{ saved: number; cleared: number }>> {
  const r = await resolveCast();
  if (!r.ok) return r;
  const st = await readSettings(r.svc, r.salonId);
  const p = shiftPeriods(st.period, getBusinessDateJST());
  const allowed = new Set(dateRange(p.next.from, p.next.to));
  const entries = Array.isArray(input.entries) ? input.entries.slice(0, 62) : [];
  if (entries.length === 0) return { ok: true, data: { saved: 0, cleared: 0 } };
  for (const x of entries) if (!allowed.has(String(x.date))) return { ok: false, error: `この日は提出できません（${x.date}）` };

  const dates = entries.map((x) => String(x.date));
  const { data: existing } = await r.svc.from('shift_requests').select('work_date, status').eq('therapist_id', r.therapistId).in('work_date', dates);
  const confirmed = new Set((existing ?? []).filter((x) => x.status === 'confirmed').map((x) => String(x.work_date)));

  const upserts: Array<Record<string, unknown>> = [];
  const clears: string[] = [];
  const now = new Date().toISOString();
  for (const x of entries) {
    const d = String(x.date);
    if (confirmed.has(d)) return { ok: false, error: `${d} はお店が確定済みのため変更できません。お店に連絡してください` };
    if (x.clear) { clears.push(d); continue; }
    const v = validRange(x.s, x.e);
    if (!v) return { ok: false, error: `時間を選び直してください（${d}）` };
    const note = String(x.note ?? '').trim().slice(0, 100);
    upserts.push({
      salon_id: r.salonId, therapist_id: r.therapistId, work_date: d,
      req_start_min: v.s, req_end_min: v.e, note, status: 'requested',
      conf_start_min: null, conf_end_min: null, confirmed_at: null, submitted_at: now, updated_at: now,
    });
  }
  if (upserts.length) {
    const { error } = await r.svc.from('shift_requests').upsert(upserts, { onConflict: 'therapist_id,work_date' });
    if (error) return { ok: false, error: `保存できませんでした: ${error.message}` };
  }
  if (clears.length) {
    const { error } = await r.svc.from('shift_requests').delete().eq('therapist_id', r.therapistId).eq('status', 'requested').in('work_date', clears);
    if (error) return { ok: false, error: `取り消せませんでした: ${error.message}` };
  }
  return { ok: true, data: { saved: upserts.length, cleared: clears.length } };
}

// ══════════════ 店（シフト管理表）══════════════

async function resolveShop(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at, crm_until'), user.id, actingId)
    .limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  const salonId = Number(salon.id);
  if (!shiftAllowedForSalon(salonId)) return { ok: false as const, error: NOT_OPEN };
  // ★ セット（コネックエフ＋CRM）を止めた店は、出勤を書かない（週間スケジュールの保存と同じ）
  if (write && salon.conecf_enabled_at && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) {
    return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  }
  return { ok: true as const, svc, salonId };
}

/** コネックエフ・マイページのメニューに「シフト管理表」を出すか（★ ログイン中の店で判断） */
export async function shiftBoardEnabled(): Promise<boolean> {
  const r = await resolveShop(false);
  return r.ok;
}

export type ShiftBoardRow = { id: number; name: string; imageUrl: string | null; isActive: boolean };
export type ShiftBoardData = {
  salonId: number;
  settings: ShiftSettings;
  which: 'next' | 'current';
  from: string; to: string;
  dates: string[];
  rows: ShiftBoardRow[];
  /** "therapistId#date" → 希望・確定 */
  requests: Record<string, ShiftRequestView>;
  /** "therapistId#date" → 出勤の正本（前後1日も入れてある＝部屋数の見張り用） */
  schedules: Record<string, { s: number; e: number }>;
};

export async function getShiftBoard(input?: { which?: 'next' | 'current' }): Promise<Result<ShiftBoardData>> {
  const r = await resolveShop(false);
  if (!r.ok) return r;
  const which = input?.which === 'current' ? 'current' : 'next';
  const settings = await readSettings(r.svc, r.salonId);
  const p = shiftPeriods(settings.period, getBusinessDateJST())[which];
  const { data: ts, error } = await r.svc.from('therapists').select('id, name, profile_image_url, is_active').eq('salon_id', r.salonId);
  if (error) return { ok: false, error: error.message };
  const ids = (ts ?? []).map((t) => Number(t.id));
  const [{ data: reqs }, scheds, order] = await Promise.all([
    ids.length
      ? r.svc.from('shift_requests').select('therapist_id, work_date, req_start_min, req_end_min, note, status, conf_start_min, conf_end_min, submitted_at')
          .eq('salon_id', r.salonId).gte('work_date', p.from).lte('work_date', p.to)
      : Promise.resolve({ data: [] as ReqRow[] }),
    readSchedules(r.svc, ids, addDays(p.from, -1), addDays(p.to, 1)),
    readConecfGirlOrder(r.svc, r.salonId),
  ]);
  const requests: Record<string, ShiftRequestView> = {};
  for (const x of (reqs ?? []) as ReqRow[]) requests[`${x.therapist_id}#${x.work_date}`] = toView(x);
  const rows: ShiftBoardRow[] = (ts ?? []).map((t) => ({
    id: Number(t.id), name: String(t.name ?? ''), imageUrl: (t.profile_image_url as string | null) ?? null, isActive: t.is_active !== false,
  }));
  return {
    ok: true,
    data: {
      salonId: r.salonId, settings, which, from: p.from, to: p.to, dates: dateRange(p.from, p.to),
      rows: sortTherapistsByManual(rows, (x) => x.id, (x) => x.name, (x) => !x.isActive, order),
      requests, schedules: Object.fromEntries(scheds),
    },
  };
}

/** 確定する（時間を直して確定もできる）。★ 部屋数・入れ替え時間を超えるときは確定しない */
export async function confirmShift(input: { therapistId: number; date: string; s: number; e: number }): Promise<Result<{ therapistId: number; date: string }>> {
  const r = await resolveShop(true);
  if (!r.ok) return r;
  const therapistId = Math.trunc(Number(input.therapistId));
  const date = String(input.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '日付が正しくありません' };
  const v = validRange(input.s, input.e);
  if (!v) return { ok: false, error: '時間を選び直してください' };
  if (date < getBusinessDateJST()) return { ok: false, error: '過ぎた日は確定できません' };

  const { data: t } = await r.svc.from('therapists').select('id, is_active').eq('id', therapistId).eq('salon_id', r.salonId).maybeSingle();
  if (!t) return { ok: false, error: 'ほかの店舗のセラピストは確定できません' };
  if (t.is_active === false) return { ok: false, error: '非公開の方には出勤を入れられません。先に公開にしてください' };
  const { data: req } = await r.svc.from('shift_requests').select('id').eq('therapist_id', therapistId).eq('work_date', date).maybeSingle();
  if (!req) return { ok: false, error: 'この日の希望が見つかりません（取り消された可能性があります）。読み直してください' };

  // ── 部屋数（出勤の正本で数える・本人のその日の行は入れ替わるので外す）──
  const settings = await readSettings(r.svc, r.salonId);
  if (settings.roomCount > 0) {
    const { data: ts } = await r.svc.from('therapists').select('id').eq('salon_id', r.salonId);
    const ids = (ts ?? []).map((x) => Number(x.id));
    const scheds = await readSchedules(r.svc, ids, addDays(date, -1), addDays(date, 1));
    const others: OccupyShift[] = [];
    for (const [k, m] of scheds) {
      const [tid, d] = k.split('#');
      if (Number(tid) === therapistId && d === date) continue;
      others.push({ date: d, s: m.s, e: m.e });
    }
    const chk = checkRooms({ date, s: v.s, e: v.e }, others, settings.roomCount, settings.changeoverMin);
    if (!chk.ok) return { ok: false, error: `確定できません: ${roomErrorText(chk, settings.roomCount, settings.changeoverMin)}` };
  }

  // ── 出勤の正本に書く（週間スケジュールと同じ形・人が入れた行の印 imported_at = null）──
  const { error: e1 } = await r.svc.from('therapist_schedules').upsert([{
    therapist_id: therapistId, schedule_date: date, is_active: true,
    start_time: minToHM(v.s), end_time: minToHM(v.e), imported_at: null,
  }], { onConflict: 'therapist_id,schedule_date' });
  if (e1) return { ok: false, error: `出勤を保存できませんでした: ${e1.message}` };
  const now = new Date().toISOString();
  const { error: e2 } = await r.svc.from('shift_requests')
    .update({ status: 'confirmed', conf_start_min: v.s, conf_end_min: v.e, confirmed_at: now, updated_at: now })
    .eq('therapist_id', therapistId).eq('work_date', date);
  if (e2) return { ok: false, error: `出勤は入りましたが、確定の印を付けられませんでした: ${e2.message}` };
  return { ok: true, data: { therapistId, date } };
}

export async function saveShiftSettings(input: { period: string; roomCount: number; changeoverMin: number }): Promise<Result<ShiftSettings>> {
  const r = await resolveShop(false);
  if (!r.ok) return r;
  if (!isShiftPeriod(input.period)) return { ok: false, error: '提出期間を選んでください' };
  const roomCount = Math.trunc(Number(input.roomCount));
  if (!Number.isFinite(roomCount) || roomCount < 0 || roomCount > SHIFT_ROOM_MAX) return { ok: false, error: `部屋数は0〜${SHIFT_ROOM_MAX}で入れてください` };
  const changeoverMin = Math.trunc(Number(input.changeoverMin));
  if (!(SHIFT_CHANGEOVER_OPTIONS as readonly number[]).includes(changeoverMin)) return { ok: false, error: '入れ替え時間を選んでください' };
  const { error } = await r.svc.from('shift_settings').upsert([{
    salon_id: r.salonId, period: input.period, room_count: roomCount, changeover_min: changeoverMin, updated_at: new Date().toISOString(),
  }], { onConflict: 'salon_id' });
  if (error) return { ok: false, error: `保存できませんでした: ${error.message}` };
  return { ok: true, data: { period: input.period, roomCount, changeoverMin } };
}

// ══════════════ 週間スケジュールの「希望していた人」（第1732便・見るだけ）══════════════
// ★ 欠勤が出たときの声かけ用（カッキーさん）。その日に希望を出したまま確定していない人（＝出勤が入っていない人）だけ。
// ★ 見るだけ。ここから出勤には変えない。あとは店舗様がセラピストと直接やり取りする。
// ★ 使えない店・読めないときは空（週間スケジュールそのものは止めない）。
export type ShiftWish = { therapistId: number; name: string; s: number; e: number; note: string };
export async function getShiftWishes(input: { from: string; to: string }): Promise<Record<string, ShiftWish[]>> {
  try {
    const r = await resolveShop(false);
    if (!r.ok) return {};
    const from = String(input.from ?? ''), to = String(input.to ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from || to > addDays(from, 40)) return {};
    const { data: reqs } = await r.svc.from('shift_requests').select('therapist_id, work_date, req_start_min, req_end_min, note')
      .eq('salon_id', r.salonId).eq('status', 'requested').gte('work_date', from).lte('work_date', to);
    if (!reqs || reqs.length === 0) return {};
    const ids = [...new Set(reqs.map((x) => Number(x.therapist_id)))];
    const [{ data: ts }, scheds] = await Promise.all([
      r.svc.from('therapists').select('id, name').eq('salon_id', r.salonId).in('id', ids),
      readSchedules(r.svc, ids, from, to),
    ]);
    const names = new Map((ts ?? []).map((t) => [Number(t.id), String(t.name ?? '')]));
    const out: Record<string, ShiftWish[]> = {};
    for (const x of reqs) {
      const tid = Number(x.therapist_id), d = String(x.work_date);
      if (!names.has(tid)) continue;
      if (scheds.has(`${tid}#${d}`)) continue; // ★ 週間スケジュールで出勤が入っている人は出さない
      (out[d] ??= []).push({ therapistId: tid, name: names.get(tid)!, s: Number(x.req_start_min), e: Number(x.req_end_min), note: String(x.note ?? '') });
    }
    for (const d of Object.keys(out)) out[d].sort((a, b) => a.s - b.s);
    return out;
  } catch {
    return {};
  }
}

/**
 * ★ 第1737便（カッキーさん）: 確定を取り消して希望に戻す。
 * ★ 週間スケジュールの出勤も消す（お休みに戻す）。ただし【確定したのと同じ時間のときだけ】。
 *   週間スケジュールで時間を直していた日は、店舗様が手で入れた出勤なので消さない（removed=false で返す）。
 * ★ 過ぎた日は取り消さない。
 */
export async function unconfirmShift(input: { therapistId: number; date: string }): Promise<Result<{ removed: boolean }>> {
  const r = await resolveShop(true);
  if (!r.ok) return r;
  const therapistId = Math.trunc(Number(input.therapistId));
  const date = String(input.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '日付が正しくありません' };
  if (date < getBusinessDateJST()) return { ok: false, error: '過ぎた日は取り消せません' };
  const { data: req } = await r.svc.from('shift_requests').select('status, conf_start_min, conf_end_min')
    .eq('salon_id', r.salonId).eq('therapist_id', therapistId).eq('work_date', date).maybeSingle();
  if (!req) return { ok: false, error: 'この日の希望が見つかりません。読み直してください' };
  if (req.status !== 'confirmed') return { ok: false, error: 'この日はまだ確定していません' };

  // ── 週間スケジュールの出勤（確定と同じ時間のときだけ外す）──
  let removed = false;
  const scheds = await readSchedules(r.svc, [therapistId], date, date);
  const now = scheds.get(`${therapistId}#${date}`);
  if (now && now.s === Number(req.conf_start_min) && now.e === Number(req.conf_end_min)) {
    const { error } = await r.svc.from('therapist_schedules').upsert([{
      therapist_id: therapistId, schedule_date: date, is_active: false, start_time: null, end_time: null, imported_at: null,
    }], { onConflict: 'therapist_id,schedule_date' });
    if (error) return { ok: false, error: `週間スケジュールの出勤を外せませんでした: ${error.message}` };
    removed = true;
  }
  const { error: e2 } = await r.svc.from('shift_requests')
    .update({ status: 'requested', conf_start_min: null, conf_end_min: null, confirmed_at: null, updated_at: new Date().toISOString() })
    .eq('therapist_id', therapistId).eq('work_date', date);
  if (e2) return { ok: false, error: `希望に戻せませんでした: ${e2.message}` };
  return { ok: true, data: { removed } };
}
