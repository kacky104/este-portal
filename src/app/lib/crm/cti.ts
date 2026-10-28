// フクエスCRM 着信ポップ（CTI・D 方式）の共通部品（第1685便・2026-10-28）。設計メモ_2026-10-28_CTI着信ポップ_D方式.md
// ★ 'use server' は付けない（下請け。API ルートと Server Action から呼ぶ）。
// ★ ここにあるもの: トークンの作り方と照合（sha256）／端末から来た番号の整え方／着信を1行入れる（二重と連打の守り）。
// ★★ 守り: 生のトークンは DB に置かない（crm_cti_devices.token_hash は sha256 の hex）。
//   端末 → サーバーは「番号を送る」だけ。サーバー → 端末には何も返さない（端末を落としても台帳は漏れない）。

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CrmSvc } from '@/app/lib/crm/auth';
import { normalizePhone } from '@/app/lib/validation/phone';

export type CtiHiddenReason = 'withheld' | 'payphone' | 'unknown';
const HIDDEN: readonly CtiHiddenReason[] = ['withheld', 'payphone', 'unknown'];

/** 端末に1回だけ見せる生のトークン（32 バイト・base64url・43 文字） */
export function newCtiToken(): string {
  return randomBytes(32).toString('base64url');
}
/** DB に置くのはこれだけ（sha256 hex・64 文字） */
export function hashCtiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
/** hex 同士を時間一定で比べる（長さ違いは false） */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8'), y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * 端末が拾った番号を台帳の形（数字のみ 10〜13 桁）にそろえる。
 *   "+81 90-1234-5678" → "09012345678"（国際形式の +81 は 0 に戻す）
 *   数字にならない・桁が合わない → null（呼び出し側で hidden 'unknown' にする）
 * ★ 台帳の電話は normalizePhone 済みの数字で持っている（salon_customer_phones.phone）ので、同じ形にしないと引けない。
 */
export function normalizeIncomingPhone(raw: unknown): string | null {
  let s = normalizePhone(String(raw ?? '')).replace(/[()（）]/g, '');
  if (s.startsWith('+81')) s = '0' + s.slice(3);
  else if (s.startsWith('0081')) s = '0' + s.slice(4);
  else if (s.startsWith('81') && s.length >= 11) s = '0' + s.slice(2);
  if (!/^\d{10,13}$/.test(s)) return null;
  return s;
}

export function parseHiddenReason(raw: unknown): CtiHiddenReason | null {
  const s = String(raw ?? '').trim().toLowerCase();
  return (HIDDEN as readonly string[]).includes(s) ? (s as CtiHiddenReason) : null;
}

export type CtiDeviceRow = {
  id: number;
  salon_id: number;
  name: string;
  is_enabled: boolean;
};

/** Bearer トークン → 端末の行。無効・止まっている・無ければ null（理由は返さない） */
export async function findCtiDeviceByToken(svc: CrmSvc, token: string): Promise<CtiDeviceRow | null> {
  if (!token || token.length < 16 || token.length > 128) return null;
  const h = hashCtiToken(token);
  const { data, error } = await svc.from('crm_cti_devices')
    .select('id, salon_id, name, is_enabled, token_hash')
    .eq('token_hash', h).maybeSingle();
  if (error || !data) return null;
  if (!sameHash(String(data.token_hash), h)) return null;
  if (!data.is_enabled) return null;
  return { id: Number(data.id), salon_id: Number(data.salon_id), name: String(data.name ?? ''), is_enabled: true };
}

export type RecordCtiCallInput = {
  salonId: number;
  /** null＝テスト着信（運営・店舗様のボタン） */
  deviceId: number | null;
  phone: string | null;
  hidden: CtiHiddenReason | null;
  eventId?: string | null;
  rangAt?: string | null;
};
export type RecordCtiCallResult =
  | { ok: true; id: number; duplicate: boolean }
  | { ok: false; error: string };

/**
 * 着信を1行入れる。
 * ★ 二重の守り（2段）:
 *   1) 同じ端末の同じ eventId は DB の unique で弾く（アプリの再送）→ duplicate: true・エラーにしない
 *   2) 同じ店の同じ番号が 10 秒以内にもう1行あれば入れない（RINGING を2回投げる機種）→ duplicate: true
 */
export async function recordCtiCall(svc: CrmSvc, input: RecordCtiCallInput): Promise<RecordCtiCallResult> {
  const phone = input.phone ?? null;
  const hidden = phone ? null : (input.hidden ?? 'unknown');
  const now = Date.now();
  let rangAt = input.rangAt ? new Date(input.rangAt) : new Date(now);
  // ★ 端末の時計が狂っていても記録が未来・大昔にならないように（±1 日を超えたらサーバー時刻）
  if (!Number.isFinite(rangAt.getTime()) || Math.abs(rangAt.getTime() - now) > 86_400_000) rangAt = new Date(now);

  if (phone) {
    const since = new Date(now - 10_000).toISOString();
    const { data: recent } = await svc.from('crm_cti_calls').select('id')
      .eq('salon_id', input.salonId).eq('phone', phone).gte('received_at', since).limit(1);
    if (recent && recent.length > 0) return { ok: true, id: Number(recent[0].id), duplicate: true };
  }

  const row: Record<string, unknown> = {
    salon_id: input.salonId,
    device_id: input.deviceId,
    phone,
    hidden_reason: hidden,
    rang_at: rangAt.toISOString(),
  };
  const ev = String(input.eventId ?? '').trim();
  if (ev && ev.length >= 8 && ev.length <= 64) row.event_id = ev;

  const { data, error } = await svc.from('crm_cti_calls').insert(row).select('id').single();
  if (error?.code === '23505') {
    // 同じ端末の同じ着信（再送）。もう入っている行を返す
    const { data: ex } = await svc.from('crm_cti_calls').select('id')
      .eq('device_id', input.deviceId ?? -1).eq('event_id', ev).maybeSingle();
    return { ok: true, id: Number(ex?.id ?? 0), duplicate: true };
  }
  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };
  return { ok: true, id: Number(data.id), duplicate: false };
}

/** 1 端末 60 秒に何件まで受けるか（超えたら 429）。普通の受付で 60 件/分は来ない */
export const CTI_CALLS_PER_MINUTE = 60;

export async function ctiDeviceOverLimit(svc: CrmSvc, deviceId: number): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await svc.from('crm_cti_calls')
    .select('id', { count: 'exact', head: true })
    .eq('device_id', deviceId).gte('received_at', since);
  return (count ?? 0) >= CTI_CALLS_PER_MINUTE;
}
