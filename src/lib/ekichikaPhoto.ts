// 駅ちかの「画像登録」へ写真を送るための読み取り・組み立て（第107便・純粋関数）。
//
// ★★★ 実物の形（2026-09-02・第105便で読んだ。設計メモ_駅ちかの画像アップロード 追記 A・B）
//   ⓪ GET  /admin/girls/edit/<girl_id>            ★ fuel_csrf_token・shopid・枠の状態を拾う
//   ① POST /admin/getgirls/upload.json  multipart  ★ 大画像を上げる → { src, to_thumb, message }
//   ② POST /admin/getgirls/crop.json    edt_type=1 ★ 大画像を 3:4 に切る（x/y/w/h + sh_w/sh_h）→ { src }
//   ③ POST /admin/getgirls/crop.json    edt_type=2 ★ サムネイルを正方形に（x/y/w/h は 300×400 の表示空間）→ { src }
//   ★ to_thumb == 1 なら②を飛ばす（★ 上げた画像が既に 3:4 のとき、と思われる。初回の実弾で確かめる）
//
// ★★★ 座標の物差し（★ ここを間違えると顔が切れる）
//   ② は sh_w/sh_h に【実寸】を入れれば、x/y/w/h も実寸で送れる（比が1）
//   ③ は 300×400 固定。★ 駅ちかが実物（600×800）に ×2 して切る
//
// ★★ このファイルは通信も DB も触らない。★ 判断（どの枠・どの範囲）は呼び出し側が渡す。

export const EKICHIKA_PHOTO_UPLOAD_URL = 'https://ranking-deli.jp/admin/getgirls/upload.json';
export const EKICHIKA_PHOTO_CROP_URL = 'https://ranking-deli.jp/admin/getgirls/crop.json';
export const EKICHIKA_PHOTO_DELETE_URL = 'https://ranking-deli.jp/admin/getgirls/delete.json';
export const EKICHIKA_GIRL_EDIT_BASE = 'https://ranking-deli.jp/admin/girls/edit/';

/** 枠は 1〜8（★ 第105便で確認。編集ページの form は image_set_id 1〜8 の8組）。 */
export const PHOTO_SLOT_MIN = 1;
export const PHOTO_SLOT_MAX = 8;

/** ③サムネイルの座標空間（★ crop_image は width=300 height=400 で固定表示・実測）。 */
export const THUMB_SPACE = { w: 300, h: 400 } as const;
/** ★ 駅ちかの既定の枠（girlsupload.js の setSelect [60,110,240,290]）。★ 中央の 180×180 */
export const THUMB_DEFAULT_RECT = { x: 60, y: 110, w: 180, h: 180 } as const;

export type Rect = { x: number; y: number; w: number; h: number };

export function ekichikaGirlEditUrl(girlId: string): string {
  if (!/^\d{1,12}$/.test(girlId)) throw new Error('girl_id の形が不正: ' + String(girlId).slice(0, 20));
  return EKICHIKA_GIRL_EDIT_BASE + girlId;
}

export function isPhotoSlot(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= PHOTO_SLOT_MIN && (n as number) <= PHOTO_SLOT_MAX;
}

// ────────────────────────── ⓪ 編集ページの読み取り ──────────────────────────

export type PhotoPage = {
  csrfToken: string;
  shopId: string;
  girlId: string;
  /** 枠ごとに「大画像が入っているか」。★ edt_type=2 の form の image が空でなければ入っている */
  slots: Array<{ slot: number; hasImage: boolean }>;
  /** ★★★ 読めたが信用できない理由。空でなければ使わせない */
  problems: string[];
};

/**
 * ★★★ 枠に【本物の写真】が入っているか（2026-09-02・レミ様の実物で確認）。
 *   ★ 駅ちかは空き枠に仮画像 `…/files.ranking-deli.jp/noimage2.jpg` を入れる。★ 空文字ではない。
 *   ★ 最初の実装は「image が空なら空き」だったので、23人全員が「8枠すべてあり」に見えた。
 *   → 空き ＝ 空文字 か noimage の仮画像。★ それ以外（知らない形も）は「あり」＝送らない側に倒す。
 */
