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
import { deleteTherapistWithCleanup } from '@/app/actions/therapistAdmin';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { isSavableTarget } from '@/lib/conecfTargets';
import {
  normalizeComments, normalizeQa, normalizeSiteFields, SITE_FIELD_PROVIDERS, type QaItem,
} from '@/lib/conecfSiteFields';

// コネックエフ「女性一覧・女性の編集」の受け口（第398便・1c・2026-09-17）。
//
// ★ 権限：ログイン中の人が owner の店（getConecfAccess と同じ選び方）。★ 他店のセラピストは触れない。
// ★ 書き込み：service_role で、列を限定して書く（therapistAdmin.ts と同じ作法）。
// ★★ 親データはフクエスの therapists。★ 保存すると age / body_type / 写真 もフクエスの表示に即時反映される。
// ★ conecf_therapist_profiles / conecf_therapist_targets は service_role 専用（RLS で閉じてある）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Svc = ReturnType<typeof createServiceClient>;

async function resolveSalon(opts: { write?: boolean } = {}): Promise<Result<{ svc: Svc; salonId: number; area: string | null }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon } = await svc
    .from('salons')
    .select('id, area, conecf_enabled_at')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!salon) return { ok: false, error: '店舗情報が見つかりません' };
  // ★ 第399便: 書き込みは「コネックエフに切り替え済み」の店だけ（★ 切り替え前は見るだけ）
  if (opts.write && !salon.conecf_enabled_at) return { ok: false, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
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
  const r = await resolveSalon({ write: true });
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
  const r = await resolveSalon({ write: true });
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
  const r = await resolveSalon({ write: true });
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
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const rows = (Array.isArray(input.targets) ? input.targets : [])
    // ★ 第408便: フクエスは外せない（保存しない）
    .filter((x) => isSavableTarget(String(x.provider)) && findMediaSite(String(x.provider)) && Number.isInteger(Number(x.slot)) && Number(x.slot) >= 1 && Number(x.slot) <= 20)
    .map((x) => ({ therapist_id: t.id, provider: String(x.provider), slot: Number(x.slot), enabled: x.enabled === true, updated_at: new Date().toISOString() }));
  if (rows.length === 0) return { ok: true, data: { saved: 0 } };
  const { error } = await svc.from('conecf_therapist_targets').upsert(rows, { onConflict: 'therapist_id,provider,slot' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { saved: rows.length } };
}

/**
 * ★ 第409便: 「送り先サイト」で送らない組（therapistId#provider#slot）。★ 「女性をサイトへ登録」で登録ボタンを隠すため。
 * ★ 切り替え前の店は空（★ フクエスリンクの画面は変わらない）。★ 読めなければ空（★ 受け口の buildGirlCreatePlan 等が断る）
 */
export async function listConecfTargetOffs(): Promise<Result<{ offs: string[] }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const { data: salon } = await svc.from('salons').select('conecf_enabled_at').eq('id', salonId).maybeSingle();
  if (!salon?.conecf_enabled_at) return { ok: true, data: { offs: [] } };
  const { data: ths } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  const ids = (ths ?? []).map((t) => Number(t.id));
  if (ids.length === 0) return { ok: true, data: { offs: [] } };
  const { data, error } = await svc
    .from('conecf_therapist_targets').select('therapist_id, provider, slot')
    .in('therapist_id', ids).eq('enabled', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { offs: (data ?? []).map((x) => `${x.therapist_id}#${x.provider}#${x.slot}`) } };
}

// ────────────────────────────────────────────────
// ★★ 第414便: コメント・Q&A・各サイト項目（ベンリーの「コメント／各サイト項目／Q&A」）。
//   ★ 決めごとは src/lib/conecfSiteFields.ts。★ この便は保存まで（★ サイトへ送るのは次の便）。
//   ★ SQL（20260917_conecf_girl_site_fields.sql）がまだの間は、読むときは空で出し、保存は断る。

export type ConecfGirlExtras = {
  comments: { catchphrase: string; profileText: string; shopTitle: string; girlComment: string };
  qa: QaItem[];
  siteFields: Array<{ provider: string; slot: number; label: string; fields: Record<string, unknown> }>;
  ready: boolean;
};

