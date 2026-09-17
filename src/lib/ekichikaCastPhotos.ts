// 駅ちかの個人ページから「その人の写真（画像の枠1〜8）」を抜く＋取り込む写真を決める（第427便・2026-09-17）。
// ★ 純粋関数だけ。通信も DB も Storage も触らない（★ 番人 check:ekichikacastphotos）。
//
// ★★ なぜ（設計メモ_最初の取り込みで駅ちかの写真も_2026-09-17.md）
//   第406便の最初の1回は写真を持ってこなかった → 「コネックエフが正本」で駅ちかの写真を消してしまう危険があった（第426便で止血）。
//   写真も持ってきて conecf_photo_pushes に「枠N ← その写真」を書けば、コネックエフが本当に正本になる。
//
// ★★ カッキーさんの決定（2026-09-17）
//   ・コネックエフの写真が【0枚の人だけ】取り込む（★ 入れた写真には触らない）
//   ・駅ちかの枠が飛び飛び（枠1・3だけ）でも【詰めて】取り込む（★ 記録は本当の枠番号 → 次の「更新する」で駅ちか側も詰まる）
//   ・すでに取り込み済みの店にも「写真だけ取り込む（1回）」の口を作る
//
// ★ 写真の在処（2026-09-17 公開の個人ページで確認・さらさん 5232208 で8枚）
//   公開: https://mensesthe-images.ranking-deli.jp/<shopid>/<girlid>/img<N>_<時刻>.jpg
//   原寸: https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/<shopid>/<girlid>/img<N>_<時刻>.jpg（管理画面と同じ名前）
//   ★ サムネは img<N>s_…（★ 数字のすぐ後が "_" のものだけ拾う）

export const CAST_PHOTO_MAX = 8;

export type CastPhoto = {
  /** 駅ちかの画像の枠（1〜8） */
  n: number;
  /** 取りに行く順（★ 原寸 → 公開） */
  urls: string[];
  /** 保存するファイル名に使う（img3_20260809230630.jpg） */
  name: string;
};

const HOSTS = '(?:mensesthe-images\\.ranking-deli\\.jp|s3-ap-northeast-1\\.amazonaws\\.com/files\\.ranking-deli\\.jp|files\\.ranking-deli\\.jp)';

/**
 * ★ 個人ページの HTML から、その人（girlId）の写真を枠ごとに1枚ずつ抜く。
 *   ★ girlId が分からないときは、ページで一番多く出てくる girlId を本人とみなす（★ おすすめ欄のほかの子を混ぜない）
 */
export function extractCastPhotos(html: string, girlId?: string | null): CastPhoto[] {
  if (!html) return [];
  const re = new RegExp('https?:\\/\\/' + HOSTS + '\\/(\\d{1,10})\\/(\\d{1,12})\\/img([1-8])_(\\d{6,20})\\.(jpe?g|png)', 'gi');
  const hits: Array<{ shop: string; girl: string; n: number; ts: string; ext: string }> = [];
  for (const m of html.matchAll(re)) {
    hits.push({ shop: m[1], girl: m[2], n: Number(m[3]), ts: m[4], ext: m[5].toLowerCase() });
  }
  if (hits.length === 0) return [];
  let who = girlId && /^\d+$/.test(girlId) ? girlId : '';
  if (!who) {
    const cnt = new Map<string, number>();
    hits.forEach((h) => cnt.set(h.girl, (cnt.get(h.girl) ?? 0) + 1));
    who = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const byN = new Map<number, CastPhoto>();
  for (const h of hits) {
    if (h.girl !== who || byN.has(h.n)) continue;
    const file = h.shop + '/' + h.girl + '/img' + h.n + '_' + h.ts + '.' + h.ext;
    byN.set(h.n, {
      n: h.n,
      urls: [
        'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/' + file,
        'https://mensesthe-images.ranking-deli.jp/' + file,
      ],
      name: 'img' + h.n + '_' + h.ts + '.' + h.ext,
    });
  }
  return [...byN.values()].sort((a, b) => a.n - b.n).slice(0, CAST_PHOTO_MAX);
}

/** ★ この人の写真を取り込んでよいか（★ コネックエフの写真が0枚の人だけ） */
export function shouldImportCastPhotos(current: { profileImages: unknown; profileImageUrl: unknown }): boolean {
  const arr = Array.isArray(current.profileImages) ? current.profileImages.filter((x) => typeof x === 'string' && x !== '') : [];
  if (arr.length > 0) return false;
  return !(typeof current.profileImageUrl === 'string' && current.profileImageUrl !== '');
}

/**
 * ★ 保存できた写真を、コネックエフの並び（詰める）と送った記録（本当の枠番号）にする。
 *   ★ 例: 枠1・3が取れた → profile_images=[枠1, 枠3]／記録 = 枠1←枠1の写真・枠3←枠3の写真
 *     → 次の「更新する」で、枠2へ枠3の写真を入れ、枠3を消す（★ 駅ちか側も詰まる）
 */
export function planCastPhotoSave(saved: Array<{ n: number; url: string }>): {
  profileImages: string[]; profileImageUrl: string | null; records: Array<{ imageSlot: number; sourceUrl: string }>;
} {
  const list = [...saved].filter((x) => x.n >= 1 && x.n <= CAST_PHOTO_MAX && x.url).sort((a, b) => a.n - b.n);
  return {
    profileImages: list.map((x) => x.url),
    profileImageUrl: list[0]?.url ?? null,
    records: list.map((x) => ({ imageSlot: x.n, sourceUrl: x.url })),
  };
}
