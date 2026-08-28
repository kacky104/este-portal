// セラピストの媒体側ID（セラピスト × 媒体 × 枠）を1か所にまとめる（第42便）。
//
// ★★★ なぜこのファイルが要るか
//   駅ちかは同じ店舗が別エリア・別IDで2掲載していることが多い（博多駅周辺 ＋ 中洲・天神）。
//   ★ 同一人物でも枠が違えば castId は別の番号になる（第38便 §17-11・実測）:
//       さら … 掲載A(46440) castId 5232208 ／ 掲載B(29218) castId 4624191
//   これまでは therapists.import_cast_id という text 1本しか無く、枠2の番号を置く場所が無かった。
//
// ★★ 併存させる（この便では import_cast_id を落とさない）
//   照合はいま毎周 import_cast_id を読んでいる。列を落として読み替えを同時にやると、
//   新しい経路に穴があったとき【全店の照合が一度に壊れる】。
//   → 読むときは「新しい表 → 旧列」の順に見る。書くときは【両方に書く】。
//     旧列を落とすのは、実地で1周まわって数が合ってから（第43便以降）。
//
// ★ 旧列の意味は「駅ちかの枠1」とみなす。いま読んでいるのは1店1掲載だけなので、これで正しい。

import type { SupabaseClient } from '@supabase/supabase-js';

/** 旧 therapists.import_cast_id が指していた媒体と枠。 */
export const LEGACY_CAST_ID_PROVIDER = 'ekichika';
export const LEGACY_CAST_ID_SLOT = 1;

/** 旧列を混ぜてよい組み合わせか（駅ちかの枠1だけ）。 */
export function isLegacyCastIdScope(provider: string, slot: number): boolean {
  return provider === LEGACY_CAST_ID_PROVIDER && slot === LEGACY_CAST_ID_SLOT;
}

export type CastIdMaps = {
  /** 媒体側の castId → therapist_id（照合に使う） */
  byCastId: Map<string, number>;
  /** therapist_id → いま登録されている castId（空なら埋めにいく） */
  castIdOf: Map<number, string | null>;
};

/** 旧列と一緒に読み込む在籍行の最小形。ingest 側が既に select しているものをそのまま渡す。 */
export type TherapistCastIdRow = { id: number; import_cast_id?: string | null };

/**
 * その店の在籍について「この媒体・この枠での castId」を引けるようにする。
 *
 * ★ therapistIds は、呼び出し側が既に読んでいる在籍のID。ここで therapists を読み直さない
 *   （毎周1本増やさないため。第39便の「周りに無駄な問い合わせを足さない」）。
 * ★ 旧列は provider='ekichika' かつ slot=1 のときだけ混ぜる。他の枠に旧列を流用すると
 *   【枠Aの番号で枠Bを更新する】という、いちばんやってはいけない取り違えになる。
 */
export async function loadCastIds(
  supabase: SupabaseClient,
  input: {
    therapists: TherapistCastIdRow[];
    provider: string;
    slot: number;
  },
): Promise<{ maps: CastIdMaps; error?: string }> {
  const byCastId = new Map<string, number>();
  const castIdOf = new Map<number, string | null>();

  const ids = input.therapists.map((t) => t.id);
  for (const id of ids) castIdOf.set(id, null);

  // 1. 旧列（駅ちかの枠1のときだけ）
  if (isLegacyCastIdScope(input.provider, input.slot)) {
    for (const t of input.therapists) {
      const cid = t.import_cast_id ?? null;
      if (!cid) continue;
      castIdOf.set(t.id, cid);
      if (!byCastId.has(cid)) byCastId.set(cid, t.id);
    }
  }

  if (ids.length === 0) return { maps: { byCastId, castIdOf } };

  // 2. 新しい表。★ 同じ therapist について旧列より優先する（移行後はこちらが正）。
  const { data, error } = await supabase
    .from('therapist_media_ids')
    .select('therapist_id, external_cast_id')
    .eq('provider', input.provider)
    .eq('slot', input.slot)
    .in('therapist_id', ids);
  if (error) return { maps: { byCastId, castIdOf }, error: error.message };

  for (const r of data ?? []) {
    const tid = r.therapist_id as number;
    const cid = r.external_cast_id as string | null;
    if (!cid) continue;
    const prev = castIdOf.get(tid) ?? null;
    // 旧列と食い違ったら新しい表を採る（旧列は移行前の残骸）。
    if (prev && prev !== cid) byCastId.delete(prev);
    castIdOf.set(tid, cid);
    byCastId.set(cid, tid);
  }

  return { maps: { byCastId, castIdOf } };
}

/**
 * castId を覚える。★ 新しい表に必ず書き、駅ちかの枠1のときは旧列にも書く（併存）。
 *
 * ★ 呼び出し側で「その castId を既に別の子が持っていないか」を必ず先に見ること。
 *   取り違えを固定しないための見張りは、これまでどおり照合側の責任にしてある（第36便）。
 */
export async function rememberCastId(
  supabase: SupabaseClient,
  input: { therapistId: number; provider: string; slot: number; castId: string },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('therapist_media_ids')
    .upsert(
      {
        therapist_id: input.therapistId,
        provider: input.provider,
        slot: input.slot,
        external_cast_id: input.castId,
        updated_at: now,
      },
      { onConflict: 'therapist_id,provider,slot' },
    );
  if (error) return { ok: false, error: error.message };

  if (isLegacyCastIdScope(input.provider, input.slot)) {
    // ★ 失敗しても新しい表には入っているので、照合は動く。旧列は移行期間の写しにすぎない。
    await supabase.from('therapists').update({ import_cast_id: input.castId }).eq('id', input.therapistId);
  }
  return { ok: true };
}
