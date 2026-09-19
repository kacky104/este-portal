// フクエスCRM：休憩の時間に予約を入れさせない（第551便・2026-09-20）。
//
// ★ 休憩は crm_work_days（セラピスト×営業日・break_start_min/break_end_min＝その日 0:00 からの分）。
// ★ 予約の開始がその日（暦日）でも前日の営業日の夜跨ぎでもありうるので、前日と当日の2日分を見る。
// ★ 予約ボード（無料）の手入力・移動・内容編集でも同じく止める（同じ予約・同じ担当のため）。
// ★ 読めなかったときは止めない（null を返す＝ぶつかっていない扱い）。休憩の見張りで予約そのものを止めない。

import type { createServiceClient } from '@/app/lib/supabase/service';

type Svc = ReturnType<typeof createServiceClient>;

function jstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}
function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function hm(min: number): string {
  return `${min >= 1440 ? '翌' : ''}${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;
}

/** ぶつかる休憩があれば、画面に出す文を返す。無ければ null */
export async function breakConflict(
  svc: Svc,
  salonId: number,
  therapistId: number,
  slotStart: Date,
  slotEnd: Date,
): Promise<string | null> {
  try {
    const d = jstDate(slotStart.getTime());
    const { data } = await svc
      .from('crm_work_days')
      .select('business_date, break_start_min, break_end_min')
      .eq('salon_id', salonId)
      .eq('therapist_id', therapistId)
      .in('business_date', [shift(d, -1), d])
      .not('break_start_min', 'is', null)
      .not('break_end_min', 'is', null);
    for (const r of data ?? []) {
      const base = new Date(`${String(r.business_date)}T00:00:00+09:00`).getTime();
      const bs = base + Number(r.break_start_min) * 60000;
      const be = base + Number(r.break_end_min) * 60000;
      if (slotStart.getTime() < be && slotEnd.getTime() > bs) {
        return `休憩の時間（${hm(Number(r.break_start_min))}〜${hm(Number(r.break_end_min))}）には予約を入れられません`;
      }
    }
    return null;
  } catch {
    return null;
  }
}
