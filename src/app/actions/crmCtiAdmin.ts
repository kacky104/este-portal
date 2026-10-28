'use server';

// フクエスCRM 着信ポップ（CTI）：受付端末の発行・管理（運営・第1685便・2026-10-28）。設計メモ_2026-10-28_CTI着信ポップ_D方式.md §5
// ★ 表は crm_cti_devices・crm_cti_calls（追加SQL_第1685便）。
// ★★ 守り: requireAdmin（ADMIN_UUID 照合）＋ service_role。
// ★★ トークンは発行（adminAddCtiDevice・adminReissueCtiToken）の返事で【1回だけ】返す。DB には sha256 しか無いので二度と出せない。
//   なくしたら「再発行」（古いトークンはその場で使えなくなる）。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { hashCtiToken, newCtiToken, normalizeIncomingPhone, parseHiddenReason, recordCtiCall } from '@/app/lib/crm/cti';

type Err = { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true };
}
function tableMissing(e: { code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205');
}
const SQL_NOTE = '追加SQL_第1685便（CTI着信ポップの土台）がまだ流れていません';

export type CrmCtiDeviceRow = {
  id: number;
  salonId: number;
  salonName: string;
  crmUntil: string | null;
  name: string;
  isEnabled: boolean;
  lastSeenAt: string | null;
  lastCallAt: string | null;
  appVersion: string;
  deviceModel: string;
  androidVersion: string;
  createdAt: string;
};

/** アプリに読ませる QR の中身（設計メモ §5）。★ トークンが入るので、発行の返事でだけ組み立てる */
export type CrmCtiQrPayload = { v: 1; api: string; token: string; salon: string; device: string };

function apiBase(): string {
  // ★ 本番は fukues.com。プレビューで試すときは NEXT_PUBLIC_SITE_URL（無ければ fukues.com）
  const u = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  return u && /^https?:\/\//.test(u) ? u : 'https://fukues.com';
}

/** 端末の一覧（全店・新しい順）。★ 表がまだ無ければ ready: false */
export async function adminListCtiDevices(): Promise<{ ok: true; ready: boolean; devices: CrmCtiDeviceRow[] } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_cti_devices')
    .select('id, salon_id, name, is_enabled, last_seen_at, last_call_at, app_version, device_model, android_version, created_at')
    .order('id', { ascending: false });
  if (tableMissing(error)) return { ok: true, ready: false, devices: [] };
  if (error) return { ok: false, error: '端末を読めませんでした: ' + error.message };
  const ids = [...new Set((data ?? []).map((r) => Number(r.salon_id)))];
  const names = new Map<number, { name: string; crmUntil: string | null }>();
  if (ids.length > 0) {
    const { data: ss } = await svc.from('salons').select('id, name, crm_until').in('id', ids);
    for (const s of ss ?? []) names.set(Number(s.id), { name: String(s.name ?? ''), crmUntil: (s.crm_until as string | null) ?? null });
  }
  return {
    ok: true, ready: true,
    devices: (data ?? []).map((r) => ({
      id: Number(r.id),
      salonId: Number(r.salon_id),
      salonName: names.get(Number(r.salon_id))?.name ?? `店${r.salon_id}`,
      crmUntil: names.get(Number(r.salon_id))?.crmUntil ?? null,
      name: String(r.name ?? ''),
      isEnabled: !!r.is_enabled,
      lastSeenAt: (r.last_seen_at as string | null) ?? null,
      lastCallAt: (r.last_call_at as string | null) ?? null,
      appVersion: String(r.app_version ?? ''),
      deviceModel: String(r.device_model ?? ''),
      androidVersion: String(r.android_version ?? ''),
      createdAt: String(r.created_at ?? ''),
    })),
  };
}

async function salonForDevice(svc: ReturnType<typeof createServiceClient>, salonId: number): Promise<{ ok: true; name: string } | Err> {
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店を選んでください' };
  const { data: s, error } = await svc.from('salons').select('id, name, crm_until').eq('id', salonId).maybeSingle();
  if (error) return { ok: false, error: '店を読めませんでした: ' + error.message };
  if (!s) return { ok: false, error: '店が見つかりません' };
  if (!s.crm_until) return { ok: false, error: 'フクエスCRMの契約店だけ端末を出せます（/admin の CRM 期限を入れてから）' };
  return { ok: true, name: String(s.name ?? '') };
}

