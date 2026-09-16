'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateRangeJST } from '@/lib/dutyStatus';
import { sortTherapistsByKana } from '@/lib/therapistOrder';
import { CONECF_SCHEDULE_DAYS, normalizeShifts, type ConecfShift, type ConecfShiftInput } from '@/lib/conecfSchedule';

// コネックエフ「週間スケジュール」の受け口（第399便・1d・2026-09-17）。
// ★ 保存先はフクエスの therapist_schedules（★ /mypage の出勤と同じ行）。★ 保存した時点でフクエスに出る。
// ★ 駅ちか・エステ魂へは「出勤をサイトへ」の自動更新（media-auto-push・30分以内）が拾う。★ ここでは送らない。
// ★ 書き込みは「コネックエフに切り替え済み」の自店だけ（service_role・列を限定）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc
    .from('salons')
    .select('id, conecf_enabled_at')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) {
    return { ok: false as const, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  }
  return { ok: true as const, svc, salonId: Number(salon.id) };
}

export type ConecfScheduleRow = { id: number; name: string; imageUrl: string | null; isActive: boolean; days: ConecfShift[] };

export async function getConecfSchedule(): Promise<Result<{ salonId: number; dates: string[]; rows: ConecfScheduleRow[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const dates = getBusinessDateRangeJST(CONECF_SCHEDULE_DAYS);
  const { data: ts, error } = await r.svc
    .from('therapists')
    .select('id, name, profile_image_url, is_active')
    .eq('salon_id', r.salonId);
  if (error) return { ok: false, error: error.message };
  const ids = (ts ?? []).map((t) => Number(t.id));
  const map = new Map<string, ConecfShift>();
  if (ids.length > 0) {
    const { data: sc } = await r.svc
      .from('therapist_schedules')
      .select('therapist_id, schedule_date, is_active, start_time, end_time')
      .in('therapist_id', ids)
      .gte('schedule_date', dates[0])
      .lte('schedule_date', dates[dates.length - 1]);
    (sc ?? []).forEach((x) => map.set(`${x.therapist_id}#${x.schedule_date}`, {
      date: String(x.schedule_date),
      isActive: x.is_active === true,
      start: x.start_time ? String(x.start_time).slice(0, 5) : null,
      end: x.end_time ? String(x.end_time).slice(0, 5) : null,
    }));
  }
  const rows: ConecfScheduleRow[] = (ts ?? []).map((t) => ({
    id: Number(t.id),
    name: (t.name as string | null) ?? '',
    imageUrl: (t.profile_image_url as string | null) ?? null,
    isActive: t.is_active !== false,
    days: dates.map((d) => map.get(`${t.id}#${d}`) ?? { date: d, isActive: false, start: null, end: null }),
  }));
  return {
    ok: true,
    data: { salonId: r.salonId, dates, rows: sortTherapistsByKana(rows, (x) => x.name, (x) => !x.isActive) },
  };
}

export async function saveConecfSchedule(input: {
  changes: Array<{ therapistId: number; shifts: ConecfShiftInput[] }>;
}): Promise<Result<{ therapists: number; days: number }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const dates = getBusinessDateRangeJST(CONECF_SCHEDULE_DAYS);
  const changes = Array.isArray(input.changes) ? input.changes : [];
  if (changes.length === 0) return { ok: true, data: { therapists: 0, days: 0 } };

  const ids = [...new Set(changes.map((c) => Number(c.therapistId)))];
  const { data: own } = await r.svc.from('therapists').select('id, is_active').eq('salon_id', r.salonId).in('id', ids);
  const ownMap = new Map((own ?? []).map((t) => [Number(t.id), t.is_active !== false]));

  const rows: Array<Record<string, unknown>> = [];
  for (const c of changes) {
    const id = Number(c.therapistId);
    if (!ownMap.has(id)) return { ok: false, error: 'ほかの店舗のセラピストは保存できません' };
    const n = normalizeShifts(c.shifts, dates);
    if (!n.ok) return n;
    // ★ 非公開の方に出勤は入れない（setTherapistActive が先の出勤を外す決めごとと合わせる）
    if (ownMap.get(id) === false && n.shifts.some((s) => s.isActive)) {
      return { ok: false, error: '非公開の方には出勤を入れられません。先に公開にしてください' };
    }
    n.shifts.forEach((s) => rows.push({
      therapist_id: id, schedule_date: s.date, is_active: s.isActive, start_time: s.start, end_time: s.end,
    }));
  }
  const { error } = await r.svc.from('therapist_schedules').upsert(rows, { onConflict: 'therapist_id,schedule_date' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { therapists: ids.length, days: rows.length } };
}
