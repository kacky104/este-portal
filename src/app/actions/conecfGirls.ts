'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { findMediaSite } from '@/lib/mediaSites';
import { providerLabel } from '@/lib/mediaAudit';
import { sortTherapistsByKana } from '@/lib/therapistOrder';
import { isNewFaceActive } from '@/lib/newFace';
import {
  bodyTypeFromSizes, normalizeConecfGirl, CONECF_MAX_IMAGES, type ConecfGirlInput,
} from '@/lib/conecfGirl';
import { parseBodyType } from '@/lib/bodyType';

// コネックエフ「女性一覧・女性の編集」の受け口（第398便・1c・2026-09-17）。
//
// ★ 権限：ログイン中の人が owner の店（getConecfAccess と同じ選び方）。★ 他店のセラピストは触れない。
// ★ 書き込み：service_role で、列を限定して書く（therapistAdmin.ts と同じ作法）。
// ★★ 親データはフクエスの therapists。★ 保存すると age / body_type / 写真 もフクエスの表示に即時反映される。
// ★ conecf_therapist_profiles / conecf_therapist_targets は service_role 専用（RLS で閉じてある）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Svc = ReturnType<typeof createServiceClient>;

async function resolveSalon(): Promise<Result<{ svc: Svc; salonId: number; area: string | null }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc
    .from('salons')
    .select('id, area')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!salon) return { ok: false, error: '店舗情報が見つかりません' };
  return { ok: true, data: { svc, salonId: Number(salon.id), area: (salon.area as string | null) ?? null } };
}

async function ownTherapist(svc: Svc, salonId: number, therapistId: number) {
  const { data } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, profile_image_url, profile_images, is_new_face, new_face_since, is_active')
    .eq('id', therapistId)
    .maybeSingle();
  if (!data || Number(data.salon_id) !== salonId) return null;
  return data;
}

function imagesOf(t: { profile_images?: unknown; profile_image_url?: unknown }): string[] {
  const arr = Array.isArray(t.profile_images) ? (t.profile_images as unknown[]).filter((x): x is string => typeof x === 'string' && x !== '') : [];
  if (arr.length > 0) return arr.slice(0, CONECF_MAX_IMAGES);
  return typeof t.profile_image_url === 'string' && t.profile_image_url ? [t.profile_image_url] : [];
}

// ────────────────────────────────────────────────
export type ConecfGirlRow = {
  id: number; name: string; age: string | null; bodyType: string | null; imageUrl: string | null;
  isNewFace: boolean; isActive: boolean; joinedOn: string | null;
};

export async function listConecfGirls(): Promise<Result<{ salonId: number; girls: ConecfGirlRow[] }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const { data, error } = await svc
    .from('therapists')
    .select('id, name, age, body_type, profile_image_url, profile_images, is_new_face, new_face_since, is_active')
    .eq('salon_id', salonId);
  if (error) return { ok: false, error: error.message };
  const ids = (data ?? []).map((t) => Number(t.id));
  const joined = new Map<number, string | null>();
  if (ids.length > 0) {
    const { data: prof } = await svc.from('conecf_therapist_profiles').select('therapist_id, joined_on').in('therapist_id', ids);
    (prof ?? []).forEach((p) => joined.set(Number(p.therapist_id), (p.joined_on as string | null) ?? null));
  }
  const rows: ConecfGirlRow[] = (data ?? []).map((t) => ({
    id: Number(t.id),
    name: (t.name as string | null) ?? '',
    age: t.age != null ? String(t.age) : null,
    bodyType: (t.body_type as string | null) ?? null,
    imageUrl: imagesOf(t)[0] ?? null,
    isNewFace: isNewFaceActive(t.is_new_face as boolean | null, t.new_face_since as string | null),
    isActive: t.is_active !== false,
    joinedOn: joined.get(Number(t.id)) ?? null,
  }));
  return { ok: true, data: { salonId, girls: sortTherapistsByKana(rows, (x) => x.name, (x) => !x.isActive) } };
}

export async function createConecfGirl(input: { name: string; isNewFace: boolean }): Promise<Result<{ id: number }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId, area } = r.data;
  const name = String(input.name ?? '').trim();
  if (!name) return { ok: false, error: '女性名を入れてください' };
  if ([...name].length > 10) return { ok: false, error: '女性名は10文字までです' };
  const isNew = input.isNewFace === true;
  const { data, error } = await svc
    .from('therapists')
    .insert({
      salon_id: salonId, name, area,
      is_new_face: isNew, new_face_since: isNew ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: `追加に失敗しました: ${error?.message ?? ''}` };
  return { ok: true, data: { id: Number(data.id) } };
}

// ────────────────────────────────────────────────
export type ConecfGirlDetail = {
  salonId: number;
  id: number;
  images: string[];
  form: {
    name: string; nameKana: string; nameHira: string; nameRomaji: string;
    joinedOn: string; isNewFace: boolean; isActive: boolean;
    age: string; birthDate: string;
    height: string; bust: string; cup: string; waist: string; hip: string; weight: string;
    bloodType: string; style: string; lookType: string;
  };
  sites: Array<{ provider: string; slot: number; label: string; enabled: boolean }>;
};

