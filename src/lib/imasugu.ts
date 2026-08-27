// 「今すぐ」判定の共通ヘルパー（公開側で一元利用）。
//
// ★★★ 3枠の和集合（第40便で2枠→3枠）
//   is_available_now        / available_until          … オーナーが押した枠
//   is_available_now_cast   / available_until_cast     … キャスト本人が押した枠
//   is_available_now_import / available_until_import   … 駅ちかの「即ヒメ」から取り込んだ枠（第39便）
//   どれか1つでも「フラグON かつ 期限が未来」なら今すぐ中。
//   ★ 3枠は【和集合】であって排他ではない。両方立っていても矛盾しない（第39便 §5）。
//
// ★★★ 引数の型を【必須】にしてある理由（第40便 §3-2）
//   以前は全フィールドが `?` 付きだった。そのため枠を増やしたときに、
//   渡し忘れた呼び出し側で何のエラーも出ず、undefined が入って false になり、
//   「駅ちかで即ヒメなのにフクエスに出ない」が★静かに成立していた。
//   → ImasuguRow / ImasuguCamel を必須フィールドの型として公開し、
//     枠が増えたら【呼び出し側が全部コンパイルエラーになる】ようにした。
//   ★ この `?` を戻さないこと。戻すと見張りが消える。
//
//   ただし .select('…') は文字列なので、DB から列を引き忘れる事故は型では止まらない。
//   そちらは src/lib/therapistColumns.ts の定数と tools-test-imasugu-columns.mjs で見張っている。
//
// 「今」の評価はマウント時の現在時刻で行う（ISRキャッシュへの焼き付き回避）。
// 呼び出し側がマウント時／state の現在時刻を now に渡せるよう、now を引数化している（既定は new Date()）。
//
// データ形が混在するため3層に分ける：
//  - isImasuguLiveValues : 6値（owner/cast/import の on・until）を受ける中核純粋関数。
//  - isImasuguLiveRow    : DB の snake_case 生行を受けるラッパ。
//  - isImasuguLiveCamel  : camelCase にマップ済みオブジェクトを受けるラッパ。

/** DB の snake_case 生行（3枠6列）。★ すべて必須。枠を増やしたら呼び出し側が落ちる。 */
export type ImasuguRow = {
  is_available_now: boolean | null;
  available_until: string | null;
  is_available_now_cast: boolean | null;
  available_until_cast: string | null;
  is_available_now_import: boolean | null;
  available_until_import: string | null;
};

/** camelCase にマップ済み（3枠6値）。★ すべて必須。 */
export type ImasuguCamel = {
  isAvailableNow: boolean | null;
  availableUntil: string | null;
  isAvailableNowCast: boolean | null;
  availableUntilCast: string | null;
  isAvailableNowImport: boolean | null;
  availableUntilImport: string | null;
};

function liveOne(on: unknown, until: string | null | undefined, now: Date): boolean {
  return on === true && until != null && new Date(until).getTime() > now.getTime();
}

// ── 枠単体の判定 ──────────────────────────────────────────────
// ★ こちらは意図的に optional のままにしてある。
//   「枠を1つだけ見る」用途（排他制御・読み取り専用表示）なので、
//   枠が増えても呼び出し側が直す必要が無い＝書き忘れの事故が起きない。

/** 枠単体のライブ判定（排他制御で「片方の枠がライブか」を見るのに使う）。 */
export function isFrameLive(on: unknown, until: string | null | undefined, now: Date = new Date()): boolean {
  return liveOne(on, until, now);
}

/** snake_case 生行のオーナー枠ライブ判定。 */
export function isOwnerLiveRow(
  t: { is_available_now?: boolean | null; available_until?: string | null },
  now: Date = new Date(),
): boolean {
  return liveOne(t.is_available_now, t.available_until, now);
}

/** snake_case 生行のキャスト枠ライブ判定。 */
export function isCastLiveRow(
  t: { is_available_now_cast?: boolean | null; available_until_cast?: string | null },
  now: Date = new Date(),
): boolean {
  return liveOne(t.is_available_now_cast, t.available_until_cast, now);
}

