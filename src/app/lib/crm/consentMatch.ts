// フクエスCRM：同意書（第560便・2026-09-20）。部屋の QR から「いまのその部屋の予約」を探す（サーバー専用）。
//
// ★ 部屋は予約ではなく、セラピストのその日の出勤情報（crm_work_days.room）に付いている。
//   → その部屋に入っているセラピストの、いまの予約（開始30分前〜終わり）を候補にする。
// ★ 候補が0件なら受け付けない（いたずら対策：その部屋にいま予約がある時間だけ）。
// ★ 2件以上なら、画面で「時刻だけ」を並べて選んでもらう（お客様の名前は出さない）。
// ★ 第1669便: 提携店がこの部屋を借りている日は、その店の予約も候補（salonId で区別）。

import type { createServiceClient } from '@/app/lib/supabase/service';
import { borrowersOfRoom } from '@/app/lib/crm/roomShare';

type Svc = ReturnType<typeof createServiceClient>;

export type ConsentCandidate = { bookingId: string; salonId: number; therapistId: number | null; timeLabel: string; slotStartISO: string };

const BEFORE_MIN = 30;

export function businessDateNowJST(now = Date.now()): string {
  return new Date(now + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
}

export function jstHHMM(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** token → 店と部屋（無ければ null） */
export async function roomOfToken(svc: Svc, token: string): Promise<{ salonId: number; room: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await svc.from('crm_room_tokens').select('salon_id, room').eq('token', token).maybeSingle();
  if (!data) return null;
  return { salonId: Number(data.salon_id), room: String(data.room) };
}

/**
 * その部屋の、いまの予約の候補。
 * ★ 第1669便（提携店の部屋共有）: その部屋を【借りている】提携店の出勤（crm_work_days.room_salon_id＝この店）も候補にする。
 *   候補には「どの店の予約か」（salonId）を持たせ、同意書の文面・保存先・完了画面は予約の店のものを使う。
 */
export async function consentCandidates(svc: Svc, salonId: number, room: string, now = Date.now()): Promise<ConsentCandidate[]> {
  const bd = businessDateNowJST(now);
  const { data: wd } = await svc
    .from('crm_work_days').select('therapist_id')
    .eq('salon_id', salonId).eq('room', room).eq('business_date', bd).is('room_salon_id', null);
  const groups: Array<{ salonId: number; tids: number[] }> = [];
  const own = [...new Set((wd ?? []).map((r) => Number(r.therapist_id)))];
  if (own.length > 0) groups.push({ salonId, tids: own });
  for (const b of await borrowersOfRoom(svc, salonId, room, bd)) {
    const g = groups.find((x) => x.salonId === b.salonId);
    if (g) { if (!g.tids.includes(b.therapistId)) g.tids.push(b.therapistId); } else groups.push({ salonId: b.salonId, tids: [b.therapistId] });
  }
  if (groups.length === 0) return [];
  const out: ConsentCandidate[] = [];
  for (const g of groups) {
    const { data: bs } = await svc
      .from('salon_bookings').select('id, therapist_id, slot_start, slot_end')
      .eq('salon_id', g.salonId)
      .in('therapist_id', g.tids)
      .neq('status', 'cancelled')
      .lte('slot_start', new Date(now + BEFORE_MIN * 60000).toISOString())
      .gt('slot_end', new Date(now).toISOString());
    for (const b of bs ?? []) {
      out.push({
        bookingId: String(b.id),
        salonId: g.salonId,
        therapistId: b.therapist_id == null ? null : Number(b.therapist_id),
        timeLabel: jstHHMM(String(b.slot_start)),
        slotStartISO: String(b.slot_start),
      });
    }
  }
  out.sort((a, b) => a.slotStartISO.localeCompare(b.slotStartISO));
  return out;
}