export async function getConecfGirl(input: { id: number }): Promise<Result<ConecfGirlDetail>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };

  const { data: p } = await svc.from('conecf_therapist_profiles').select('*').eq('therapist_id', t.id).maybeSingle();
  // ★ 数字のサイズがまだ無い方は、フクエスの body_type から埋めて出す（★ 取り込み・マイページで入れた値を捨てない）
  const fromBody = parseBodyType((t.body_type as string | null) ?? null);
  const s = (x: unknown) => (x === null || x === undefined ? '' : String(x));

  const { data: creds } = await svc.from('salon_media_credentials').select('provider, slot').eq('salon_id', salonId);
  const { data: tg } = await svc.from('conecf_therapist_targets').select('provider, slot, enabled').eq('therapist_id', t.id);
  const off = new Set((tg ?? []).filter((x) => x.enabled === false).map((x) => `${x.provider}#${x.slot}`));
  const sites = (creds ?? [])
    .filter((c) => {
      const site = findMediaSite(String(c.provider));
      return !!site && site.accepting && (site.can.includes('work') || site.can.includes('therapist'));
    })
    .map((c) => {
      const slot = Number(c.slot);
      const label = providerLabel(String(c.provider)) + (slot > 1 ? `（枠${slot}）` : '');
      return { provider: String(c.provider), slot, label, enabled: !off.has(`${c.provider}#${slot}`) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));

  return {
    ok: true,
    data: {
      salonId,
      id: Number(t.id),
      images: imagesOf(t),
      form: {
        name: s(t.name),
        nameKana: s(p?.name_kana), nameHira: s(p?.name_hira), nameRomaji: s(p?.name_romaji),
        joinedOn: s(p?.joined_on),
        isNewFace: isNewFaceActive(t.is_new_face as boolean | null, t.new_face_since as string | null),
        isActive: t.is_active !== false,
        age: s(t.age), birthDate: s(p?.birth_date),
        height: s(p?.height ?? fromBody?.height), bust: s(p?.bust ?? fromBody?.bust), cup: s(p?.cup ?? fromBody?.cup),
        waist: s(p?.waist ?? fromBody?.waist), hip: s(p?.hip ?? fromBody?.hip), weight: s(p?.weight),
        bloodType: s(p?.blood_type), style: s(p?.style), lookType: s(p?.look_type),
      },
      sites,
    },
  };
}

export async function saveConecfGirl(input: { id: number; values: ConecfGirlInput }): Promise<Result<{ age: string | null; bodyType: string }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };

  const n = normalizeConecfGirl(input.values ?? { name: '' }, new Date());
  if (!n.ok) return n;
  const v = n.value;
  const bodyType = bodyTypeFromSizes(v);

  // ★ 新人：付けた瞬間だけ日付を入れる（★ 付けたままなら日付を動かさない＝60日の数え直しをしない）
  const wasNew = t.is_new_face === true;
  const patch: Record<string, unknown> = {
    name: v.name,
    age: v.age != null ? String(v.age) : null,
    body_type: bodyType || null,
    is_new_face: v.isNewFace,
  };
  if (v.isNewFace && !wasNew) patch.new_face_since = new Date().toISOString();
  if (!v.isNewFace) patch.new_face_since = null;

  const { error: upErr } = await svc.from('therapists').update(patch).eq('id', t.id).eq('salon_id', salonId);
  if (upErr) return { ok: false, error: `保存に失敗しました: ${upErr.message}` };

  const { error: pErr } = await svc.from('conecf_therapist_profiles').upsert({
    therapist_id: t.id,
    name_kana: v.nameKana, name_hira: v.nameHira, name_romaji: v.nameRomaji,
    joined_on: v.joinedOn, birth_date: v.birthDate,
    height: v.height, bust: v.bust, cup: v.cup, waist: v.waist, hip: v.hip, weight: v.weight,
    blood_type: v.bloodType, style: v.style, look_type: v.lookType,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id' });
  if (pErr) return { ok: false, error: `保存に失敗しました（追加の項目）: ${pErr.message}` };

  return { ok: true, data: { age: patch.age as string | null, bodyType } };
}

export async function saveConecfGirlImages(input: { id: number; images: string[] }): Promise<Result<{ images: string[] }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const images = (Array.isArray(input.images) ? input.images : [])
    .filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u))
    .slice(0, CONECF_MAX_IMAGES);
  const { error } = await svc
    .from('therapists')
    .update({ profile_image_url: images[0] ?? null, profile_images: images })
    .eq('id', t.id).eq('salon_id', salonId);
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { images } };
}

export async function saveConecfGirlTargets(input: {
  id: number; targets: Array<{ provider: string; slot: number; enabled: boolean }>;
}): Promise<Result<{ saved: number }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const rows = (Array.isArray(input.targets) ? input.targets : [])
    .filter((x) => findMediaSite(String(x.provider)) && Number.isInteger(Number(x.slot)) && Number(x.slot) >= 1 && Number(x.slot) <= 20)
    .map((x) => ({ therapist_id: t.id, provider: String(x.provider), slot: Number(x.slot), enabled: x.enabled === true, updated_at: new Date().toISOString() }));
  if (rows.length === 0) return { ok: true, data: { saved: 0 } };
  const { error } = await svc.from('conecf_therapist_targets').upsert(rows, { onConflict: 'therapist_id,provider,slot' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { saved: rows.length } };
}
