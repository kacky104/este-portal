// フクエスCRM：提携店の部屋共有（第1669便・2026-10-27・カッキーさんの決定）。
//
// ★ 例: ラビリンスの「きほ」＝ enju の「かるあ」。enju の予約のお客様がラビリンスの部屋Aに入る。
// ★ 考え方: 「同じ日に同じ部屋を登録している出勤は、どの店のものでも『その部屋の予定』として扱う」。
//   人のつながり（きほ＝かるあ）は持たない。部屋で結ぶ。
// ★ 部屋の鍵 ＝ (部屋の店, 部屋名)。
//   ・自店の部屋 … crm_work_days.room_salon_id が null → 鍵は (自店, room)
//   ・借りた部屋 … crm_work_days.room_salon_id が相手の店 → 鍵は (相手の店, room)
// ★ 使えるのは、部屋共有のペア（crm_room_share_pairs・ended_at null・第1670便）を組んでいる店どうしだけ。
//   ★ NG・要注意の共有グループとは別。ペアを終わらせた店の出勤は見ない。
// ★ 読めなかったときは空（＝今までどおり）。部屋共有の見張りで、本日画面・ネット予約そのものを止めない。
// ★ 返すのは時間帯と店名・部屋名だけ。お客様の名前・電話は返さない。

import type { createServiceClient } from '@/app/lib/supabase/service';
import { crmGroupTableMissing } from '@/app/lib/crm/groupAlerts';

type Svc = ReturnType<typeof createServiceClient>;

/** 本日画面の帯・受付の確認に使う1本 */
export type RoomShareBand = { startISO: string; endISO: string; salonName: string; room: string };

/** 出勤情報の「待機場所」に並べる、提携店の部屋 */
export type PartnerRoom = { salonId: number; salonName: string; room: string };

/**
 * 部屋共有の相手の店。
 * ★ 第1670便: NG 共有のグループとは【別】の表 crm_room_share_pairs（店と店のペア・運営だけが作る）で持つ。
 *   groupId は互換のために残す（常に 0）。
 */
