// ★★★ セラピストの写真が1枚も無いときの【既定画像】（第217便・2026-09-08・カッキーさんの指示）
//
// ★ 決め方（★ 上から順・最初に見つかったものを使う。★ 判断はこの1か所）:
//     ① 本人の写真（therapists.profile_image_url）
//     ② 店舗の既定画像（salons.therapist_placeholder_url）… 店舗様が /mypage で入れる
//     ③ 運営の既定画像（page_heroes の page_key='therapist_placeholder'）… 運営が /admin で入れる
//     ④ 何も無い（null）… 今までどおり、各画面の「画像なし」の見た目
//
// ★★ 既定画像は【DBには書かない】。★ 画面に出す直前に差し込むだけ。
//   ★ DBに書くと「写真がある子」と区別がつかなくなり、
//     ・マイページの「写真なしを下に落とす」並び（therapistOrder）
//     ・AI下書きの「写真が無い」判定
//     ・店舗様の「写真を入れていない」という自覚
//     が全部壊れる。★ だから therapists.profile_image_url は触らない。
//
// ★ このファイルは通信もDBも触らない（★ 番人 scripts/therapistplaceholder-selftest.js で守る）。

/** page_heroes の page_key。★ ヒーロー画像の RPC（admin_set_page_hero_image）の許可リストには入れない。
 *  ★ 書くのは専用の RPC（admin_set_therapist_placeholder）。読むのは select だけ。 */
export const THERAPIST_PLACEHOLDER_KEY = 'therapist_placeholder';

/** 空文字・空白だけは「無い」とみなす。 */
function clean(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * 画面に出す画像URLを決める。★ 本人 → 店舗 → 運営 → null。
 * @param photo 本人の写真（therapists.profile_image_url）
 * @param salonPlaceholder 店舗の既定画像（salons.therapist_placeholder_url）
 * @param adminPlaceholder 運営の既定画像（page_heroes 'therapist_placeholder'）
 */
export function pickTherapistImage(
  photo: string | null | undefined,
  salonPlaceholder: string | null | undefined,
  adminPlaceholder: string | null | undefined,
): string | null {
  return clean(photo) ?? clean(salonPlaceholder) ?? clean(adminPlaceholder) ?? null;
}

/** 店舗ごとの既定画像の表。★ 無い店舗は undefined（＝運営の既定へ落ちる）。 */
export type PlaceholderTable = {
  admin: string | null;
  bySalon: ReadonlyMap<number, string | null>;
};

/**
 * 表を引いて1人ぶん決める。★ salonId が分からない（null）ときは店舗の既定を飛ばして運営の既定へ。
 */
export function pickWithTable(
  photo: string | null | undefined,
  salonId: number | null | undefined,
  table: PlaceholderTable,
): string | null {
  const salonPh = salonId == null ? null : (table.bySalon.get(Number(salonId)) ?? null);
  return pickTherapistImage(photo, salonPh, table.admin);
}
