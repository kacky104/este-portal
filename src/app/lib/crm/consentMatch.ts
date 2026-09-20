// フクエスCRM：同意書（第560便・2026-09-20）。部屋の QR から「いまのその部屋の予約」を探す（サーバー専用）。
//
// ★ 部屋は予約ではなく、セラピストのその日の出勤情報（crm_work_days.room）に付いている。
//   → その部屋に入っているセラピストの、いまの予約（開始30分前〜終わり）を候補にする。
// ★ 候補が0件なら受け付けない（いたずら対策：その部屋にいま予約がある時間だけ）。
// ★ 2件以上なら、画面で「時刻だけ」を並べて選んでもらう（お客様の名前は出さない）。

import type { createServiceClient } from '@/app/lib/supabase/service';

type Svc = ReturnType<typeof createServiceClient>;

export type ConsentCandidate = { bookingId: string; therapistId: number | null; timeLabel: string; slotStartISO: string };

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

export async function consentCandidates(svc: Svc, salonId: number, room: string, now = Date.now()): Promise<ConsentCandidate[]> {
  const bd = businessDateNowJST(now);
  const { data: wd } = await svc
    .from('crm_work_days').select('therapist_id')
    .eq('salon_id', salonId).eq('room', room).eq('business_date', bd);
  const tids = [...new Set((wd ?? []).map((r) => Number(r.therapist_id)))];
  if (tids.length === 0) return [];
  const { data: bs } = await svc
    .from('salon_bookings').select('id, therapist_id, slot_start, slot_end')
    .eq('salon_id', salonId)
    .in('therapist_id', tids)
    .neq('status', 'cancelled')
    .lte('slot_start', new Date(now + BEFORE_MIN * 60000).toISOString())
    .gt('slot_end', new Date(now).toISOString())
    .order('slot_start');
  return (bs ?? []).map((b) => ({
    bookingId: String(b.id),
    therapistId: b.therapist_id == null ? null : Number(b.therapist_id),
    timeLabel: jstHHMM(String(b.slot_start)),
    slotStartISO: String(b.slot_start),
  }));
}
