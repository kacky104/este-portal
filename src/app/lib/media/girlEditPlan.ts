import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCastIds } from '@/lib/mediaCastIds';
import { conecfTargetBlock } from '@/app/lib/conecf/targets';
import { parseBodyType } from '@/lib/bodyType';
import type { EkichikaGirlEditValues } from '@/lib/ekichikaGirlEdit';
import { PHOTO_SLOT_MAX, type PhotoSyncOp } from '@/lib/ekichikaPhoto';
import { resolveTherapistPhotoFile } from '@/app/lib/media/therapistPhotoFile';
import { photoKey, esutamaRemovalSlots, ESUTAMA_SYNC_MAX } from '@/lib/esutamaPhotoSync';
import type { EsutamaEditPhotos } from '@/lib/relayFlow';

// ★★★ 駅ちかのプロフィール更新に送る材料を DB から作る（第415便・2026-09-17）。
//   ★ 運営の口（/api/admin/media-girl-edit）と、あとで作る店舗様の画面の両方がここを通る（★ 2か所に書かない）。
//   ★ 読むもの: therapists（年齢・サイズ・キャッチ・紹介文）／conecf_therapist_profiles（数字のサイズ・血液型・タイトル・女の子コメント・Q&A）
//              ／conecf_therapist_site_fields（駅ちか：ジャンル・優先タグ・オプション・新人・星座）
//   ★ 決めごと（空は触らない等）は src/lib/ekichikaGirlEdit.ts が持つ。★ ここは集めるだけ。

export type GirlEditBuilt =
  | { ok: true; data: { castId: string; name: string; values: EkichikaGirlEditValues; therapistId: number; photos: PhotoSyncOp[]; photoSkipped: string[] } }
  | { ok: false; status: number; error: string };

export async function buildGirlEditValues(
  svc: SupabaseClient, input: { salonId: number; therapistId: number; slot: number },
): Promise<GirlEditBuilt> {
  const { salonId, therapistId, slot } = input;
  const { data: th, error } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, catchphrase, profile_text, import_cast_id, profile_image_url, profile_images')
    .eq('id', therapistId).maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!th) return { ok: false, status: 404, error: 'セラピストが見つからない' };
  if (Number(th.salon_id) !== salonId) return { ok: false, status: 400, error: 'そのセラピストはこの店舗の在籍ではありません' };

  const blocked = await conecfTargetBlock(svc, { salonId, therapistId, provider: 'ekichika', slot });
  if (blocked) return { ok: false, status: 400, error: blocked };

  const { maps, error: castErr } = await loadCastIds(svc, {
    therapists: [{ id: therapistId, import_cast_id: (th.import_cast_id as string | null) ?? null }], provider: 'ekichika', slot,
  });
  if (castErr) return { ok: false, status: 500, error: castErr };
  const castId = maps.castIdOf.get(therapistId) ?? null;
  if (!castId) return { ok: false, status: 400, error: 'この方は駅ちかと連携していません（「女性をサイトへ登録」で連携してください）' };

  const { data: p } = await svc.from('conecf_therapist_profiles').select('*').eq('therapist_id', therapistId).maybeSingle();
  const prof = (p ?? {}) as Record<string, unknown>;
  const { data: sf } = await svc.from('conecf_therapist_site_fields').select('fields')
    .eq('therapist_id', therapistId).eq('provider', 'ekichika').eq('slot', slot).maybeSingle();
  const f = ((sf?.fields ?? {}) as Record<string, unknown>);
  const body = parseBodyType((th.body_type as string | null) ?? null);
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  const values: EkichikaGirlEditValues = {
    age: str(th.age),
    tall: str(prof.height ?? body?.height),
    bust: str(prof.bust ?? body?.bust),
    waist: str(prof.waist ?? body?.waist),
    hip: str(prof.hip ?? body?.hip),
    cup: str(prof.cup ?? body?.cup),
    bloodtype: str(prof.blood_type),
    constellation: str(f.constellation),
    // ★ 第729便: 駅ちか専用の値があればそれ、空ならフクエスの値
    catchcopy: str(f.catchcopy) || str(th.catchphrase),
    comments: str(f.comments) || str(th.profile_text),
    title: str(prof.shop_title),
    girlComments: str(prof.girl_comment),
    qa: Array.isArray(prof.qa) ? (prof.qa as Array<{ q: string; a: string }>) : [],
    options: str(f.options),
    genres: arr(f.genres),
    pGenres: arr(f.pGenres),
    rookie: str(f.rookie),
  };
  const ph = await buildGirlEditPhotos(svc, {
    therapistId, slot,
    images: imagesOf(th as { profile_images?: unknown; profile_image_url?: unknown }),
  });
  return { ok: true, data: { castId, name: str(th.name), values, therapistId, photos: ph.photos, photoSkipped: ph.skipped } };
}

