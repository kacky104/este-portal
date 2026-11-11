'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { normalizeMagazineSchedule, magazineRowProblem, type EkichikaMagazineRow } from '@/lib/ekichikaMagazine';

// 駅ちかのプラチナムマガジンの受け口（第1844便・2026-11-09・カッキーさん）
// ★ 運営が /admin で ON（admin_enabled）にした店だけ、コネックエフに出る。
// ★ 投稿は中継の流れ（lib/ekichikaMagazineFlow.ts）。周は /api/admin/ekichika-bump
// ★ 受け取るのは駅ちかの会員（マイショップ登録者）。コネックエフは宛先を持たない

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at, crm_until'), user.id, actingId)
    .limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) return { ok: false as const, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  if (write && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) {
    return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  }
  return { ok: true as const, svc, salonId: Number(salon.id), userId: user.id };
}
async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user && user.id === ADMIN_UUID;
}

export type ConecfEkichikaMagazineSetting = { slot: number; auto: boolean; schedule: EkichikaMagazineRow[]; lastAt: string | null; lastOutcome: string | null };


export async function getConecfEkichikaMagazines(): Promise<Result<{ settings: ConecfEkichikaMagazineSetting[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const st = await r.svc.from('conecf_ekichika_magazines').select('slot, auto, schedule, last_at, last_outcome').eq('salon_id', r.salonId).eq('admin_enabled', true).order('slot');
  if (st.error) return { ok: true, data: { settings: [] } };
  return {
    ok: true,
    data: { settings: (st.data ?? []).map((x) => ({ slot: Number(x.slot), auto: x.auto === true, schedule: normalizeMagazineSchedule(x.schedule), lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null })) },
  };
}

export async function saveConecfEkichikaMagazine(input: { slot: number; auto: boolean; schedule: EkichikaMagazineRow[] }): Promise<Result<null>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  const schedule = normalizeMagazineSchedule(input.schedule);
  for (const [i, row] of schedule.entries()) {
    const p = magazineRowProblem(row);
    if (p) return { ok: false, error: `${i + 1}行目: ${p}` };
  }
  if (input.auto === true && schedule.length === 0) return { ok: false, error: '送る時刻を1行以上入れてください' };
  const { data, error } = await r.svc.from('conecf_ekichika_magazines')
    .update({ auto: input.auto === true, schedule, updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('slot', slot).eq('admin_enabled', true).select('slot');
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  if (!data || data.length === 0) return { ok: false, error: 'この枠は使えるようになっていません。運営事務局までご連絡ください' };
  return { ok: true, data: null };
}

/** ★ 保存してある行を、いま1回送る（★ 駅ちかの会員にメールが届く） */
export async function runConecfEkichikaMagazineNow(input: { slot: number; index: number }): Promise<Result<{ note: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  const { data: st } = await r.svc.from('conecf_ekichika_magazines').select('schedule').eq('salon_id', r.salonId).eq('slot', slot).eq('admin_enabled', true).maybeSingle();
  if (!st) return { ok: false, error: 'この枠は使えるようになっていません。運営事務局までご連絡ください' };
  const schedule = normalizeMagazineSchedule(st.schedule);
  const row = schedule[Number(input.index)];
  if (!row) return { ok: false, error: '行が見つかりません（保存してから押してください）' };
  const p = magazineRowProblem(row);
  if (p) return { ok: false, error: p };
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'ekichika', slot, intent: 'bump_push', actor: 'shop:' + r.userId,
      ekichikaMagazine: { index: Number(input.index), title: row.title, body: row.body },
    });
    if (!f.ok) return { ok: false, error: f.note };
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] 駅ちかのマガジンを始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── 運営 ──（★ その店の全部の枠をまとめて ON / OFF。行が無ければ枠1を作る）
export async function adminGetEkichikaMagazines(salonId: number): Promise<Result<{ enabled: boolean }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_ekichika_magazines').select('admin_enabled').eq('salon_id', Number(salonId));
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1844便は流しましたか？）: ' + error.message };
  return { ok: true, data: { enabled: (data ?? []).some((x) => x.admin_enabled === true) } };
}
export async function adminSetEkichikaMagazines(input: { salonId: number; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const salonId = Number(input.salonId);
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_ekichika_magazines').select('slot').eq('salon_id', salonId);
  const res = (cur ?? []).length > 0
    ? await svc.from('conecf_ekichika_magazines').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId)
    : await svc.from('conecf_ekichika_magazines').insert({ salon_id: salonId, slot: 1, admin_enabled: input.enabled === true });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}