/**
 * snake_case 生行の取り込み枠（駅ちかの即ヒメ）ライブ判定。
 * ★ 用途は【読み取り専用の表示】だけ。/mypage で店舗に「これは駅ちか由来です」と見せるために使う。
 * ★ 店舗の3名制限に数えないこと。数えると店舗が自分の枠を押せなくなる（第40便の決定）。
 * ★ キャストの排他制御にも混ぜないこと。3枠は和集合であって排他ではない。
 */
export function isImportLiveRow(
  t: { is_available_now_import?: boolean | null; available_until_import?: string | null },
  now: Date = new Date(),
): boolean {
  return liveOne(t.is_available_now_import, t.available_until_import, now);
}

// ── 3枠の和集合 ──────────────────────────────────────────────

/** 中核：オーナー枠 OR キャスト枠 OR 取り込み枠。 */
export function isImasuguLiveValues(
  ownerOn: unknown,
  ownerUntil: string | null | undefined,
  castOn: unknown,
  castUntil: string | null | undefined,
  importOn: unknown,
  importUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return liveOne(ownerOn, ownerUntil, now) || liveOne(castOn, castUntil, now) || liveOne(importOn, importUntil, now);
}

/** DB の snake_case 生行。★ ImasuguRow は必須フィールド。 */
export function isImasuguLiveRow(t: ImasuguRow, now: Date = new Date()): boolean {
  return isImasuguLiveValues(
    t.is_available_now, t.available_until,
    t.is_available_now_cast, t.available_until_cast,
    t.is_available_now_import, t.available_until_import,
    now,
  );
}

/** camelCase マップ済み。★ ImasuguCamel は必須フィールド。 */
export function isImasuguLiveCamel(t: ImasuguCamel, now: Date = new Date()): boolean {
  return isImasuguLiveValues(
    t.isAvailableNow, t.availableUntil,
    t.isAvailableNowCast, t.availableUntilCast,
    t.isAvailableNowImport, t.availableUntilImport,
    now,
  );
}

// ── 有効期限（ソート用）─────────────────────────────────────────
// 「今すぐ」の並び順（残り時間が少ない順＝有効期限の昇順）に使う。
// その人がライブな枠の期限（ミリ秒）を返す。複数の枠がライブなら早い方（Math.min）、
// 非ライブは +Infinity（末尾扱い）。a - b の昇順比較に使える。
//
// ★ 取り込み枠の期限（available_until_import）は「寿命」ではなく「保険」（第39便 §5）。
//   実際に消えるのは次の取り込みの周なので、この期限で並べると
//   駅ちか由来の子が実態より短く見えることがある。★ 並び順の話なので実害は無い。

/** 中核：6値からライブ枠の期限（ミリ秒）を返す。非ライブは +Infinity。 */
export function imasuguUntilValues(
  ownerOn: unknown,
  ownerUntil: string | null | undefined,
  castOn: unknown,
  castUntil: string | null | undefined,
  importOn: unknown,
  importUntil: string | null | undefined,
  now: Date = new Date(),
): number {
  const candidates: number[] = [];
  if (liveOne(ownerOn, ownerUntil, now)) candidates.push(new Date(ownerUntil as string).getTime());
  if (liveOne(castOn, castUntil, now)) candidates.push(new Date(castUntil as string).getTime());
  if (liveOne(importOn, importUntil, now)) candidates.push(new Date(importUntil as string).getTime());
  return candidates.length > 0 ? Math.min(...candidates) : Number.POSITIVE_INFINITY;
}

/** snake_case 生行版。 */
export function imasuguUntilRow(t: ImasuguRow, now: Date = new Date()): number {
  return imasuguUntilValues(
    t.is_available_now, t.available_until,
    t.is_available_now_cast, t.available_until_cast,
    t.is_available_now_import, t.available_until_import,
    now,
  );
}

/** camelCase マップ済み版。 */
export function imasuguUntilCamel(t: ImasuguCamel, now: Date = new Date()): number {
  return imasuguUntilValues(
    t.isAvailableNow, t.availableUntil,
    t.isAvailableNowCast, t.availableUntilCast,
    t.isAvailableNowImport, t.availableUntilImport,
    now,
  );
}
