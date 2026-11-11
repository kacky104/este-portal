'use server';

// フクエスCRM「連絡文のひな形」のサーバー処理（第1947便・2026-11-12）。
// ★ 表: crm_message_templates（追加SQL_第1947便・RLS で全部閉じてある＝service_role だけ）
// ★ 本文の置き換えは画面側（src/lib/crmMessage.ts）。ここは ひな形の読み書き と、置き換えに要る
//   「店名・店の電話・前回（同じお客様・同じ女子）」を読むだけ。★ 組み立てた文章は保存しない。

import { assertCrmOwner } from '@/app/lib/crm/auth';
import { dbMessage } from '@/app/lib/crm/dbError';

export type CrmMessageTemplate = {
  id: number;
  name: string;
  body: string;
  hideEmptyLines: boolean;
  sortOrder: number;
  isActive: boolean;
};

const NAME_MAX = 40;
const BODY_MAX = 4000;
const PER_SALON_MAX = 30;

function toTemplate(r: Record<string, unknown>): CrmMessageTemplate {
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    body: String(r.body ?? ''),
    hideEmptyLines: r.hide_empty_lines !== false,
    sortOrder: Number(r.sort_order) || 0,
    isActive: r.is_active !== false,
  };
}

/** 表がまだ無い（SQL を流す前）か */
function missingTable(e: { code?: string | null; message?: string | null } | null): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /crm_message_templates/.test(String(e.message ?? '')));
}

