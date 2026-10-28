'use server';

// コネックエフ「更新結果」の上に出す、枠2以降を「枠1と同じ」にする登録の進み具合（第1684便・2026-10-28・カッキーさん）。
// ★ 第1681便の自動登録（20分に1人・第1689便で出勤が先）が、いま何人まで済んだかを「12／39」の形で返す。
// ★ 出すのは 駅ちかの枠2以降で、向きが write 系・ID・パスワードがある枠だけ。全員そろっている枠は出さない（done===total は返さない）。
// ★ 店舗様の情報だけ（assertSalonOwner）。名前は返さない（数だけ）。

import { createServiceClient } from '@/app/lib/supabase/service';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { loadCastIds } from '@/lib/mediaCastIds';
import { loadConecfOff } from '@/app/lib/conecf/targets';
import { isWriteDirection } from '@/lib/mediaLinkMode';
import { ekichikaAreaFromUrl } from '@/lib/ekichikaArea';
import { providerLabel } from '@/lib/mediaAudit';

export type SlotMirrorProgress = { provider: string; slot: number; label: string; done: number; total: number };

export async function getSlotMirrorProgress(input: { salonId: string | number }): Promise<{ ok: true; items: SlotMirrorProgress[] } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  // ★ 持ち主か運営か（mediaCredentials.ts の assertSalonOwner と同じ物差し）
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!salon) return { ok: false, error: '店舗が見つかりません' };
  if ((salon.owner_id as string | null) !== user.id && user.id !== ADMIN_UUID) return { ok: false, error: 'この店舗の操作権限がありません' };
  const { data: srcs, error } = await svc.from('salon_import_sources')
    .select('provider, slot, link_mode, is_enabled, shop_url').eq('salon_id', salonId).eq('provider', 'ekichika');
  if (error) return { ok: false, error: '枠を読めませんでした' };
  const slots = (srcs ?? []).filter((s) => Number(s.slot ?? 1) >= 2 && s.is_enabled === true && isWriteDirection(String(s.link_mode ?? '')));
  if (slots.length === 0) return { ok: true, items: [] };
  const { data: creds } = await svc.from('salon_media_credentials').select('slot, is_enabled').eq('salon_id', salonId).eq('provider', 'ekichika');
  const hasCred = new Set((creds ?? []).filter((c) => c.is_enabled === true).map((c) => Number(c.slot ?? 1)));
  const { data: ths } = await svc.from('therapists').select('id, import_cast_id, is_active').eq('salon_id', salonId);
  const rows = ((ths ?? []) as Array<{ id: number; import_cast_id?: string | null; is_active?: boolean | null }>);
  const active = rows.filter((t) => t.is_active === true);
  const m1 = await loadCastIds(svc, { therapists: rows, provider: 'ekichika', slot: 1 });
  if (m1.error) return { ok: true, items: [] };
  const items: SlotMirrorProgress[] = [];
  for (const s of slots) {
    const slot = Number(s.slot ?? 1);
    if (!hasCred.has(slot)) continue;
    const mN = await loadCastIds(svc, { therapists: rows, provider: 'ekichika', slot });
    if (mN.error) continue;
    const { off } = await loadConecfOff(svc, salonId, 'ekichika', slot);
    const targets = active.filter((t) => !!m1.maps.castIdOf.get(t.id) && !off.has(t.id));
    const done = targets.filter((t) => !!mN.maps.castIdOf.get(t.id)).length;
    if (targets.length === 0 || done >= targets.length) continue;
    const area = ekichikaAreaFromUrl(s.shop_url as string | null);
    items.push({ provider: 'ekichika', slot, label: area ? `${providerLabel('ekichika')}（${area}）` : `${providerLabel('ekichika')}（枠${slot}）`, done, total: targets.length });
  }
  return { ok: true, items };
}
