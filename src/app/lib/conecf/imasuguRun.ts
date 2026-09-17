import { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateJST, getNowJSTMinutes } from '@/lib/dutyStatus';
import { imasuguMax, imasuguUntilISO, isCastLiveRow } from '@/lib/imasugu';
import { isOnDutyNow, pickImasugu, type ImasuguOrderMode, type ImasuguPriorityRule } from '@/lib/conecfImasugu';

// コネックエフ「今すぐ一括」の1店ぶんの周（第401便・1e）。★ サーバー専用（'use server' ではない）。
// ★ 呼ぶ場所: /api/admin/conecf-imasugu（10分ごと・全店）／画面の「いま回す」（1店）。
// ★ 書くのは therapists の【店舗の枠】（is_available_now / available_until）と members.last_on_at だけ。
//   ★ 本人の枠（_cast）・駅ちか取り込みの枠（_import）は触らない。

type Svc = ReturnType<typeof createServiceClient>;

export type ImasuguRunResult = {
  salonId: number;
  candidates: number;
  on: Array<{ id: number; name: string }>;
  off: number;
  skipped?: string;
};

export async function runImasuguForSalon(svc: Svc, salonId: number, apply: boolean, now = new Date()): Promise<ImasuguRunResult> {
  const { data: salon } = await svc.from('salons').select('id, jobs_enabled, conecf_enabled_at, is_hidden').eq('id', salonId).maybeSingle();
  if (!salon || salon.is_hidden) return { salonId, candidates: 0, on: [], off: 0, skipped: 'salon-hidden' };
  if (!salon.conecf_enabled_at) return { salonId, candidates: 0, on: [], off: 0, skipped: 'conecf-not-enabled' };

  const { data: st } = await svc.from('conecf_imasugu_settings').select('*').eq('salon_id', salonId).maybeSingle();
  const orderMode = (st?.order_mode as ImasuguOrderMode) ?? 'priority';
  const rule = (st?.priority_rule as ImasuguPriorityRule) ?? 'list';
  const batchSize = Number(st?.batch_size ?? 1);

  const { data: ts } = await svc
    .from('therapists')
    .select('id, name, is_active, is_available_now, available_until, is_available_now_cast, available_until_cast')
    .eq('salon_id', salonId);
  const today = getBusinessDateJST();
  const ids = (ts ?? []).map((t) => Number(t.id));
  const { data: sc } = ids.length > 0
    ? await svc.from('therapist_schedules').select('therapist_id, is_active, start_time, end_time').in('therapist_id', ids).eq('schedule_date', today)
    : { data: [] as Array<{ therapist_id: number; is_active: boolean; start_time: string | null; end_time: string | null }> };
  const { data: mem } = await svc.from('conecf_imasugu_members').select('therapist_id, priority, excluded, last_on_at').eq('salon_id', salonId);

  const schedOf = new Map((sc ?? []).map((x) => [Number(x.therapist_id), x]));
  const memOf = new Map((mem ?? []).map((x) => [Number(x.therapist_id), x]));
  const nowMin = getNowJSTMinutes();

  const candidates = (ts ?? [])
    .filter((t) => {
      if (t.is_active === false) return false;
      const s = schedOf.get(Number(t.id));
      if (!s?.is_active) return false;
      if (!isOnDutyNow(s.start_time ? String(s.start_time).slice(0, 5) : null, s.end_time ? String(s.end_time).slice(0, 5) : null, nowMin)) return false;
      if (memOf.get(Number(t.id))?.excluded === true) return false;
      // ★ 本人が今すぐ中の方は、店舗の枠を触らない（mypage の排他と同じ）
      if (isCastLiveRow({ is_available_now_cast: t.is_available_now_cast, available_until_cast: t.available_until_cast }, now)) return false;
      return true;
    })
    .map((t) => {
      const s = schedOf.get(Number(t.id));
      const m = memOf.get(Number(t.id));
      return {
        id: Number(t.id), name: (t.name as string | null) ?? '',
        start: s?.start_time ? String(s.start_time).slice(0, 5) : null,
        priority: m?.priority != null ? Number(m.priority) : null,
        lastOnAt: (m?.last_on_at as string | null) ?? null,
      };
    });

  const chosen = pickImasugu({
    candidates, orderMode, rule, batchSize, max: imasuguMax(salon.jobs_enabled === true), nowMin, seed: now.toISOString().slice(0, 15),
  });
  const chosenSet = new Set(chosen);
  // ★ 外すのは「店舗の枠が立っていて、今回選ばれなかった人」。★ 除外にした人は自動の対象外なので触らない
  const toOff = (ts ?? [])
    .filter((t) => t.is_available_now === true && !chosenSet.has(Number(t.id)) && memOf.get(Number(t.id))?.excluded !== true)
    .map((t) => Number(t.id));

  const on = chosen.map((id) => ({ id, name: candidates.find((c) => c.id === id)?.name ?? '' }));
  if (!apply) return { salonId, candidates: candidates.length, on, off: toOff.length };

  const until = imasuguUntilISO(now);
  if (chosen.length > 0) {
    await svc.from('therapists').update({ is_available_now: true, available_until: until }).in('id', chosen).eq('salon_id', salonId);
    await svc.from('conecf_imasugu_members').upsert(
      chosen.map((id) => ({ therapist_id: id, salon_id: salonId, last_on_at: now.toISOString(), updated_at: now.toISOString() })),
      { onConflict: 'therapist_id', ignoreDuplicates: false },
    );
  }
  if (toOff.length > 0) {
    await svc.from('therapists').update({ is_available_now: false, available_until: null }).in('id', toOff).eq('salon_id', salonId);
  }
  await svc.from('conecf_imasugu_settings').upsert({ salon_id: salonId, last_run_at: now.toISOString() }, { onConflict: 'salon_id' });
  return { salonId, candidates: candidates.length, on, off: toOff.length };
}