/** ひな形の一覧（activeOnly＝予約から使うときは「使う」だけ） */
export async function listCrmMessageTemplates(
  salonId: number,
  opts?: { activeOnly?: boolean },
): Promise<{ ok: true; ready: boolean; templates: CrmMessageTemplate[] } | { ok: false; error: string }> {
  const auth = await assertCrmOwner(salonId);
  if (!auth.ok) return auth;
  let q = auth.svc.from('crm_message_templates')
    .select('id, name, body, hide_empty_lines, sort_order, is_active')
    .eq('salon_id', salonId);
  if (opts?.activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q.order('sort_order').order('id');
  if (error) {
    if (missingTable(error)) return { ok: true, ready: false, templates: [] };
    return { ok: false, error: dbMessage(error, '読み込み') };
  }
  return { ok: true, ready: true, templates: (data ?? []).map((r) => toTemplate(r as Record<string, unknown>)) };
}

/** 作る（id なし）／直す（id あり） */
export async function saveCrmMessageTemplate(
  salonId: number,
  input: { id?: number; name: string; body: string; hideEmptyLines: boolean; isActive: boolean },
): Promise<{ ok: true; template: CrmMessageTemplate } | { ok: false; error: string }> {
  const auth = await assertCrmOwner(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const name = String(input.name ?? '').trim();
  const body = String(input.body ?? '').replace(/\r\n/g, '\n');
  if (!name) return { ok: false, error: 'ひな形の名前を入れてください' };
  if (name.length > NAME_MAX) return { ok: false, error: `名前は${NAME_MAX}文字までです` };
  if (body.length > BODY_MAX) return { ok: false, error: `本文は${BODY_MAX}文字までです` };
  const row = {
    name,
    body,
    hide_empty_lines: input.hideEmptyLines !== false,
    is_active: input.isActive !== false,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await svc.from('crm_message_templates')
      .update(row).eq('id', input.id).eq('salon_id', salonId)
      .select('id, name, body, hide_empty_lines, sort_order, is_active').maybeSingle();
    if (error) return { ok: false, error: dbMessage(error, '保存') };
    if (!data) return { ok: false, error: 'ひな形が見つかりません（画面を更新してください）' };
    return { ok: true, template: toTemplate(data as Record<string, unknown>) };
  }

  const { data: cur, error: cErr } = await svc.from('crm_message_templates')
    .select('sort_order').eq('salon_id', salonId).order('sort_order', { ascending: false }).limit(PER_SALON_MAX);
  if (cErr) return { ok: false, error: dbMessage(cErr, '保存') };
  if ((cur ?? []).length >= PER_SALON_MAX) return { ok: false, error: `ひな形は${PER_SALON_MAX}個までです` };
  const nextOrder = ((cur ?? [])[0]?.sort_order as number | undefined ?? -1) + 1;
  const { data, error } = await svc.from('crm_message_templates')
    .insert({ ...row, salon_id: salonId, sort_order: nextOrder })
    .select('id, name, body, hide_empty_lines, sort_order, is_active').single();
  if (error) return { ok: false, error: dbMessage(error, '保存') };
  return { ok: true, template: toTemplate(data as Record<string, unknown>) };
}

export async function deleteCrmMessageTemplate(salonId: number, id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrmOwner(salonId);
  if (!auth.ok) return auth;
  const { error } = await auth.svc.from('crm_message_templates').delete().eq('id', id).eq('salon_id', salonId);
  if (error) return { ok: false, error: dbMessage(error, '削除') };
  return { ok: true };
}

/** 並び順（上から順の id） */
export async function reorderCrmMessageTemplates(salonId: number, ids: number[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrmOwner(salonId);
  if (!auth.ok) return auth;
  const list = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, PER_SALON_MAX);
  for (let i = 0; i < list.length; i++) {
    const { error } = await auth.svc.from('crm_message_templates').update({ sort_order: i }).eq('id', list[i]).eq('salon_id', salonId);
    if (error) return { ok: false, error: dbMessage(error, '並べ替え') };
  }
  return { ok: true };
}

const NOMINATION_FIXED = ['本指名', 'ネット指名', 'フリー'];

/**
 * 置き換えに要る、画面がまだ持っていない値。
 * ・店名・店の電話番号
 * ・前回（同じお客様・同じ女子・この予約より前・キャンセルでないもの）の日付・料金・指名
 */
export async function getCrmMessageExtras(
  salonId: number,
  bookingId: string,
): Promise<{ ok: true; salonName: string; salonTel: string; prev: { date: string; priceTotal: number | null; nomination: string } | null } | { ok: false; error: string }> {
  const auth = await assertCrmOwner(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const [{ data: salon }, { data: b, error: bErr }] = await Promise.all([
    svc.from('salons').select('name, phone').eq('id', salonId).maybeSingle(),
    svc.from('salon_bookings').select('id, customer_id, therapist_id, slot_start').eq('id', bookingId).eq('salon_id', salonId).maybeSingle(),
  ]);
  if (bErr) return { ok: false, error: dbMessage(bErr, '読み込み') };
  const salonName = String(salon?.name ?? '');
  const salonTel = String(salon?.phone ?? '');
  if (!b || b.customer_id == null || b.therapist_id == null) return { ok: true, salonName, salonTel, prev: null };

  const { data: p, error: pErr } = await svc.from('salon_bookings')
    .select('slot_start, price_total, crm_items')
    .eq('salon_id', salonId)
    .eq('customer_id', b.customer_id)
    .eq('therapist_id', b.therapist_id)
    .neq('status', 'cancelled')
    .lt('slot_start', b.slot_start)
    .order('slot_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pErr) return { ok: false, error: dbMessage(pErr, '読み込み') };
  if (!p) return { ok: true, salonName, salonTel, prev: null };

  // 営業日（朝6時より前は前の日）
  const t = new Date(String(p.slot_start)).getTime() + 9 * 3600_000 - 6 * 3600_000;
  const d = new Date(t);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const items = Array.isArray(p.crm_items) ? (p.crm_items as Array<Record<string, unknown>>) : [];
  const nomination = items.filter((i) => i?.kind === 'nomination').map((i) => String(i?.name ?? '')).filter(Boolean)
    .sort((a, b2) => NOMINATION_FIXED.indexOf(a) - NOMINATION_FIXED.indexOf(b2)).join('・');
  return { ok: true, salonName, salonTel, prev: { date, priceTotal: p.price_total == null ? null : Number(p.price_total), nomination } };
}
