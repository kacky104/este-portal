// 「今すぐ」判定の共通ヘルパー（公開側で一元利用）。
// オーナー枠（is_available_now / available_until）とキャスト枠（is_available_now_cast / available_until_cast）の
// 和集合で判定する。どちらか一方でも「フラグON かつ 期限が未来」なら今すぐ中。
//
// 「今」の評価はマウント時の現在時刻で行う（ISRキャッシュへの焼き付き回避）。
// 呼び出し側がマウント時／state の現在時刻を now に渡せるよう、now を引数化している（既定は new Date()）。
//
// データ形が混在するため3層に分ける：
//  - isImasuguLiveValues : 4値（owner/cast の on・until）を受ける中核純粋関数。
//  - isImasuguLiveRow    : DB の snake_case 生行を受けるラッパ。
//  - isImasuguLiveCamel  : camelCase にマップ済みオブジェクトを受けるラッパ。

function liveOne(on: unknown, until: string | null | undefined, now: Date): boolean {
  return on === true && until != null && new Date(until).getTime() > now.getTime();
}

/** 中核：オーナー枠 OR キャスト枠。 */
export function isImasuguLiveValues(
  ownerOn: unknown,
  ownerUntil: string | null | undefined,
  castOn: unknown,
  castUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return liveOne(ownerOn, ownerUntil, now) || liveOne(castOn, castUntil, now);
}

/** DB の snake_case 生行（is_available_now / available_until / is_available_now_cast / available_until_cast）。 */
export function isImasuguLiveRow(
  t: {
    is_available_now?: boolean | null;
    available_until?: string | null;
    is_available_now_cast?: boolean | null;
    available_until_cast?: string | null;
  },
  now: Date = new Date(),
): boolean {
  return isImasuguLiveValues(t.is_available_now, t.available_until, t.is_available_now_cast, t.available_until_cast, now);
}

/** camelCase マップ済み（isAvailableNow / availableUntil / isAvailableNowCast / availableUntilCast）。 */
export function isImasuguLiveCamel(
  t: {
    isAvailableNow?: boolean | null;
    availableUntil?: string | null;
    isAvailableNowCast?: boolean | null;
    availableUntilCast?: string | null;
  },
  now: Date = new Date(),
): boolean {
  return isImasuguLiveValues(t.isAvailableNow, t.availableUntil, t.isAvailableNowCast, t.availableUntilCast, now);
}
