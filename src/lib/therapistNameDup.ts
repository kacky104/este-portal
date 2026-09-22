// 同じ店のかな違い同名（第676便・2026-09-22）の文言。★ 純関数だけ。
// ★ DB の一意の索引 therapists_salon_name_key_uniq（supabase/migrations/20260922_therapist_name_key_unique.sql）が
//   「全角/半角・カタカナ/ひらがな・空白」の違いだけの同名を断る。★ ベンリー等の外からの書き込みも同じく止まる。

export const THERAPIST_NAME_KEY_INDEX = 'therapists_salon_name_key_uniq';

/** かな違い同名で断られたなら、画面に出す文を返す。★ それ以外のエラーは null */
export function therapistNameDupMessage(
  err: { code?: string | null; message?: string | null } | null | undefined,
): string | null {
  if (!err) return null;
  if (err.code !== '23505' || !(err.message ?? '').includes(THERAPIST_NAME_KEY_INDEX)) return null;
  return '同じ名前の女性がすでにいます（ひらがな・カタカナ・全角/半角の違いも同じ名前とみなします）。非公開の女性も含みます。';
}
