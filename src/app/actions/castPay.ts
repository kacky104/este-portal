'use server';

// /cast の「報酬明細」（第572便・2026-09-20）。★ セラピスト本人が、お店が報酬確定した日の自分の報酬を見る。
// ★ 見せるのは、お店が CRM 契約中で、設定タブの「セラピストに報酬明細を見せる」（crm_settings.cast_pay_enabled）が ON のときだけ。
// ★ お客様の名前・電話番号・料金・お店の売上は返さない（時刻・コース・報酬だけ）。
// ★ ログイン中の user_id → therapists.id を確かめてから service_role で読む（castCustomers と同じ流儀）。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';

export type CastPayItem = { time: string; course: string; pay: number | null };
export type CastPayDay = { date: string; bookingCount: number; payTotal: number; allowance: number; note: string; total: number; items: CastPayItem[] };

type Svc = ReturnType<typeof createServiceClient>;

async function me(): Promise<{ svc: Svc; therapistId: number; salonId: number } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const { data } = await svc.from('therapists').select('id, salon_id').eq('user_id', user.id).maybeSingle();
  if (!data?.id || data.salon_id == null) return null;
  return { svc, therapistId: Number(data.id), salonId: Number(data.salon_id) };
}

async function enabledFor(svc: Svc, salonId: number): Promise<boolean> {
  const [{ data: salon }, { data: st }] = await Promise.all([
    svc.from('salons').select('crm_until').eq('id', salonId).maybeSingle(),
    svc.from('crm_settings').select('cast_pay_enabled').eq('salon_id', salonId).maybeSingle(),
  ]);
  const active = !!salon?.crm_until && String(salon.crm_until).slice(0, 10) >= getCalendarDateJST();
  return active && !!st?.cast_pay_enabled;
}

/** /cast でタブを出すかどうか */
export async function isCastPayEnabled(): Promise<boolean> {
  const m = await me();
  if (!m) return false;
  return enabledFor(m.svc, m.salonId);
}

/** 月の報酬明細（ym は YYYY-MM・報酬確定した日だけ） */
export async function getCastPayMonth(
  ym: string,
): Promise<{ ok: true; days: CastPayDay[]; total: number } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: '月が正しくありません' };
  const m = await me();
  if (!m) return { ok: false, error: 'ログインしてください' };
  if (!(await enabledFor(m.svc, m.salonId))) return { ok: false, error: 'お店が報酬明細を公開していません' };
  const [y, mo] = ym.split('-').map(Number);
  const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
  const { data: cs, error } = await m.svc
    .from('crm_pay_confirms').select('business_date, booking_count, pay_total, allowance, note')
    .eq('salon_id', m.salonId).eq('therapist_id', m.therapistId)
    .gte('business_date', `${ym}-01`).lt('business_date', next)
    .order('business_date', { ascending: false });
  if (error) return { ok: false, error: '読み込めませんでした' };
  const days: CastPayDay[] = [];
  for (const c of cs ?? []) {
    const date = String(c.business_date);
    const start = new Date(`${date}T06:00:00+09:00`);
    const end = new Date(start.getTime() + 24 * 3600_000);
    const { data: bs } = await m.svc
      .from('salon_bookings').select('slot_start, course_name, pay_total')
      .eq('salon_id', m.salonId).eq('therapist_id', m.therapistId).neq('status', 'cancelled')
      .gte('slot_start', start.toISOString()).lt('slot_start', end.toISOString())
      .order('slot_start');
    const payTotal = Number(c.pay_total) || 0;
    const allowance = Number(c.allowance) || 0;
    days.push({
      date,
      bookingCount: Number(c.booking_count) || 0,
      payTotal,
      allowance,
      note: String(c.note ?? ''),
      total: payTotal + allowance,
      items: (bs ?? []).map((b) => ({
        time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(String(b.slot_start))),
        course: String(b.course_name ?? ''),
        pay: b.pay_total == null ? null : Number(b.pay_total),
      })),
    });
  }
  return { ok: true, days, total: days.reduce((a, d) => a + d.total, 0) };
}
