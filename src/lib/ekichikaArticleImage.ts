// 駅ちかの「新着情報」に独自の画像を付ける（第161便・2026-09-05・純粋関数）。
//
// ★★★ 実物の形（2026-09-05 17:24〜17:31・ラビリンス様の画面で実測）
//   ⓪ GET  /admin/articles/category{n}/        ★ fuel_csrf_token・shopid を拾う
//   ① POST /ajax/admin/article_image.json  multipart（shopid / upfile / fuel_csrf_token）
//        → { src, img_b, img_s:"", err }        ★ img_b ＝ アップした時刻 YYYYMMDDHHMMSS
//   ② POST /ajax/admin/article_crop.json   edt_type=2（x/y/w/h + sh_w/sh_h + image_b + img_b）
//        → { src, src_b, img_b, img_s, err }    ★ img_s ＝ 切り抜いた時刻
//   ③ 記事の保存に img_flg=0 / g_image1=img_b / g_image1s=img_s を入れる（第154便で実測済み）
//
// ★★★ **fuel_csrf_token が要る。**
//   ★ 記事の保存（8項目）には入っていないのに、①②には入っている（実測）。
//   ★★ 第145便で「フォームに無いから要らないはず」と推して外した。★ 今回は実物を見て確かめた。
//   ★ なお第154便のメモに「フォームにも無い」と書いたのは**誤り**。★ input は存在する（2026-09-05 訂正）。
//
// ★★ 写真の道（ekichikaPhoto.ts・第105〜107便）と【同じ仕組み】だった。
//   ★ edt_type=2 は写真のほうで「正方形に切る」と分かっている値。
//   ★ 写真の②では sh_w/sh_h に**実寸**を入れれば x/y/w/h も実寸で送れる（比が1）。
//   ★★★ 記事でも同じとみているが、**記事で確かめてはいない**。★ 実弾の1枚目で目で見て確かめる。
//
// ★ このファイルは通信も DB も触らない。★ どの画像を・どこで切るかは呼び出し側が渡す。

import type { RelayMultipart } from './relayMultipart';

export const EKICHIKA_ARTICLE_IMAGE_URL = 'https://ranking-deli.jp/ajax/admin/article_image.json';
export const EKICHIKA_ARTICLE_CROP_URL = 'https://ranking-deli.jp/ajax/admin/article_crop.json';

/** 相手の画面の注記：「画像の容量は10MB以下にしてください。」★ 送る前に弾く */
export const ARTICLE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** ★ 切り抜きの種別。★ 実測値は 2（写真のほうで「正方形に切る」と分かっている値と同じ） */
export const ARTICLE_CROP_EDT_TYPE = '2';

export type Rect = { x: number; y: number; w: number; h: number };

// ────────────────────────── ⓪ ページから拾う ──────────────────────────

export type ArticleImageIds = {
  /** 128文字の16進（実測）。★ 空なら読めていない */
  csrfToken: string;
  /** 駅ちか側の店舗番号（実測 37168）。★ 空なら読めていない */
  shopId: string;
  /** ★ 読めなかった理由。★ 空でなければ組み立てない */
  problems: string[];
};

function attrOf(tag: string, name: string): string | null {
  const m = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag);
  return m ? m[1] : null;
}

/**
 * 記事の編集ページから fuel_csrf_token と shopid を拾う。
 *
 * ★★★ どちらも「普通の input」だった（2026-09-05 実測）。
 *   ★ meta にも script の中にも無い。★ だからページを読めばそのまま取れる。
 *
 * ★★ 実測ではページに csrf が2つ・shopid が3つあり、**どれも同じ値**だった。
 *   ★★★ しかし「同じはず」で進めない。★ **違っていたら読めなかったことにする。**
 *     ★ 違う値が混ざるのは、こちらの読み方か相手の作りが変わったとき。★ そこで送らない。
 */
