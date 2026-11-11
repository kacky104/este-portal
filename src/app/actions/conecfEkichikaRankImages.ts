'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { normalizeRankImagePairs, normalizeRankImageInterval, type EkichikaRankImagePair } from '@/lib/ekichikaRankImage';

// 駅ちかの「店舗メイン／ランキング」の入れ替えの受け口（第1846便・2026-11-09・カッキーさん）
// ★ 運営が /admin で ON（admin_enabled）にした店だけ、コネックエフに出る。
// ★ 入れ替えは中継の流れ（lib/ekichikaRankImageFlow.ts）。周は /api/admin/ekichika-bump

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

export type ConecfEkichikaRankImageSetting = {
  slot: number; auto: boolean; intervalMin: number; pairs: EkichikaRankImagePair[]; nextIndex: number;
  lastDueAt: string | null; lastAt: string | null; lastOutcome: string | null;
};


export async function getConecfEkichikaRankImages(): Promise<Result<{ settings: ConecfEkichikaRankImageSetting[]; girls: string[] }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const st = await r.svc.from('conecf_ekichika_rankimgs').select('slot, auto, interval_min, pairs, next_index, last_due_at, last_at, last_outcome').eq('salon_id', r.salonId).eq('admin_enabled', true).order('slot');
  if (st.error) return { ok: true, data: { settings: [], girls: [] } };
  const t = await r.svc.from('therapists').select('name').eq('salon_id', r.salonId).order('name');
  return {
    ok: true,
    data: {
      settings: (st.data ?? []).map((x) => {
        const pairs = normalizeRankImagePairs(x.pairs);
        return {
          slot: Number(x.slot), auto: x.auto === true, intervalMin: normalizeRankImageInterval(x.interval_min), pairs,
          nextIndex: pairs.length > 0 ? Math.max(0, Number(x.next_index ?? 0)) % pairs.length : 0,
          lastDueAt: (x.last_due_at as string | null) ?? null, lastAt: (x.last_at as string | null) ?? null, lastOutcome: (x.last_outcome as string | null) ?? null,
        };
      }),
      girls: t.error ? [] : [...new Set((t.data ?? []).map((d) => String(d.name ?? '').trim()).filter(Boolean))],
    },
  };
}

export async function saveConecfEkichikaRankImage(input: { slot: number; auto: boolean; intervalMin: number; pairs: EkichikaRankImagePair[] }): Promise<Result<null>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  const pairs = normalizeRankImagePairs(input.pairs);
  if (input.auto === true && pairs.length === 0) return { ok: false, error: '組を1つ以上入れてください' };
  const { data: cur } = await r.svc.from('conecf_ekichika_rankimgs').select('next_index').eq('salon_id', r.salonId).eq('slot', slot).maybeSingle();
  const nextIndex = pairs.length > 0 ? Math.max(0, Number(cur?.next_index ?? 0)) % pairs.length : 0;
  const { data, error } = await r.svc.from('conecf_ekichika_rankimgs')
    .update({ auto: input.auto === true, interval_min: normalizeRankImageInterval(input.intervalMin), pairs, next_index: nextIndex, updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('slot', slot).eq('admin_enabled', true).select('slot');
  if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  if (!data || data.length === 0) return { ok: false, error: 'この枠は使えるようになっていません。運営事務局までご連絡ください' };
  return { ok: true, data: null };
}

/** ★ 保存してある組を、いま1回置く（次の自動はこの組の次から・間隔はここから数え直す） */
export async function runConecfEkichikaRankImageNow(input: { slot: number; index: number }): Promise<Result<{ note: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  const { data: st } = await r.svc.from('conecf_ekichika_rankimgs').select('pairs, last_due_at').eq('salon_id', r.salonId).eq('slot', slot).eq('admin_enabled', true).maybeSingle();
  if (!st) return { ok: false, error: 'この枠は使えるようになっていません。運営事務局までご連絡ください' };
  const pairs = normalizeRankImagePairs(st.pairs);
  const index = Number(input.index);
  const pair = pairs[index];
  if (!pair) return { ok: false, error: '組が見つかりません（保存してから押してください）' };
  const prevDue = (st.last_due_at as string | null) ?? null;
  await r.svc.from('conecf_ekichika_rankimgs').update({ last_due_at: new Date().toISOString() }).eq('salon_id', r.salonId).eq('slot', slot);
  try {
    const f = await startRelayFlow({
      salonId: r.salonId, provider: 'ekichika', slot, intent: 'bump_push', actor: 'shop:' + r.userId,
      ekichikaRankImage: { index, nextIndex: (index + 1) % pairs.length, main: pair.main, ranking: pair.ranking },
    });
    if (!f.ok) { await r.svc.from('conecf_ekichika_rankimgs').update({ last_due_at: prevDue }).eq('salon_id', r.salonId).eq('slot', slot); return { ok: false, error: f.note }; }
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] 駅ちかの店舗メイン／ランキングを始められなかった', (e as Error).message);
    await r.svc.from('conecf_ekichika_rankimgs').update({ last_due_at: prevDue }).eq('salon_id', r.salonId).eq('slot', slot);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}

// ── 運営 ──（★ その店の全部の枠をまとめて ON / OFF。行が無ければ枠1を作る）
export async function adminGetEkichikaRankImages(salonId: number): Promise<Result<{ enabled: boolean }>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const { data, error } = await createServiceClient().from('conecf_ekichika_rankimgs').select('admin_enabled').eq('salon_id', Number(salonId));
  if (error) return { ok: false, error: '読めませんでした（追加SQL_第1846便は流しましたか？）: ' + error.message };
  return { ok: true, data: { enabled: (data ?? []).some((x) => x.admin_enabled === true) } };
}
export async function adminSetEkichikaRankImages(input: { salonId: number; enabled: boolean }): Promise<Result<null>> {
  if (!(await requireAdmin())) return { ok: false, error: '運営のみ操作できます' };
  const salonId = Number(input.salonId);
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '指定が不正です' };
  const svc = createServiceClient();
  const { data: cur } = await svc.from('conecf_ekichika_rankimgs').select('slot').eq('salon_id', salonId);
  const res = (cur ?? []).length > 0
    ? await svc.from('conecf_ekichika_rankimgs').update({ admin_enabled: input.enabled === true, ...(input.enabled ? {} : { auto: false }), updated_at: new Date().toISOString() }).eq('salon_id', salonId)
    : await svc.from('conecf_ekichika_rankimgs').insert({ salon_id: salonId, slot: 1, admin_enabled: input.enabled === true });
  if (res.error) return { ok: false, error: '保存できませんでした: ' + res.error.message };
  return { ok: true, data: null };
}