export function slotHasPhoto(imageValue: string): boolean {
  const v = String(imageValue ?? '').trim();
  if (v === '') return false;
  if (/\/noimage[^/]*\.(jpe?g|png|gif)(\?.*)?$/i.test(v)) return false;
  return true;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag) ?? new RegExp("\\s" + name + "\\s*=\\s*'([^']*)'", 'i').exec(tag);
  return m ? m[1] : null;
}

/**
 * 編集ページを読む。★ 期待する girl_id と違うページなら problems に出す（★ 別の子を触らない）。
 */
export function parsePhotoPage(html: string, expectGirlId: string): PhotoPage {
  const problems: string[] = [];
  const forms = html.split(/<form\b/i).slice(1).map((s) => '<form' + s.split(/<\/form>/i)[0]);

  let csrfToken = '';
  let shopId = '';
  let girlId = '';
  const slotMap = new Map<number, boolean>();

  for (const f of forms) {
    const inputs = f.match(/<input\b[^>]*>/gi) ?? [];
    const kv = new Map<string, string>();
    for (const tag of inputs) {
      const n = attr(tag, 'name');
      if (n) kv.set(n, attr(tag, 'value') ?? '');
    }
    const setId = Number(kv.get('image_set_id'));
    if (!isPhotoSlot(setId)) continue;               // ★ 画像登録の form だけを見る
    if (!csrfToken && kv.get('fuel_csrf_token')) csrfToken = kv.get('fuel_csrf_token') ?? '';
    if (!shopId && kv.get('shopid')) shopId = kv.get('shopid') ?? '';
    if (!girlId && kv.get('id')) girlId = kv.get('id') ?? '';
    // ★ 既存画像の切り抜き直し form（edt_type=2）の image が、その枠の大画像の在処
    if (kv.get('edt_type') === '2') {
      slotMap.set(setId, slotHasPhoto(kv.get('image') ?? ''));
    } else if (!slotMap.has(setId)) {
      slotMap.set(setId, false);
    }
  }

  const slots = [...slotMap.entries()].sort((a, b) => a[0] - b[0]).map(([slot, hasImage]) => ({ slot, hasImage }));

  if (!csrfToken) problems.push('fuel_csrf_token が取れていない');
  if (!shopId) problems.push('shopid が取れていない');
  if (!girlId) problems.push('girl_id が取れていない');
  else if (girlId !== expectGirlId) problems.push('別の子の編集ページが返った（' + girlId + ' ≠ ' + expectGirlId + '）');
  if (slots.length === 0) problems.push('画像登録の form が1つも無い');
  else if (slots.length !== PHOTO_SLOT_MAX) problems.push('枠の数が ' + PHOTO_SLOT_MAX + ' ではない: ' + slots.length);

  return { csrfToken, shopId, girlId, slots, problems };
}

// ────────────────────────── ①②③ の応答（JSON） ──────────────────────────

export type PhotoJson = {
  src: string;
  toThumb: boolean;
  message: string;
  problems: string[];
};

/** ★ JSON でなければ problems。★ src が空なら message が理由（駅ちかの JS もそう読んでいる）。 */
export function parsePhotoJson(body: string): PhotoJson {
  const problems: string[] = [];
  let obj: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(body);
    if (v && typeof v === 'object' && !Array.isArray(v)) obj = v as Record<string, unknown>;
  } catch {
    /* 下で problems に出す */
  }
  if (!obj) {
    return { src: '', toThumb: false, message: '', problems: ['JSON として読めない（ログイン画面などが返った可能性）'] };
  }
  const src = typeof obj.src === 'string' ? obj.src : '';
  const message = typeof obj.message === 'string' ? obj.message : '';
  const toThumb = obj.to_thumb === 1 || obj.to_thumb === '1' || obj.to_thumb === true;
  if (src === '' && message === '') problems.push('src も message も空（駅ちかが理由を返していない）');
  if (src !== '' && !/^https:\/\//.test(src)) problems.push('src が https の URL ではない');
  return { src, toThumb, message, problems };
}

// ────────────────────────── 切り抜きの範囲 ──────────────────────────

/** 実寸の画像の中で、いちばん大きい中央の 3:4 の枠。★ ②の x/y/w/h（sh_w/sh_h に実寸を添える）。 */
export function centeredMainCrop(width: number, height: number): Rect {
  if (!(width > 0 && height > 0)) throw new Error('画像の寸法が不正');
  // 3:4 → w/h = 0.75
  let w = width;
  let h = Math.floor((width * 4) / 3);
  if (h > height) {
    h = height;
    w = Math.floor((height * 3) / 4);
  }
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), w, h };
}