/** ★ コネックエフの女性の写真（★ conecfGirls.ts の imagesOf と同じ読み方） */
export function imagesOf(t: { profile_images?: unknown; profile_image_url?: unknown }): string[] {
  const arr = Array.isArray(t.profile_images) ? (t.profile_images as unknown[]).filter((x): x is string => typeof x === 'string' && x !== '') : [];
  if (arr.length > 0) return arr.slice(0, PHOTO_SLOT_MAX);
  return typeof t.profile_image_url === 'string' && t.profile_image_url ? [t.profile_image_url] : [];
}

/**
 * ★★★ 第421便: 駅ちかの画像の枠へ合わせる手を作る（★ 変わった枠だけ）。
 *   ・N枚目の写真 → 枠N（★ 詰めない・ずらさない）
 *   ・前に送った写真（conecf_photo_pushes）と違えば put（★ 駅ちかにある写真は上書き＝コネックエフが正）
 *   ・写真の無い枠は remove（★★ 第426便: 【送った記録のある枠だけ】。★ 第424便の「記録が無くても消す」はやめた）
 *   ★★ 第426便: 最初の取り込みは駅ちかの写真を持ってこない → 記録の無い枠の駅ちかの写真は、上書きも削除もしない（フロー側で見る）
 *   ★ 記録の表がまだ無い（SQL 前）ときは、写真は何もしない
 */
export async function buildGirlEditPhotos(
  svc: SupabaseClient, input: { therapistId: number; slot: number; images: string[] },
): Promise<{ photos: PhotoSyncOp[]; skipped: string[] }> {
  const { data, error } = await svc.from('conecf_photo_pushes').select('image_slot, source_url')
    .eq('therapist_id', input.therapistId).eq('provider', 'ekichika').eq('slot', input.slot);
  if (error) return { photos: [], skipped: [] };
  const had = new Map<number, string>(((data ?? []) as Array<{ image_slot: number; source_url: string }>).map((r) => [Number(r.image_slot), String(r.source_url)]));
  const photos: PhotoSyncOp[] = [];
  const skipped: string[] = [];
  // ★ 寸法を読むために実物を取る。★ 枠ごとに並べて取る（まとめて更新で待たせない）
  const results = await Promise.all(Array.from({ length: PHOTO_SLOT_MAX }, async (_, i): Promise<PhotoSyncOp | string | null> => {
    const n = i + 1;
    const want = input.images[i] ?? null;
    const before = had.get(n) ?? null;
    // ★ 第434便: 比べるのは therapist-photos/<path>（★ 登録のときの記録は URL ではなく bucket/path で残る）
    if (want && photoKey(want) !== photoKey(before)) {
      const f = await resolveTherapistPhotoFile(svc, { therapistId: input.therapistId, imageSetId: n, profileImageUrl: want });
      if (!f.ok) return '枠' + n + '：' + f.error.slice(0, 40);
      const { bucket, path, filename, contentType, width, height } = f.file;
      return { slot: n, action: 'put', sourceUrl: want, recorded: before !== null, file: { bucket, path, filename, contentType, width, height } };
    }
    // ★★ 第426便: 写真の無い枠は【送った記録のある枠だけ】消す（★ 駅ちかにしか無い写真を消さない）。
    //   ★ 第424便の「記録が無くても消す」は、最初の取り込みで写真が入らないため危ないのでやめた
    if (!want && before) return { slot: n, action: 'remove', sourceUrl: null, recorded: true };
    return null;
  }));
  for (const x of results) {
    if (typeof x === 'string') skipped.push(x);
    else if (x) photos.push(x);
  }
  return { photos, skipped };
}

/**
 * ★★ 第428便: 「更新する」で駅ちかから【消える枠】を先に数える（★ 押す前の確認に使う・通信なし）。
 *   ★ buildGirlEditPhotos の remove と同じ決め方（送った記録があり、コネックエフの写真が無い枠）。
 *   ★ 画像1は駅ちかで消せない（残る）ので数えない。
 */
export async function planPhotoRemovalSlots(
  svc: SupabaseClient, input: { therapistId: number; slot: number; images: string[] },
): Promise<number[]> {
  const { data, error } = await svc.from('conecf_photo_pushes').select('image_slot')
    .eq('therapist_id', input.therapistId).eq('provider', 'ekichika').eq('slot', input.slot);
  if (error) return [];
  const had = new Set(((data ?? []) as Array<{ image_slot: number }>).map((r) => Number(r.image_slot)));
  const out: number[] = [];
  for (let n = 2; n <= PHOTO_SLOT_MAX; n++) if (!input.images[n - 1] && had.has(n)) out.push(n);
  return out;
}

// ── ★★★ 第430便: エステ魂のプロフィール更新に送る材料 ──────────────────
export type CastEditBuilt =
  | { ok: true; data: { castId: string; name: string; values: import('@/lib/esutamaCastEdit').EsutamaCastEditValues; therapistId: number; photos: EsutamaEditPhotos; removals: number[] } }
  | { ok: false; status: number; error: string };