export async function getConecfGirlExtras(input: { id: number }): Promise<Result<ConecfGirlExtras>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const { data: th } = await svc.from('therapists').select('catchphrase, profile_text').eq('id', t.id).maybeSingle();
  const { data: p } = await svc.from('conecf_therapist_profiles').select('*').eq('therapist_id', t.id).maybeSingle();
  const prof = (p ?? {}) as Record<string, unknown>;
  const { data: sf, error: sfErr } = await svc.from('conecf_therapist_site_fields').select('provider, slot, fields').eq('therapist_id', t.id);
  const { data: creds } = await svc.from('salon_media_credentials').select('provider, slot').eq('salon_id', salonId);
  const got = new Map((sf ?? []).map((x) => [`${x.provider}#${x.slot}`, (x.fields ?? {}) as Record<string, unknown>]));
  const siteFields = (creds ?? [])
    .filter((c) => SITE_FIELD_PROVIDERS.includes(String(c.provider)))
    .map((c) => {
      const slot = Number(c.slot);
      return {
        provider: String(c.provider), slot,
        label: providerLabel(String(c.provider)) + (slot > 1 ? `（枠${slot}）` : ''),
        fields: got.get(`${c.provider}#${slot}`) ?? {},
      };
    })
    .sort((a, b) => SITE_FIELD_PROVIDERS.indexOf(a.provider) - SITE_FIELD_PROVIDERS.indexOf(b.provider) || a.slot - b.slot);
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    ok: true,
    data: {
      comments: {
        catchphrase: s(th?.catchphrase), profileText: s(th?.profile_text),
        shopTitle: s(prof.shop_title), girlComment: s(prof.girl_comment),
      },
      qa: Array.isArray(prof.qa) ? (prof.qa as QaItem[]) : [],
      siteFields,
      // ★ SQL がまだなら site_fields が読めない（★ 画面で「準備中」と出す）
      ready: !sfErr,
    },
  };
}