export async function roomSharePartners(svc: Svc, salonId: number): Promise<{ groupId: number; partners: Array<{ salonId: number; name: string }> } | null> {
  try {
    const { data, error, status } = await svc.from('crm_room_share_pairs')
      .select('salon_a, salon_b').is('ended_at', null).or(`salon_a.eq.${salonId},salon_b.eq.${salonId}`);
    if (error) { if (!crmGroupTableMissing(error, status)) console.error('[roomShare] ペアを読めなかった', salonId, error.message); return null; }
    const ids = [...new Set((data ?? []).map((r) => (Number(r.salon_a) === salonId ? Number(r.salon_b) : Number(r.salon_a))).filter((x) => x !== salonId))];
    if (ids.length === 0) return null;
    const { data: salons } = await svc.from('salons').select('id, name').in('id', ids);
    const names = new Map<number, string>();
    for (const s of salons ?? []) names.set(Number(s.id), String(s.name ?? ''));
    return { groupId: 0, partners: ids.map((id) => ({ salonId: id, name: names.get(id) ?? `店${id}` })) };
  } catch (e) {
    console.error('[roomShare] partners', salonId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** 出勤情報の「待機場所」に並べる、提携店の部屋の一覧（自店が部屋共有のグループに入っているときだけ） */
export async function partnerRoomOptions(svc: Svc, salonId: number): Promise<PartnerRoom[]> {
  const ps = await roomSharePartners(svc, salonId);
  if (!ps || ps.partners.length === 0) return [];
  try {
    const { data } = await svc.from('crm_settings').select('salon_id, rooms').in('salon_id', ps.partners.map((p) => p.salonId));
    const out: PartnerRoom[] = [];
    for (const p of ps.partners) {
      const row = (data ?? []).find((r) => Number(r.salon_id) === p.salonId);
      const rooms = Array.isArray(row?.rooms) ? (row!.rooms as unknown[]).map(String).filter(Boolean) : [];
      for (const room of rooms) out.push({ salonId: p.salonId, salonName: p.name, room });
    }
    return out;
  } catch (e) {
    console.error('[roomShare] partnerRooms', salonId, e instanceof Error ? e.message : String(e));
    return [];
  }
}

type Occupant = { salonId: number; therapistId: number; room: string; keySalon: number };

/**
 * その営業日に「鍵 (keySalon, room)」の部屋を使っている、自店【以外】の出勤（相手の店のものだけ）。
 * ・鍵の店が自分で使う行（room_salon_id null・room 一致）
 * ・借りている店の行（room_salon_id = keySalon・room 一致）
 */
async function occupantsOfKeys(
  svc: Svc, dateISO: string, keys: Array<{ keySalon: number; room: string }>, exceptSalon: number, partnerIds: Set<number>,
): Promise<Occupant[]> {
  if (keys.length === 0) return [];
  const keySalons = [...new Set(keys.map((k) => k.keySalon))];
  const rooms = [...new Set(keys.map((k) => k.room))];
  const allowed = new Set([...partnerIds, exceptSalon]);
  const [own, borrowed] = await Promise.all([
    svc.from('crm_work_days').select('salon_id, therapist_id, room')
      .eq('business_date', dateISO).in('salon_id', keySalons).in('room', rooms).is('room_salon_id', null),
    svc.from('crm_work_days').select('salon_id, therapist_id, room, room_salon_id')
      .eq('business_date', dateISO).in('room_salon_id', keySalons).in('room', rooms),
  ]);
  const out: Occupant[] = [];
  const has = (keySalon: number, room: string) => keys.some((k) => k.keySalon === keySalon && k.room === room);
  for (const r of own.data ?? []) {
    const sid = Number(r.salon_id);
    if (sid === exceptSalon || !allowed.has(sid) || !has(sid, String(r.room))) continue;
    out.push({ salonId: sid, therapistId: Number(r.therapist_id), room: String(r.room), keySalon: sid });
  }
  for (const r of borrowed.data ?? []) {
    const sid = Number(r.salon_id);
    const ks = Number(r.room_salon_id);
    if (sid === exceptSalon || !allowed.has(sid) || !has(ks, String(r.room))) continue;
    out.push({ salonId: sid, therapistId: Number(r.therapist_id), room: String(r.room), keySalon: ks });
  }
  return out;
}

/** 営業日 → その日の予約を探す範囲（JST 0:00 〜 翌7:00） */
function dayRange(dateISO: string): { from: string; to: string } {
  const base = new Date(`${dateISO}T00:00:00+09:00`).getTime();
  return { from: new Date(base).toISOString(), to: new Date(base + 31 * 3600_000).toISOString() };
}

async function bookingsOf(svc: Svc, occupants: Occupant[], fromISO: string, toISO: string) {
  if (occupants.length === 0) return [] as Array<{ therapist_id: unknown; slot_start: unknown; slot_end: unknown }>;
  const { data } = await svc.from('salon_bookings').select('therapist_id, slot_start, slot_end')
    .in('therapist_id', [...new Set(occupants.map((o) => o.therapistId))])
    .neq('status', 'cancelled')
    .lt('slot_start', toISO).gt('slot_end', fromISO)
    .order('slot_start');
  return data ?? [];
}

/**
 * 本日画面の帯（両方向）: 自店のセラピストごとに、同じ日に同じ部屋を使う相手の店の予約の時間帯。
 * ★ 自店の出勤に部屋が無い人は空。
 */
export async function sharedRoomBands(svc: Svc, salonId: number, dateISO: string): Promise<Record<number, RoomShareBand[]>> {
  try {
    const ps = await roomSharePartners(svc, salonId);
    if (!ps || ps.partners.length === 0) return {};
    const partnerIds = new Set(ps.partners.map((p) => p.salonId));
    const names = new Map(ps.partners.map((p) => [p.salonId, p.name] as const));
    const { data: mine } = await svc.from('crm_work_days').select('therapist_id, room, room_salon_id')
      .eq('salon_id', salonId).eq('business_date', dateISO).neq('room', '');
    const keyOf = new Map<number, { keySalon: number; room: string }>();
    for (const r of mine ?? []) {
      const room = String(r.room ?? '').trim();
      if (!room) continue;
      const ks = r.room_salon_id == null ? salonId : Number(r.room_salon_id);
      if (ks !== salonId && !partnerIds.has(ks)) continue; // 外れたグループの部屋は見ない
      keyOf.set(Number(r.therapist_id), { keySalon: ks, room });
    }
    if (keyOf.size === 0) return {};
    const keys = [...new Map([...keyOf.values()].map((k) => [`${k.keySalon}::${k.room}`, k])).values()];
    const occ = await occupantsOfKeys(svc, dateISO, keys, salonId, partnerIds);
    if (occ.length === 0) return {};
    const { from, to } = dayRange(dateISO);
    const bs = await bookingsOf(svc, occ, from, to);
    const out: Record<number, RoomShareBand[]> = {};
    for (const [tid, k] of keyOf) {
      const users = occ.filter((o) => o.keySalon === k.keySalon && o.room === k.room);
      const bands: RoomShareBand[] = [];
      for (const u of users) {
        for (const b of bs) {
          if (Number(b.therapist_id) !== u.therapistId) continue;
          bands.push({ startISO: String(b.slot_start), endISO: String(b.slot_end), salonName: names.get(u.salonId) ?? '提携店', room: k.room });
        }
      }
      if (bands.length > 0) out[tid] = bands;
    }
    return out;
  } catch (e) {
    console.error('[roomShare] bands', salonId, e instanceof Error ? e.message : String(e));
    return {};
  }
}

function jstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}
function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 1人のセラピストについて、ある時間の範囲で「同じ部屋を使う相手の店の予約」を返す。
 * ネット予約の空き枠（getSlots / createBooking）と、CRM の受付の確認に使う。
 * 返す形は既存予約と同じ { slot_start, slot_end }（UTC ISO）＋店名・部屋名。
 */
export async function sharedRoomBlocks(
  svc: Svc, therapistId: number, fromUtc: Date, toUtc: Date,
): Promise<Array<{ slot_start: string; slot_end: string; salonName: string; room: string }>> {
  try {
    const d0 = jstDate(fromUtc.getTime());
    const d1 = jstDate(toUtc.getTime());
    const dates = [...new Set([shift(d0, -1), d0, d1])];
    const { data: mine } = await svc.from('crm_work_days').select('salon_id, business_date, room, room_salon_id')
      .eq('therapist_id', therapistId).in('business_date', dates).neq('room', '');
    const rows = (mine ?? []).filter((r) => String(r.room ?? '').trim());
    if (rows.length === 0) return [];
    const salonId = Number(rows[0].salon_id);
    const ps = await roomSharePartners(svc, salonId);
    if (!ps || ps.partners.length === 0) return [];
    const partnerIds = new Set(ps.partners.map((p) => p.salonId));
    const names = new Map(ps.partners.map((p) => [p.salonId, p.name] as const));
    const out: Array<{ slot_start: string; slot_end: string; salonName: string; room: string }> = [];
    for (const r of rows) {
      const room = String(r.room).trim();
      const ks = r.room_salon_id == null ? salonId : Number(r.room_salon_id);
      if (ks !== salonId && !partnerIds.has(ks)) continue;
      const date = String(r.business_date);
      const occ = await occupantsOfKeys(svc, date, [{ keySalon: ks, room }], salonId, partnerIds);
      if (occ.length === 0) continue;
      const { from, to } = dayRange(date);
      const bs = await bookingsOf(svc, occ, from, to);
      for (const b of bs) {
        const s = new Date(String(b.slot_start)).getTime();
        const e = new Date(String(b.slot_end)).getTime();
        if (!(s < toUtc.getTime() && e > fromUtc.getTime())) continue;
        const u = occ.find((o) => o.therapistId === Number(b.therapist_id));
        out.push({ slot_start: String(b.slot_start), slot_end: String(b.slot_end), salonName: names.get(u?.salonId ?? 0) ?? '提携店', room });
      }
    }
    return out;
  } catch (e) {
    console.error('[roomShare] blocks', therapistId, e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** CRM の受付・変更で、相手の店の予約と重なるなら、確認に出す文を返す（止めはしない） */
export async function sharedRoomWarning(svc: Svc, therapistId: number, slotStart: Date, slotEnd: Date): Promise<string | null> {
  const hits = await sharedRoomBlocks(svc, therapistId, slotStart, slotEnd);
  if (hits.length === 0) return null;
  const hm = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  const h = hits[0];
  return `${h.room} は ${h.salonName} の予約（${hm(h.slot_start)}〜${hm(h.slot_end)}）と重なります`;
}

/** 同意書: 鍵 (keySalon, room) の部屋を借りている相手の店の出勤（セラピスト）。QR の店が部屋共有のグループに入っているときだけ */
export async function borrowersOfRoom(svc: Svc, keySalon: number, room: string, dateISO: string): Promise<Array<{ salonId: number; therapistId: number }>> {
  try {
    const ps = await roomSharePartners(svc, keySalon);
    if (!ps || ps.partners.length === 0) return [];
    const partnerIds = new Set(ps.partners.map((p) => p.salonId));
    const { data } = await svc.from('crm_work_days').select('salon_id, therapist_id')
      .eq('business_date', dateISO).eq('room_salon_id', keySalon).eq('room', room);
    return (data ?? [])
      .map((r) => ({ salonId: Number(r.salon_id), therapistId: Number(r.therapist_id) }))
      .filter((r) => partnerIds.has(r.salonId));
  } catch (e) {
    console.error('[roomShare] borrowers', keySalon, e instanceof Error ? e.message : String(e));
    return [];
  }
}