/** 端末を1台出す。★ 返事の token は【この1回だけ】 */
export async function adminAddCtiDevice(input: { salonId: number; name?: string }): Promise<{ ok: true; id: number; token: string; qr: CrmCtiQrPayload } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const salonId = Number(input.salonId);
  const name = String(input.name ?? '').trim() || '受付';
  if (name.length > 30) return { ok: false, error: '端末の名前は30文字までです' };
  const svc = createServiceClient();
  const s = await salonForDevice(svc, salonId);
  if (!s.ok) return s;
  const token = newCtiToken();
  const { data, error } = await svc.from('crm_cti_devices')
    .insert({ salon_id: salonId, name, token_hash: hashCtiToken(token) }).select('id').single();
  if (tableMissing(error)) return { ok: false, error: SQL_NOTE };
  if (error || !data) return { ok: false, error: '出せませんでした: ' + (error?.message ?? '') };
  return { ok: true, id: Number(data.id), token, qr: { v: 1, api: apiBase(), token, salon: s.name, device: name } };
}

/** トークンを作り直す（なくした・漏れたかもしれない）。★ 古いトークンはその場で使えなくなる。返事の token は【この1回だけ】 */
export async function adminReissueCtiToken(input: { id: number }): Promise<{ ok: true; token: string; qr: CrmCtiQrPayload } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: '端末が不正です' };
  const svc = createServiceClient();
  const { data: d, error: dErr } = await svc.from('crm_cti_devices').select('id, salon_id, name').eq('id', id).maybeSingle();
  if (dErr) return { ok: false, error: '端末を読めませんでした: ' + dErr.message };
  if (!d) return { ok: false, error: '端末が見つかりません' };
  const s = await salonForDevice(svc, Number(d.salon_id));
  if (!s.ok) return s;
  const token = newCtiToken();
  const { error } = await svc.from('crm_cti_devices')
    .update({ token_hash: hashCtiToken(token), is_enabled: true }).eq('id', id);
  if (error) return { ok: false, error: '作り直せませんでした: ' + error.message };
  return { ok: true, token, qr: { v: 1, api: apiBase(), token, salon: s.name, device: String(d.name ?? '') } };
}

/** 止める／再開（トークンは消さない。止めている間は 401） */
export async function adminSetCtiDeviceEnabled(input: { id: number; enabled: boolean }): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: '端末が不正です' };
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_cti_devices').update({ is_enabled: !!input.enabled }).eq('id', id).select('id');
  if (error) return { ok: false, error: '変えられませんでした: ' + error.message };
  if (!data || data.length === 0) return { ok: false, error: '端末が見つかりません' };
  return { ok: true };
}

/** 端末を消す（着信の記録は device_id が null になって残る・90 日で消える） */
export async function adminDeleteCtiDevice(input: { id: number }): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: '端末が不正です' };
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_cti_devices').delete().eq('id', id).select('id');
  if (error) return { ok: false, error: '消せませんでした: ' + error.message };
  if (!data || data.length === 0) return { ok: false, error: '端末が見つかりません' };
  return { ok: true };
}

/**
 * テスト着信を入れる（運営）。端末が無くても CRM のポップ（便 B）を確かめられる。
 * ★ device_id は null（端末からの着信と区別がつく）。phone が空なら非通知のテスト。
 */
export async function adminCtiTestCall(input: { salonId: number; phone?: string; hidden?: string }): Promise<{ ok: true; id: number; duplicate: boolean } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const salonId = Number(input.salonId);
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店を選んでください' };
  const raw = String(input.phone ?? '').trim();
  const phone = raw ? normalizeIncomingPhone(raw) : null;
  if (raw && !phone) return { ok: false, error: '電話番号は数字10〜13桁で入れてください' };
  const hidden = phone ? null : (parseHiddenReason(input.hidden) ?? 'withheld');
  const svc = createServiceClient();
  const r = await recordCtiCall(svc, { salonId, deviceId: null, phone, hidden });
  if (!r.ok) {
    if (/crm_cti_calls/.test(r.error) && /does not exist|schema cache/.test(r.error)) return { ok: false, error: SQL_NOTE };
    return { ok: false, error: 'テスト着信を入れられませんでした: ' + r.error };
  }
  return { ok: true, id: r.id, duplicate: r.duplicate };
}