export async function saveConecfGirlComments(input: { id: number; comments: Record<string, unknown> }): Promise<Result<{ saved: true }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const n = normalizeComments(input.comments ?? {});
  if (!n.ok) return n;
  const v = n.value;
  // ★ キャッチ・お店コメントはフクエスの表示と同じ列（★ フクエスにもそのまま出る）
  const { error: tErr } = await svc.from('therapists')
    .update({ catchphrase: v.catchphrase || null, profile_text: v.profileText || null })
    .eq('id', t.id).eq('salon_id', salonId);
  if (tErr) return { ok: false, error: `保存に失敗しました: ${tErr.message}` };
  const { error: pErr } = await svc.from('conecf_therapist_profiles').upsert({
    therapist_id: t.id, shop_title: v.shopTitle || null, girl_comment: v.girlComment || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id' });
  if (pErr) return { ok: false, error: `保存に失敗しました（SQL がまだの可能性があります）: ${pErr.message}` };
  return { ok: true, data: { saved: true } };
}

export async function saveConecfGirlQa(input: { id: number; qa: unknown }): Promise<Result<{ count: number }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const n = normalizeQa(input.qa);
  if (!n.ok) return n;
  const { error } = await svc.from('conecf_therapist_profiles').upsert({
    therapist_id: t.id, qa: n.value, updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id' });
  if (error) return { ok: false, error: `保存に失敗しました（SQL がまだの可能性があります）: ${error.message}` };
  return { ok: true, data: { count: n.value.length } };
}

export async function saveConecfGirlSiteFields(input: {
  id: number; provider: string; slot: number; fields: Record<string, unknown>;
}): Promise<Result<{ fields: Record<string, unknown> }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const provider = String(input.provider ?? '');
  const slot = Math.trunc(Number(input.slot));
  if (!SITE_FIELD_PROVIDERS.includes(provider) || !(slot >= 1 && slot <= 20)) return { ok: false, error: 'サイトの指定が不正です' };
  const n = normalizeSiteFields(provider, input.fields ?? {});
  if (!n.ok) return n;
  const fields = n.value as unknown as Record<string, unknown>;
  const { error } = await svc.from('conecf_therapist_site_fields').upsert({
    therapist_id: t.id, provider, slot, fields, updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id,provider,slot' });
  if (error) return { ok: false, error: `保存に失敗しました（SQL がまだの可能性があります）: ${error.message}` };
  return { ok: true, data: { fields } };
}

// ── ★★★ 第432便: 女性の削除（退店）──────────────────────────
//   ★ 中身はマイページと同じ deleteTherapistWithCleanup（出勤 → 写メ日記 → 本人 → 写真の掃除）。★ 2か所に書かない。
//   ★ 取り消せない（★ 写真ファイルも消える）。
// ── ★★★ 第433便: 連携しているサイトからも一緒に ────────────────────
//   ★ 駅ちか … 削除（girl_delete・第228便・実弾で何度も通っている。★ 写真も一緒に消える）
//   ★ エステ魂 … 非表示（cast_hide・第229便。★ 公開ページは404・エステ魂の画面から戻せる）
//   ★ それ以外のサイトは自動では消せない（★ 画面に出して、各サイトで消してもらう）
//   ★★ 順番: 先にサイトへの依頼を積む → 全部積めたときだけコネックエフから消す。
//     ★ 1つでも積めなければ（別の更新が動いている等）コネックエフは消さずに止める。
//     ★ 積めたサイトは中継が消しに行く。★ もう一度押すと、そのサイトは「もう居ない」で何もせず終わる（二重に困らない）。

type DeleteSite = { provider: string; slot: number; castId: string; label: string; auto: 'delete' | 'hide' | null };
export type ConecfGirlDeleteInfo = { name: string; linked: Array<{ provider: string; label: string; slot: number; auto: 'delete' | 'hide' | null }> };

/** ★ そのサイトへ中継を積めるか（★ startRelayFlow と同じ条件：ログイン情報あり・停止中でない・「反映しない」でない） */
async function siteReady(svc: Svc, salonId: number, provider: string, slot: number): Promise<boolean> {
  const { data: cred } = await svc.from('salon_media_credentials').select('is_enabled').eq('salon_id', salonId).eq('provider', provider).eq('slot', slot).maybeSingle();
  if (!cred || cred.is_enabled !== true) return false;
  const { data: src } = await svc.from('salon_import_sources').select('link_mode').eq('salon_id', salonId).eq('provider', provider).eq('slot', slot).maybeSingle();
  return !(src && String((src as { link_mode?: string }).link_mode) === 'none');
}

async function linkedSites(svc: Svc, salonId: number, therapistId: number, legacyCastId: string | null): Promise<DeleteSite[]> {
  const { data: links } = await svc.from('therapist_media_ids').select('provider, slot, external_cast_id').eq('therapist_id', therapistId);
  const out: DeleteSite[] = ((links ?? []) as Array<{ provider: string; slot: number; external_cast_id: string }>).map((l) => {
    const provider = String(l.provider);
    return {
      provider, slot: Number(l.slot ?? 1), castId: String(l.external_cast_id ?? ''), label: providerLabel(provider),
      auto: provider === 'ekichika' ? 'delete' as const : provider === 'esutama' ? 'hide' as const : null,
    };
  });
  // ★ 駅ちかの枠1は、古い結びつき（therapists.import_cast_id）だけの人がいる
  if (legacyCastId && !out.some((x) => x.provider === 'ekichika' && x.slot === 1)) {
    out.push({ provider: 'ekichika', slot: 1, castId: legacyCastId, label: providerLabel('ekichika'), auto: 'delete' });
  }
  // ★ 積めないサイト（「反映しない」・停止中・ログイン情報なし）は自動で消さない側へ
  for (const x of out) {
    if (x.auto && !(await siteReady(svc, salonId, x.provider, x.slot))) x.auto = null;
  }
  return out.sort((a, b) => a.provider.localeCompare(b.provider) || a.slot - b.slot);
}

export async function getConecfGirlDeleteInfo(input: { id: number }): Promise<Result<ConecfGirlDeleteInfo>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: '女性が見つかりません' };
  const { data: legacy } = await svc.from('therapists').select('import_cast_id').eq('id', Number(t.id)).maybeSingle();
  const sites = await linkedSites(svc, salonId, Number(t.id), (legacy?.import_cast_id as string | null) ?? null);
  return { ok: true, data: { name: String(t.name ?? ''), linked: sites.map(({ provider, label, slot, auto }) => ({ provider, label, slot, auto })) } };
}

/**
 * @param alsoSites サイトからも消すなら true（★ 駅ちかは削除・エステ魂は非表示）。false ならコネックエフだけ
 */
export async function deleteConecfGirl(input: { id: number; alsoSites: boolean }): Promise<Result<{ salonId: number; name: string; queued: string[]; manual: string[] }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: '女性が見つかりません（すでに削除されている可能性があります）' };
  const name = String(t.name ?? '');

  const queued: string[] = [];
  const manual: string[] = [];
  /** ★ 第436便: 名簿の写しから外す番号（provider/slot/castId） */
  const pruned: Array<{ provider: string; slot: number; castId: string }> = [];
  if (input.alsoSites === true) {
    const { data: legacy } = await svc.from('therapists').select('import_cast_id').eq('id', Number(t.id)).maybeSingle();
    const sites = await linkedSites(svc, salonId, Number(t.id), (legacy?.import_cast_id as string | null) ?? null);
    for (const site of sites) {
      if (!site.auto || !/^\d{1,12}$/.test(site.castId)) { manual.push(site.label); continue; }
      let f;
      try {
        f = site.auto === 'delete'
          ? await startRelayFlow({ salonId, provider: site.provider, slot: site.slot, intent: 'girl_delete', actor: 'conecf:girl-delete', girlDelete: { castId: site.castId } })
          : await startRelayFlow({ salonId, provider: site.provider, slot: site.slot, intent: 'cast_hide', actor: 'conecf:girl-delete', castHide: { castId: site.castId } });
      } catch (e) {
        console.error('[conecf] 退店のサイト依頼を積めなかった', (e as Error).message);
        f = { ok: false as const, note: '開始できませんでした' };
      }
      if (!f.ok) {
        const why = 'reason' in f && f.reason === 'busy' ? 'いま' + site.label + 'で別の更新が動いています' : (f.note || '開始できませんでした');
        return { ok: false, error: site.label + 'への依頼を受け付けられなかったため、削除を止めました（' + why + '）。'
          + (queued.length > 0 ? queued.join('・') + 'には依頼済みです。' : '') + '少し待ってからもう一度お試しください' };
      }
      queued.push(site.label + (site.auto === 'delete' ? '（削除）' : '（非表示）'));
      pruned.push({ provider: site.provider, slot: site.slot, castId: site.castId });
    }
  }

  const res = await deleteTherapistWithCleanup({ therapistId: String(t.id), salonId });
  if (!res.ok) return { ok: false, error: res.error + (queued.length > 0 ? '（' + queued.join('・') + 'には依頼済みです）' : '') };
  // ★★ 第436便: 消した人を【名簿の写し】からも外す（★ 外さないと「名前が同じ」の候補に出続け、
  //   ★ 次に同じ名前の子を作ったとき、もう居ない相手に結びついてしまう・2026-09-18 00:08 に踏んだ）
  await pruneRosterSnapshots(svc, salonId, pruned);
  return { ok: true, data: { salonId, name, queued, manual } };
}

