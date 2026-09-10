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

/**
 * ★★★★★ castId の結びつきを【消す】（第239便・2026-09-10）。★ `rememberCastId` の裏返し。
 *
 * ★★★ なぜ要るか（★ 2026-09-10 未明に実際に詰まった）
 *   駅ちかから人を消しても `therapist_media_ids` の行が残っていた。
 *   ★ そのせいで同じ方をもう一度送ろうとすると **409 で止まり続ける**（口の二重掲載の止め）。
 *   ★★ 逆に、駅ちかが **その castId を別人に再利用した**ら、
 *     フクエスは「この番号はこの人」と思い込んだまま **別人に書き込む**。★ こちらのほうが怖い。
 *   → **相手から居なくなったら、結びつきも外す。**
 *
 * ★★ 呼ぶ条件（★ ここを緩めない）
 *   **一覧を読み直して「その castId がもう居ない」と確かめたときだけ**呼ぶこと。
 *   ★ 書き込みの応答で判定しない（第46便 §35）。★ 消し損ねより、消しすぎのほうが害が大きい。
 *
 * ★ エステ魂の「非表示」では**呼ばない**。★ 非表示は消滅ではなく、番号は生きている。
 *
 * @returns removed … 実際に外れた行数（0＝もともと結びついていなかった。★ これは失敗ではない）
 */
export async function forgetCastId(
  supabase: SupabaseClient,
  input: { provider: string; slot: number; castId: string },
): Promise<{ ok: boolean; removed: number; therapistId: number | null; error?: string }> {
  const castId = String(input.castId ?? '').trim();
  if (!castId) return { ok: false, removed: 0, therapistId: null, error: 'castId が空のまま結びつきを外さない' };

  // ★ 誰の行だったかを先に控える。★ 記録に「誰の結びつきを外したか」を残すため
  const { data: found, error: readErr } = await supabase
    .from('therapist_media_ids')
    .select('therapist_id')
    .eq('provider', input.provider)
    .eq('slot', input.slot)
    .eq('external_cast_id', castId)
    .maybeSingle();
  if (readErr) return { ok: false, removed: 0, therapistId: null, error: readErr.message };
  const therapistId = found ? Number((found as { therapist_id?: number }).therapist_id) : null;

  const { error } = await supabase
    .from('therapist_media_ids')
    .delete()
    .eq('provider', input.provider)
    .eq('slot', input.slot)
    .eq('external_cast_id', castId);
  if (error) return { ok: false, removed: 0, therapistId, error: error.message };

  // ★★ 旧列も対称に消す（`rememberCastId` が書いているので、こちらも消す）。
  //   ★★★ **値が一致するときだけ**（`.eq('import_cast_id', castId)`）。
  //     ★ 別の番号が入っていたら触らない。★ 消しすぎない。
  if (isLegacyCastIdScope(input.provider, input.slot) && therapistId) {
    await supabase
      .from('therapists')
      .update({ import_cast_id: null })
      .eq('id', therapistId)
      .eq('import_cast_id', castId);
  }

  return { ok: true, removed: therapistId === null ? 0 : 1, therapistId };
}
