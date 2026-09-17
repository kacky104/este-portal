import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCastIds } from '@/lib/mediaCastIds';
import { conecfTargetBlock } from '@/app/lib/conecf/targets';
import { parseBodyType } from '@/lib/bodyType';
import type { EkichikaGirlEditValues } from '@/lib/ekichikaGirlEdit';

// ★★★ 駅ちかのプロフィール更新に送る材料を DB から作る（第415便・2026-09-17）。
//   ★ 運営の口（/api/admin/media-girl-edit）と、あとで作る店舗様の画面の両方がここを通る（★ 2か所に書かない）。
//   ★ 読むもの: therapists（年齢・サイズ・キャッチ・紹介文）／conecf_therapist_profiles（数字のサイズ・血液型・タイトル・女の子コメント・Q&A）
//              ／conecf_therapist_site_fields（駅ちか：ジャンル・優先タグ・オプション・新人・星座）
//   ★ 決めごと（空は触らない等）は src/lib/ekichikaGirlEdit.ts が持つ。★ ここは集めるだけ。

export type GirlEditBuilt =
  | { ok: true; data: { castId: string; name: string; values: EkichikaGirlEditValues } }
  | { ok: false; status: number; error: string };

export async function buildGirlEditValues(
  svc: SupabaseClient, input: { salonId: number; therapistId: number; slot: number },
): Promise<GirlEditBuilt> {
  const { salonId, therapistId, slot } = input;
  const { data: th, error } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, catchphrase, profile_text, import_cast_id')
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
    catchcopy: str(th.catchphrase),
    comments: str(th.profile_text),
    title: str(prof.shop_title),
    girlComments: str(prof.girl_comment),
    qa: Array.isArray(prof.qa) ? (prof.qa as Array<{ q: string; a: string }>) : [],
    options: str(f.options),
    genres: arr(f.genres),
    pGenres: arr(f.pGenres),
    rookie: str(f.rookie),
  };
  return { ok: true, data: { castId, name: str(th.name), values } };
}