/**
 * ★ 読むもの: therapists（年齢・サイズ・お店コメント）／conecf_therapist_profiles（数字のサイズ・血液型・女の子コメント）
 *            ／conecf_therapist_site_fields（エステ魂：特徴・エステ歴・資格・体型・質問6つ・SNS）
 * ★ 決めごと（空は触らない等）は src/lib/esutamaCastEdit.ts が持つ。★ ここは集めるだけ。
 */
export async function buildCastEditValues(
  svc: SupabaseClient, input: { salonId: number; therapistId: number; slot: number },
): Promise<CastEditBuilt> {
  const { salonId, therapistId, slot } = input;
  const { data: th, error } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, profile_text, import_cast_id, profile_image_url, profile_images')
    .eq('id', therapistId).maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!th) return { ok: false, status: 404, error: 'セラピストが見つからない' };
  if (Number(th.salon_id) !== salonId) return { ok: false, status: 400, error: 'そのセラピストはこの店舗の在籍ではありません' };

  const blocked = await conecfTargetBlock(svc, { salonId, therapistId, provider: 'esutama', slot });
  if (blocked) return { ok: false, status: 400, error: blocked };

  const { maps, error: castErr } = await loadCastIds(svc, {
    therapists: [{ id: therapistId, import_cast_id: null }], provider: 'esutama', slot,
  });
  if (castErr) return { ok: false, status: 500, error: castErr };
  const castId = maps.castIdOf.get(therapistId) ?? null;
  if (!castId) return { ok: false, status: 400, error: 'この方はエステ魂と連携していません（「女性をサイトへ登録」で連携してください）' };

  const { data: p } = await svc.from('conecf_therapist_profiles').select('*').eq('therapist_id', therapistId).maybeSingle();
  const prof = (p ?? {}) as Record<string, unknown>;
  const { data: sf } = await svc.from('conecf_therapist_site_fields').select('fields')
    .eq('therapist_id', therapistId).eq('provider', 'esutama').eq('slot', slot).maybeSingle();
  const f = ((sf?.fields ?? {}) as Record<string, unknown>);
  const body = parseBodyType((th.body_type as string | null) ?? null);
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const rec = (v: unknown): Record<string, string> => {
    const o: Record<string, string> = {};
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'string') o[k] = x;
    return o;
  };
  return {
    ok: true,
    data: {
      castId, name: str(th.name), therapistId,
      ...(await buildEsutamaEditPhotos(svc, { therapistId, slot, images: imagesOf(th as { profile_images?: unknown; profile_image_url?: unknown }) })),
      values: {
        age: str(th.age),
        tall: str(prof.height ?? body?.height),
        bust: str(prof.bust ?? body?.bust),
        waist: str(prof.waist ?? body?.waist),
        hip: str(prof.hip ?? body?.hip),
        cup: str(prof.cup ?? body?.cup),
        blood: str(prof.blood_type),
        description: str(f.description) || str(th.profile_text),   // ★ 第729便: エステ魂専用が空ならフクエスの詳細プロフィール
        castPr: str(prof.girl_comment),
        types: Array.isArray(f.types) ? (f.types as unknown[]).filter((x): x is string => typeof x === 'string') : [],
        experience: str(f.experience),
        qualified: str(f.qualified),
        bodyStyle: str(f.bodyStyle),
        answers: rec(f.answers),
        sns: rec(f.sns),
      },
    },
  };
}

/**
 * ★★★ 第434便: エステ魂の写真を合わせる材料。★ 通信しない（★ 実物は中継が取りに来る口で読む）
 *   want … コネックエフの写真の並び（最大6・therapist-photos の中だけ。★ 形が違う写真が出たら、そこから後ろは合わせない）
 *   had  … 送った記録（枠 → therapist-photos/<path>）
 *   allowRemove は呼び出し側（押す前の確認）が決める。★ ここでは false
 */
export async function buildEsutamaEditPhotos(
  svc: SupabaseClient, input: { therapistId: number; slot: number; images: string[] },
): Promise<{ photos: EsutamaEditPhotos; removals: number[] }> {
  const want: Array<{ bucket: string; path: string }> = [];
  for (const u of input.images.slice(0, ESUTAMA_SYNC_MAX)) {
    const key = photoKey(u);
    const path = key.startsWith('therapist-photos/') ? key.slice('therapist-photos/'.length) : '';
    if (!path || !/^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/.test(path) || path.includes('..') || path.includes('//')) break;
    want.push({ bucket: 'therapist-photos', path });
  }
  const { data } = await svc.from('conecf_photo_pushes').select('image_slot, source_url')
    .eq('therapist_id', input.therapistId).eq('provider', 'esutama').eq('slot', input.slot);
  const had: Record<number, string> = {};
  for (const r of (data ?? []) as Array<{ image_slot: number; source_url: string }>) had[Number(r.image_slot)] = String(r.source_url);
  const removals = esutamaRemovalSlots(want.map((f) => f.bucket + '/' + f.path), had);
  return { photos: { want, had, allowRemove: false }, removals };
}
