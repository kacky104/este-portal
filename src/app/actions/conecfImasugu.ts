'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateJST, getNowJSTMinutes } from '@/lib/dutyStatus';
import { imasuguMax, imasuguUntilISO, isCastLiveRow, isOwnerLiveRow, isImportLiveRow } from '@/lib/imasugu';
import { isOnDutyNow, type ImasuguOrderMode, type ImasuguPriorityRule } from '@/lib/conecfImasugu';
import { runImasuguForSalon } from '@/app/lib/conecf/imasuguRun';

// コネックエフ「今すぐ一括」の受け口（第401便・1e・2026-09-17）。
// ★ 書き込みは「コネックエフに切り替え済み」の自店だけ。★ 今すぐは店舗の枠だけを触る（本人・取り込みの枠は触らない）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc
    .from('salons').select('id, jobs_enabled, conecf_enabled_at')
    .eq('owner_id', user.id).order('is_hidden', { ascending: true }).order('id', { ascending: true }).limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) return { ok: false as const, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  return { ok: true as const, svc, salonId: Number(salon.id), max: imasuguMax(salon.jobs_enabled === true) };
}

export type ImasuguSettings = { enabled: boolean; orderMode: ImasuguOrderMode; batchSize: number; rule: ImasuguPriorityRule; lastRunAt: string | null };
export type ImasuguRow = {
  id: number; name: string; imageUrl: string | null;
  shift: { start: string | null; end: string | null } | null;
  onDuty: boolean; excluded: boolean; priority: number | null;
  ownerLive: boolean; ownerUntil: string | null; castLive: boolean; importLive: boolean;
};

export async function getConecfImasugu(): Promise<Result<{ salonId: number; max: number; settings: ImasuguSettings; rows: ImasuguRow[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { svc, salonId } = r;
  const { data: st } = await svc.from('conecf_imasugu_settings').select('*').eq('salon_id', salonId).maybeSingle();
  const { data: ts } = await svc.from('therapists')
    .select('id, name, profile_image_url, is_active, is_available_now, available_until, is_available_now_cast, available_until_cast, is_available_now_import, available_until_import')
    .eq('salon_id', salonId);
  const active = (ts ?? []).filter((t) => t.is_active !== false);
  const ids = active.map((t) => Number(t.id));
  const today = getBusinessDateJST();
  const { data: sc } = ids.length > 0
    ? await svc.from('therapist_schedules').select('therapist_id, is_active, start_time, end_time').in('therapist_id', ids).eq('schedule_date', today)
    : { data: [] as Array<{ therapist_id: number; is_active: boolean; start_time: string | null; end_time: string | null }> };
  const { data: mem } = await svc.from('conecf_imasugu_members').select('therapist_id, priority, excluded').eq('salon_id', salonId);
  const schedOf = new Map((sc ?? []).map((x) => [Number(x.therapist_id), x]));
  const memOf = new Map((mem ?? []).map((x) => [Number(x.therapist_id), x]));
  const nowMin = getNowJSTMinutes();
  const now = new Date();

  const rows: ImasuguRow[] = active
    .filter((t) => schedOf.get(Number(t.id))?.is_active === true)
    .map((t) => {
      const s = schedOf.get(Number(t.id))!;
      const start = s.start_time ? String(s.start_time).slice(0, 5) : null;
      const end = s.end_time ? String(s.end_time).slice(0, 5) : null;
      const m = memOf.get(Number(t.id));
      return {
        id: Number(t.id), name: (t.name as string | null) ?? '', imageUrl: (t.profile_image_url as string | null) ?? null,
        shift: { start, end }, onDuty: isOnDutyNow(start, end, nowMin),
        excluded: m?.excluded === true, priority: m?.priority != null ? Number(m.priority) : null,
        ownerLive: isOwnerLiveRow(t, now), ownerUntil: (t.available_until as string | null) ?? null,
        castLive: isCastLiveRow(t, now), importLive: isImportLiveRow(t, now),
      };
    })
    .sort((a, b) => Number(a.excluded) - Number(b.excluded)
      || (a.priority ?? 1e9) - (b.priority ?? 1e9)
      || (a.shift?.start ?? '').localeCompare(b.shift?.start ?? '')
      || a.name.localeCompare(b.name, 'ja'));

  return {
    ok: true,
    data: {
      salonId, max: r.max, rows,
      settings: {
        enabled: st?.enabled === true,
        orderMode: (st?.order_mode as ImasuguOrderMode) ?? 'priority',
        batchSize: Number(st?.batch_size ?? 1),
        rule: (st?.priority_rule as ImasuguPriorityRule) ?? 'list',
        lastRunAt: (st?.last_run_at as string | null) ?? null,
      },
    },
  };
}

export async function saveConecfImasuguSettings(input: { enabled: boolean; orderMode: string; batchSize: number; rule: string }): Promise<Result<{ saved: true }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const orderMode = input.orderMode === 'random' ? 'random' : 'priority';
  const rule = input.rule === 'earlier' || input.rule === 'later' ? input.rule : 'list';
  const batch = Math.trunc(Number(input.batchSize));
  if (!Number.isFinite(batch) || batch < 0 || batch > 10) return { ok: false, error: '人数の指定が不正です' };
  const { error } = await r.svc.from('conecf_imasugu_settings').upsert({
    salon_id: r.salonId, enabled: input.enabled === true, order_mode: orderMode, batch_size: batch, priority_rule: rule, updated_at: new Date().toISOString(),
  }, { onConflict: 'salon_id' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { saved: true } };
}

export async function saveConecfImasuguMembers(input: { order: number[]; excluded: number[] }): Promise<Result<{ saved: number }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: own } = await r.svc.from('therapists').select('id').eq('salon_id', r.salonId);
  const ownIds = new Set((own ?? []).map((t) => Number(t.id)));
  const order = (Array.isArray(input.order) ? input.order : []).map(Number).filter((id) => ownIds.has(id));
  const excl = new Set((Array.isArray(input.excluded) ? input.excluded : []).map(Number).filter((id) => ownIds.has(id)));
  const ids = [...new Set([...order, ...excl])];
  if (ids.length === 0) return { ok: true, data: { saved: 0 } };
  const now = new Date().toISOString();
  const rows = ids.map((id) => ({ therapist_id: id, salon_id: r.salonId, priority: order.includes(id) ? order.indexOf(id) + 1 : null, excluded: excl.has(id), updated_at: now }));
  const { error } = await r.svc.from('conecf_imasugu_members').upsert(rows, { onConflict: 'therapist_id' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { saved: rows.length } };
}