export function parseArticleImageIds(html: unknown): ArticleImageIds {
  const s = typeof html === 'string' ? html : '';
  const problems: string[] = [];

  const pick = (name: string): { value: string; count: number; same: boolean } => {
    const found: string[] = [];
    for (const tag of s.match(/<input\b[^>]*>/gi) ?? []) {
      if ((attrOf(tag, 'name') ?? '') !== name) continue;
      found.push(attrOf(tag, 'value') ?? '');
    }
    const uniq = new Set(found);
    return { value: found[0] ?? '', count: found.length, same: uniq.size <= 1 };
  };

  const csrf = pick('fuel_csrf_token');
  const shop = pick('shopid');

  if (csrf.count === 0) problems.push('fuel_csrf_token が取れていない');
  else if (!csrf.same) problems.push('fuel_csrf_token の値がページの中で食い違っている');
  else if (!/^[0-9a-f]{32,256}$/i.test(csrf.value)) problems.push('fuel_csrf_token の形が違う');

  if (shop.count === 0) problems.push('shopid が取れていない');
  else if (!shop.same) problems.push('shopid の値がページの中で食い違っている');
  else if (!/^\d{1,12}$/.test(shop.value)) problems.push('shopid の形が違う');

  return {
    csrfToken: problems.length === 0 ? csrf.value : '',
    shopId: problems.length === 0 ? shop.value : '',
    problems,
  };
}

// ────────────────────────── 送る前の検査 ──────────────────────────

export type ImageCheck = { ok: boolean; message: string };

/** 画像の検査。★ 相手が「10MB以下」と書いていることを、送る前に弾く */
export function checkArticleImage(input: { bytes: number; contentType: string }): ImageCheck {
  const bytes = Number(input?.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, message: '画像の大きさが分かりません' };
  if (bytes > ARTICLE_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: '画像が大きすぎます（10MBまでのところ、およそ' + Math.ceil(bytes / (1024 * 1024)) + 'MBあります）',
    };
  }
  const t = String(input?.contentType ?? '').toLowerCase();
  // ★ 相手の受け口に合わせる。★ 種類を増やさない（第106便の RELAY_FILE_ALLOWED_TYPES と同じ組）
  if (t !== 'image/jpeg' && t !== 'image/png') {
    return { ok: false, message: '画像は JPEG か PNG にしてください' };
  }
  return { ok: true, message: '' };
}

// ────────────────────────── ① 上げる ──────────────────────────

/**
 * ①の multipart を組み立てる。★ 実際に取りに行って投げるのは VPS（第106便・案B）。
 * ★ 画像そのものはここを通さない。★ 場所（fukues.com の口）だけ載せる。
 */
export function buildArticleImageUpload(
  ids: ArticleImageIds,
  file: { url: string; filename: string; contentType: string },
): RelayMultipart {
  assertIds(ids);
  return {
    // ★ 並びは実測のブラウザと同じ（shopid → upfile → fuel_csrf_token）
    fields: { shopid: ids.shopId, fuel_csrf_token: ids.csrfToken },
    files: [{ field: 'upfile', url: file.url, filename: file.filename, contentType: file.contentType }],
  };
}

// ────────────────────────── ② 切る ──────────────────────────

/**
 * ②の項目を組み立てる（application/x-www-form-urlencoded）。
 *
 * ★★★ 座標の物差し（★ ここを間違えると顔が切れる）
 *   ★ 実測では sh_w=375 / sh_h=500（画面上の表示サイズ）で、x/y/w/h はその空間の値だった。
 *   ★★ 写真の②（第107便）では **sh_w/sh_h に実寸を入れれば x/y/w/h も実寸で送れる**（比が1）。
 *   ★★★ 記事でも同じとみているが、**記事で確かめてはいない**。
 *     ★ だから呼び出し側に sh を必ず渡させる。★ ここで決め打ちしない。
 *
 * ★ 相手の注記：「切り抜き前後の顔サイズが同じになるよう編集して下さい」
 *   → ★ こちらは元画像を先に整えてから上げ、切り抜きは素直な範囲にする。
 */