/** ③の枠が 300×400 の空間に収まる正方形か。★ 収まらないものは送らない（駅ちかで黙って壊れる）。 */
export function isValidThumbRect(r: Rect): boolean {
  const ok = (n: number) => Number.isInteger(n) && n >= 0;
  if (!ok(r.x) || !ok(r.y) || !ok(r.w) || !ok(r.h)) return false;
  if (r.w !== r.h) return false;
  if (r.w < 1) return false;
  if (r.x + r.w > THUMB_SPACE.w) return false;
  if (r.y + r.h > THUMB_SPACE.h) return false;
  return true;
}

// ────────────────────────── ①②③ の項目 ──────────────────────────

export type PhotoIds = { girlId: string; shopId: string; slot: number; csrfToken: string };

function assertIds(ids: PhotoIds): void {
  if (!/^\d{1,12}$/.test(ids.girlId)) throw new Error('girl_id の形が不正');
  if (!/^\d{1,12}$/.test(ids.shopId)) throw new Error('shopid の形が不正');
  if (!isPhotoSlot(ids.slot)) throw new Error('枠は 1〜8: ' + String(ids.slot));
  if (!ids.csrfToken) throw new Error('fuel_csrf_token が空');
}

/** ①の文字の項目（★ upfile はファイルとして別に渡す）。★ 並びはブラウザの form と同じ。 */
export function buildUploadFields(ids: PhotoIds): Record<string, string> {
  assertIds(ids);
  return {
    image_set_id: String(ids.slot),
    id: ids.girlId,
    edt_table: 'girls',
    shopid: ids.shopId,
    fuel_csrf_token: ids.csrfToken,
  };
}

/** ②大画像の 3:4 切り抜き。★ sh_w/sh_h に実寸を入れて、x/y/w/h も実寸で送る（比が1）。 */
export function buildMainCropFields(ids: PhotoIds, imageSrc: string, rect: Rect, size: { width: number; height: number }): Array<[string, string]> {
  assertIds(ids);
  if (!/^https:\/\//.test(imageSrc)) throw new Error('image の URL が不正');
  if (rect.x < 0 || rect.y < 0 || rect.w < 1 || rect.h < 1) throw new Error('切り抜きの範囲が不正');
  if (rect.x + rect.w > size.width || rect.y + rect.h > size.height) throw new Error('切り抜きが画像の外に出ている');
  return [
    ['x', String(rect.x)], ['y', String(rect.y)], ['w', String(rect.w)], ['h', String(rect.h)],
    ['edt_type', '1'], ['id', ids.girlId], ['edt_table', 'girls'], ['image', imageSrc],
    ['image_set_id', String(ids.slot)], ['shopid', ids.shopId], ['fuel_csrf_token', ids.csrfToken],
    ['sh_w', String(size.width)], ['sh_h', String(size.height)],
  ];
}

/** ③サムネイル。★ x/y/w/h は 300×400 の表示空間。sh_w/sh_h は送らない（駅ちかの JS もそうしている）。 */
export function buildThumbCropFields(ids: PhotoIds, imageSrc: string, rect: Rect): Array<[string, string]> {
  assertIds(ids);
  if (!/^https:\/\//.test(imageSrc)) throw new Error('image の URL が不正');
  if (!isValidThumbRect(rect)) throw new Error('サムネイルの範囲が 300×400 の正方形に収まっていない');
  return [
    ['x', String(rect.x)], ['y', String(rect.y)], ['w', String(rect.w)], ['h', String(rect.h)],
    ['edt_type', '2'], ['id', ids.girlId], ['edt_table', 'girls'], ['image', imageSrc],
    ['image_set_id', String(ids.slot)], ['shopid', ids.shopId], ['fuel_csrf_token', ids.csrfToken],
  ];
}

/** 削除。★ 第107便では使わない（初回の実弾は人が画面で消す）。★ 形だけ置いておく。 */
export function buildDeleteFields(ids: PhotoIds): Array<[string, string]> {
  assertIds(ids);
  return [
    ['image_set_id', String(ids.slot)], ['shopid', ids.shopId], ['id', ids.girlId],
    ['fuel_csrf_token', ids.csrfToken], ['image_id', String(ids.slot)], ['girl_id', ids.girlId],
  ];
}
