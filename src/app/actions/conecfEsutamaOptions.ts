'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import {
  ESUTAMA_OPT_KEYS, ESUTAMA_OPT_LABEL, ESUTAMA_OPT_READY, ESUTAMA_OPT_DEFAULT, isValidEsutamaOptSetting, type EsutamaOptKey,
} from '@/lib/esutamaOption';

// エステ魂【オプション】の受け口（第1799便・2026-11-09・カッキーさんの決定）。
// ★ 運営が /admin で ON（admin_enabled）にした店だけ、コネックエフに出る。店舗様は自動の ON/OFF・時間帯・間隔と「今すぐ押す」。
// ★ 表は conecf_esutama_options（追加SQL_第1799便）。★ 押すのは中継の流れ（lib/esutamaOptionFlow.ts）。周は /api/admin/ekichika-bump。
// ★ 書き込み（保存・今すぐ）は「コネックエフに切り替え済み」でセットを契約している自店だけ（conecfBump と同じ守り）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const okKey = (v: unknown): EsutamaOptKey | null => (ESUTAMA_OPT_KEYS as string[]).includes(String(v)) ? (v as EsutamaOptKey) : null;

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

export type ConecfEsutamaOption = {
  key: EsutamaOptKey; label: string; ready: boolean;
  auto: boolean; startMin: number; endMin: number; intervalMin: number; timesMin: number[];
  remaining: number | null; readAt: string | null; lastAt: string | null; lastOutcome: string | null;
};

/** ★ コネックエフのメニューに出すか（運営が1つでも ON にしている）。読めなければ出さない */
export async function hasConecfEsutamaOptions(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_esutama_options').select('option_key').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}

export async function getConecfEsutamaOptions(): Promise<Result<{ options: ConecfEsutamaOption[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data, error } = await r.svc.from('conecf_esutama_options')
    .select('option_key, auto, start_min, end_min, interval_min, times_min, remaining, read_at, last_at, last_outcome')
    .eq('salon_id', r.salonId).eq('admin_enabled', true);
  if (error) return { ok: false, error: '読み込めませんでした。時間をおいてお試しください' };
  const options = ESUTAMA_OPT_KEYS.flatMap((key) => {
    const x = (data ?? []).find((d) => d.option_key === key);
    if (!x) return [];
    const def = ESUTAMA_OPT_DEFAULT[key];
    return [{
      key, label: ESUTAMA_OPT_LABEL[key], ready: ESUTAMA_OPT_READY[key],
      auto: x.auto === true,
      startMin: x.start_min == null ? def.startMin : Number(x.start_min),
      endMin: x.end_min == null ? def.endMin : Number(x.end_min),
      intervalMin: x.interval_min == null ? def.intervalMin : Number(x.interval_min),
      timesMin: Array.isArray(x.times_min) && x.times_min.length > 0 ? (x.times_min as number[]).map(Number) : (def.timesMin ?? []),
      remaining: x.remaining == null ? null : Number(x.remaining),
      readAt: (x.read_at as string | null) ?? null, lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null,
    }];
  });
  return { ok: true, data: { options } };
}

export async function saveConecfEsutamaOption(input: { key: string; auto: boolean; startMin: number; endMin: number; intervalMin: number; timesMin?: number[] }): Promise<Result<null>> {
  const key = okKey(input.key);
  if (!key) return { ok: false, error: 'オプションの指定が不正です' };
  if (!ESUTAMA_OPT_READY[key]) return { ok: false, error: 'このオプションはまだ準備中です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const s = { startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin) };
  if (!isValidEsutamaOptSetting(s)) return { ok: false, error: '時間帯か間隔の値が正しくありません' };
  // ★ 求人ワンクリックアピールの時刻（朝6時はじまりの分・1〜10個）
  const times = key === 'job_appeal' ? [...new Set((input.timesMin ?? []).map(Number))].filter((t) => Number.isInteger(t) && t >= 360 && t < 1800).sort((x, y) => x - y) : null;
  if (key === 'job_appeal' && (!times || times.length === 0 || times.length > 10)) return { ok: false, error: '押す時刻を1〜10個入れてください' };
  const { data, error } = await r.svc.from('conecf_esutama_options')
    .update({ auto: input.auto === true, start_min: s.startMin, end_min: s.endMin, interval_min: s.intervalMin, ...(times ? { times_min: times } : {}), updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('option_key', key).eq('admin_enabled', true).select('option_key');
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  if (!data || data.length === 0) return { ok: false, error: 'このオプションは使えるようになっていません。運営事務局までご連絡ください' };
  return { ok: true, data: null };
}

export async function runConecfEsutamaOptionNow(input: { key: string }): Promise<Result<{ note: string }>> {
  const key = okKey(input.key);
  if (!key) return { ok: false, error: 'オプションの指定が不正です' };
  if (!ESUTAMA_OPT_READY[key]) return { ok: false, error: 'このオプションはまだ準備中です' };
  const r = await resolve(true);
  if (!r.ok) return r;
  const { data: row } = await r.svc.from('conecf_esutama_options').select('option_key').eq('salon_id', r.salonId).eq('option_key', key).eq('admin_enabled', true).maybeSingle();
  if (!row) return { ok: false, error: 'このオプションは使えるようになっていません。運営事務局までご連絡ください' };
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'esutama', slot: 1,
      intent: 'bump_push', actor: 'shop:' + r.userId,
      esutamaOpt: { key, force: true },
    });
    if (!f.ok) return { ok: false, error: f.note };
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] エステ魂オプションを始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── 運営（/admin）──
async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user && user.id === ADMIN_UUID;
}

export async function adminGetEsutamaOptions(salonId: number): Promise<Result<{ enabled: Record<string, boolean>; ready: Record<string, boolean> }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_esutama_options').select('option_key, admin_enabled').eq('salon_id', Number(salonId));
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1799便は流しましたか？）: ' + error.message };
  const enabled: Record<string, boolean> = {};
  for (const k of ESUTAMA_OPT_KEYS) enabled[k] = (data ?? []).some((d) => d.option_key === k && d.admin_enabled === true);
  return { ok: true, data: { enabled, ready: ESUTAMA_OPT_READY } };
}

export async function adminSetEsutamaOption(input: { salonId: number; key: string; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const key = okKey(input.key);
  const salonId = Number(input.salonId);
  if (!key || !Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const def = ESUTAMA_OPT_DEFAULT[key];
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_esutama_options').select('option_key').eq('salon_id', salonId).eq('option_key', key).maybeSingle();
  const res = cur
    ? await svc.from('conecf_esutama_options').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId).eq('option_key', key)
    : await svc.from('conecf_esutama_options').insert({ salon_id: salonId, option_key: key, admin_enabled: input.enabled === true, start_min: def.startMin, end_min: def.endMin, interval_min: def.intervalMin, ...(def.timesMin ? { times_min: def.timesMin } : {}) });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}