export function buildArticleImageCropFields(
  ids: ArticleImageIds,
  uploaded: { imgB: string; srcUrl: string },
  rect: Rect,
  sh: { w: number; h: number },
): Array<readonly [string, string]> {
  assertIds(ids);
  if (!/^\d{8,20}$/.test(String(uploaded?.imgB ?? ''))) throw new Error('上げた画像の識別子（img_b）の形が不正');
  if (!/^https:\/\//.test(String(uploaded?.srcUrl ?? ''))) throw new Error('上げた画像の場所（src）が不正');
  const nums = [rect?.x, rect?.y, rect?.w, rect?.h, sh?.w, sh?.h];
  if (nums.some((n) => !Number.isFinite(Number(n)) || Number(n) < 0)) throw new Error('切り抜きの数値が不正');
  if (Number(rect.w) <= 0 || Number(rect.h) <= 0) throw new Error('切り抜きの幅と高さは0より大きいこと');
  // ★★ はみ出しは相手に断られる前にこちらで止める
  if (Number(rect.x) + Number(rect.w) > Number(sh.w) || Number(rect.y) + Number(rect.h) > Number(sh.h)) {
    throw new Error('切り抜きが画像の外にはみ出している');
  }

  const n = (v: number) => String(Math.round(Number(v)));
  // ★ 並びは実測のブラウザと同じ
  return [
    ['x', n(rect.x)], ['y', n(rect.y)], ['w', n(rect.w)], ['h', n(rect.h)],
    ['image_b', uploaded.srcUrl],
    ['shopid', ids.shopId],
    ['img_b', uploaded.imgB],
    ['edt_type', ARTICLE_CROP_EDT_TYPE],
    ['fuel_csrf_token', ids.csrfToken],
    ['sh_w', n(sh.w)], ['sh_h', n(sh.h)],
  ];
}

export function encodeFields(fields: ReadonlyArray<readonly [string, string]>): string {
  return fields.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

// ────────────────────────── ①② の応答 ──────────────────────────

export type ArticleImageJson = {
  /** 表示用のURL（★ 空のこともある） */
  src: string;
  /** 大きいほうの識別子。★ 記事の g_image1 に入れる */
  imgB: string;
  /** 小さいほう（切り抜き後）の識別子。★ 記事の g_image1s に入れる。★ ①の時点では空 */
  imgS: string;
  /** 相手が返したエラー文（★ 空なら問題なし） */
  err: string;
  /** ★ こちらが読めなかった理由。★ 相手の err とは分ける */
  problems: string[];
};

/**
 * ①②の応答（JSON）を読む。
 * ★★ 「読めなかった」と「相手が断った」を混ぜない。
 *   ★ problems … こちらが読めなかった  ／  err … 相手が断った
 */
export function parseArticleImageJson(body: unknown): ArticleImageJson {
  const problems: string[] = [];
  const s = typeof body === 'string' ? body : '';
  let obj: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(s) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) obj = v as Record<string, unknown>;
  } catch {
    // ★ 握らない。下で problems に出す
  }
  if (obj === null) {
    problems.push('応答が JSON ではない');
    return { src: '', imgB: '', imgS: '', err: '', problems };
  }
  const str = (k: string): string => (typeof obj![k] === 'string' ? (obj![k] as string) : '');
  const src = str('src');
  const imgB = str('img_b');
  const imgS = str('img_s');
  const err = str('err');

  // ★ 相手が断っていれば、それが理由。★ こちらの読み取りの問題ではない
  if (!err) {
    if (!imgB) problems.push('画像の識別子（img_b）が返っていない');
    if (!src) problems.push('画像の場所（src）が返っていない');
  }
  return { src, imgB, imgS, err, problems };
}

function assertIds(ids: ArticleImageIds): void {
  if (!ids || ids.problems.length > 0) {
    throw new Error('編集ページから読めていないので組み立てない: ' + (ids?.problems ?? []).join(' / '));
  }
  if (!/^\d{1,12}$/.test(ids.shopId)) throw new Error('shopid の形が不正');
  if (!ids.csrfToken) throw new Error('fuel_csrf_token が空');
}