/**
 * ★★ 第436便: 名簿の写し（media_roster_snapshots）から、消した／非表示にした番号を外す。
 *   ★ 写しは「相手の画面をこの時刻に読んだ結果」なので、書き換えるのは本当は読み直しの役目。
 *     ★ でも読み直しは中継の周を待つ（数分）。★ その間に「名前が同じ」の候補として出てしまう。
 *   → ★ こちらが消した番号だけを、その場で抜く（★ ほかの行は触らない）。★ 次の読み直しで写しは正しくなる
 */
async function pruneRosterSnapshots(svc: Svc, salonId: number, rows: Array<{ provider: string; slot: number; castId: string }>): Promise<void> {
  for (const r of rows) {
    const { data } = await svc.from('media_roster_snapshots').select('entries, total')
      .eq('salon_id', salonId).eq('provider', r.provider).eq('slot', r.slot).maybeSingle();
    const entries = (data?.entries as Array<{ castId?: unknown }> | null) ?? null;
    if (!Array.isArray(entries)) continue;
    const next = entries.filter((e) => String(e?.castId ?? '') !== r.castId);
    if (next.length === entries.length) continue;
    const { error } = await svc.from('media_roster_snapshots')
      .update({ entries: next, total: next.length })
      .eq('salon_id', salonId).eq('provider', r.provider).eq('slot', r.slot);
    if (error) console.error('[conecf] 名簿の写しから外せなかった', r.provider, error.message);
  }
}
