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

// ───────────── ★★★ 駅ちかの写真が変わったら取り込み直す（第1101便・2026-10-02・カッキーさん）─────────────
//
// ★★ きっかけ: お店が駅ちかに「No photo」の画像を写真として登録 → それを本人の写真として取り込んだ（Amateras ゆゆさん）。
//   その後お店が本物の写真に差し替えても、「0枚の人だけ取り込む」決まりなので、フクエスは No photo のままだった。
// ★★ カッキーさんの決定（2026-10-02）
//   ・フクエスの写真が【すべて駅ちかから取り込んだもの】の人は、駅ちか側の写真が変わったら取り込み直す。
//   ・駅ちか側で写真が0枚になったら、フクエスの写真も消す（既定画像に切り替わる）。
//   ・店舗様・本人がフクエスで入れた写真が1枚でもある人は、今までどおり触らない。
//   ・コネックエフに切り替えた店（フクエス側が正本）は対象外（★ 呼ぶ側＝フクエスリンクの毎日の周だけが使う）。
// ★★ 見分け方（★ DB に列を足さない）
//   フクエスに保存した名前: <therapistId>-ekichika<枠>-<取り込んだ時刻ms>.jpg（importEkichikaCastPhotos が付ける）
//   駅ちかの名前:           img<枠>_<お店が登録した時刻 YYYYMMDDHHMMSS>.jpg
//   → 「取り込んだあとに、駅ちか側で登録し直された」かを、この2つの時刻で比べる。
//   ★ 駅ちかの時刻は UTC として読む（★ 日本時間だった場合は9時間遅く読むことになる＝「変わった」側に倒れる）。
//     ★ 読み違えても、余分に1回取り込み直すだけ（取り込めば時刻が新しくなって止まる）。逆に読むと、変わったのに気づけない。
//   ★ 時刻を読めない名前の枠は「変わっていない」とみなす（分からないときは触らない）。

/** フクエスに保存した「駅ちかから取り込んだ写真」の URL を読む。★ それ以外（店舗様が入れた写真）は null */
export function parseImportedPhotoUrl(url: unknown): { therapistId: number; n: number; stampMs: number } | null {
  if (typeof url !== 'string') return null;
  const m = url.split('?')[0].match(/\/(\d{1,12})-ekichika([1-8])-(\d{10,16})\.(?:jpe?g|png)$/i);
  if (!m) return null;
  return { therapistId: Number(m[1]), n: Number(m[2]), stampMs: Number(m[3]) };
}

/** 駅ちかの画像名（img1_20260809230630.jpg）の時刻を ms にする。★ 14桁のときだけ読む。読めなければ null */
export function ekichikaPhotoTimeMs(name: string): number | null {
  const m = String(name ?? '').match(/^img[1-8]_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\./i);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y < 2015 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

export type CastPhotoFollow =
  /** 何もしない */
  | { action: 'none'; reason: 'own_photos' | 'unchanged' | 'no_photos' }
  /** フクエスに写真が無い → 取り込む（第427便・第777便と同じ） */
  | { action: 'import' }
  /** 駅ちか側が変わった → 取り込み直す */
  | { action: 'refresh'; reason: 'replaced' | 'added' | 'removed' }
  /** 駅ちか側が0枚になった → フクエスの写真も消す */
  | { action: 'clear' };

/**
 * ★★★ この人の写真をどうするか（純粋関数・通信も DB も触らない）。
 * @param photos 駅ちかの個人ページから抜いた、いまの写真（extractCastPhotos）
 */
export function planCastPhotoFollow(
  current: { profileImages: unknown; profileImageUrl: unknown },
  photos: CastPhoto[],
  therapistId: number,
): CastPhotoFollow {
  if (shouldImportCastPhotos(current)) return photos.length > 0 ? { action: 'import' } : { action: 'none', reason: 'no_photos' };

  const arr = Array.isArray(current.profileImages) ? current.profileImages.filter((x) => typeof x === 'string' && x !== '') : [];
  const urls: unknown[] = arr.length > 0 ? arr : [current.profileImageUrl];
  const stored = new Map<number, number>();
  for (const u of urls) {
    const p = parseImportedPhotoUrl(u);
    // ★★ 1枚でも「駅ちかから取り込んだ写真」でなければ、店舗様の写真がある人＝触らない
    if (!p || p.therapistId !== therapistId) return { action: 'none', reason: 'own_photos' };
    stored.set(p.n, Math.max(stored.get(p.n) ?? 0, p.stampMs));
  }

  if (photos.length === 0) return { action: 'clear' };

  const remote = new Map<number, number | null>();
  for (const ph of photos) remote.set(ph.n, ekichikaPhotoTimeMs(ph.name));
  const lastImport = Math.max(...stored.values());

  // 駅ちか側で消えた枠がある
  for (const n of stored.keys()) if (!remote.has(n)) return { action: 'refresh', reason: 'removed' };
  for (const [n, t] of remote) {
    if (t === null) continue;                       // ★ 時刻を読めない枠は「変わっていない」
    const mine = stored.get(n);
    // 同じ枠の写真が、取り込んだあとに登録し直された
    if (mine !== undefined && t > mine) return { action: 'refresh', reason: 'replaced' };
    // ★★ フクエスに無い枠は、【最後の取り込みよりあとに】駅ちかへ登録されたものだけ「増えた」とみなす。
    //   ★ 古い写真が無いのは、店舗様がフクエスで消した（または取り込みで取れなかった）ということ。★ 毎日入れ直さない。
    if (mine === undefined && t > lastImport) return { action: 'refresh', reason: 'added' };
  }
  return { action: 'none', reason: 'unchanged' };
}

/**
 * ★★ 1回の取り込み（10人ずつ）の中で、写真を消してよいか（安全弁）。
 *   ★ 駅ちかのページの作りが変わって写真を1枚も抜けなくなると、全員が「0枚になった」に見える。
 *     そのまま消すと、取り込んだ写真を全店で失う。→ 「消す」が2人以上で、かつ取り込んだ写真を持つ人の半分を超えたら、その回は誰も消さない。
 */
export function allowCastPhotoClear(counts: { imported: number; clears: number }): boolean {
  if (counts.clears <= 1) return true;
  return counts.clears * 2 <= counts.imported;
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