/** 1人の「今すぐ（店舗の枠）」を入れる・外す */
export async function setConecfImasuguOne(input: { id: number; on: boolean }): Promise<Result<{ on: boolean }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const id = Number(input.id);
  const { data: all } = await r.svc.from('therapists')
    .select('id, is_active, is_available_now, available_until, is_available_now_cast, available_until_cast, is_available_now_import, available_until_import')
    .eq('salon_id', r.salonId);
  const me = (all ?? []).find((t) => Number(t.id) === id);
  if (!me) return { ok: false, error: 'この女性は見つかりません' };
  const now = new Date();
  if (!input.on) {
    await r.svc.from('therapists').update({ is_available_now: false, available_until: null }).eq('id', id).eq('salon_id', r.salonId);
    return { ok: true, data: { on: false } };
  }
  if (me.is_active === false) return { ok: false, error: '非公開の方は今すぐにできません' };
  if (isCastLiveRow(me, now)) return { ok: false, error: '本人が今すぐにしています（店舗からは変えられません）' };
  const { data: s } = await r.svc.from('therapist_schedules').select('is_active, start_time, end_time').eq('therapist_id', id).eq('schedule_date', getBusinessDateJST()).maybeSingle();
  if (!s?.is_active || !isOnDutyNow(s.start_time ? String(s.start_time).slice(0, 5) : null, s.end_time ? String(s.end_time).slice(0, 5) : null, getNowJSTMinutes())) {
    return { ok: false, error: 'いま出勤時間中の方だけ今すぐにできます' };
  }
  const liveCount = (all ?? []).filter((t) => Number(t.id) !== id && (isOwnerLiveRow(t, now) || isCastLiveRow(t, now))).length;
  if (liveCount >= r.max) return { ok: false, error: `今すぐは最大${r.max}名までです` };
  await r.svc.from('therapists').update({ is_available_now: true, available_until: imasuguUntilISO(now) }).eq('id', id).eq('salon_id', r.salonId);
  return { ok: true, data: { on: true } };
}

/** 「いま回す」：自動更新の1周をこの店だけその場で動かす */
export async function runConecfImasuguNow(): Promise<Result<{ on: string[]; off: number; candidates: number }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const res = await runImasuguForSalon(r.svc, r.salonId, true);
  if (res.skipped) return { ok: false, error: '回せませんでした（' + res.skipped + '）' };
  return { ok: true, data: { on: res.on.map((x) => x.name), off: res.off, candidates: res.candidates } };
}
