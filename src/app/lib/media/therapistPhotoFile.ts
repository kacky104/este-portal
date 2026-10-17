import type { SupabaseClient } from '@supabase/supabase-js';
import { readImageSize } from '@/lib/imageSize';

// ── 駅ちかへ送る「1枚の写真」を用意する（第249便で1か所に寄せた）─────────────
//
// ★★★ なぜ1か所に寄せたか
//   第107便から `/api/admin/photo-push` にあった手順を、第249便で `/api/admin/media-girl-create`
//   （登録のあと枠1へ送る）でも使うことになった。★ 2か所に同じ検査を書くと、
//   片方だけ直したときに **緩いほうから通ってしまう**（禁則185「ロジックを重複させない」と同じ形）。
//
// ★★ ここがすること（★ 判断はしない・材料を作るだけ）
//   ① 送る写真の在処を決める（★ 指定が無ければ profile_image_url から）
//   ② **フクエスの therapist-photos の中だけ**を指していることを確かめる
//   ③ 実物を読んで、寸法・種類・大きさを見る（★ 駅ちかの制限に合うか）
//   ④ 送るときのファイル名を決める
//
// ★ 通信も判断もしない … 「どの枠へ送ってよいか」は呼び出し側（route）と中継が決める。

export const THERAPIST_PHOTO_BUCKET = 'therapist-photos';
/** 駅ちかの画面に書いてある上限（設計メモ §3）。 */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** 駅ちかの画面に書いてある最低推奨（設計メモ §3）。★ これより小さいと画質が荒れる */
export const PHOTO_MIN_WIDTH = 300;
export const PHOTO_MIN_HEIGHT = 400;

/**
 * ★★ エステ魂の画面の注記は 10MB。★ こちらの取り出し口（`/api/relay/file` の fit=cover・第241便）で
 *   357×556 に縮めてから渡すので、**元は大きくてよい**。★ 第243便の `esutama-photo-push` と同じ値。
 */
export const ESUTAMA_PHOTO_MAX_BYTES = 20 * 1024 * 1024;

export type TherapistPhotoFile = {
  bucket: string;
  path: string;
  filename: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
};

export type TherapistPhotoResult =
  | { ok: true; file: TherapistPhotoFile }
  | { ok: false; status: number; error: string };

/**
 * 送る1枚を用意する。
 *
 * @param svc          service client（★ Storage を読む）
 * @param therapistId  フクエスのセラピストID（★ ファイル名に使う）
 * @param imageSetId   駅ちかの画像の枠 1〜8（★ ファイル名に使う）
 * @param profileImageUrl  その方の profile_image_url（★ path を省いたときの出どころ）
 * @param path         Storage の中の場所（★ 指定があればこちらが優先）
 */
/** ★ 第1549便: お店の既定画像の置き場（/mypage で店舗様が入れる・salons.therapist_placeholder_url） */
export const PLACEHOLDER_BUCKET = 'salon-images';
/** ★ 既定画像の場所の形だけを許す（<店の番号>/therapist_placeholder_<時刻>.<拡張子>）。★ 店のほかの画像は読ませない */
export function isPlaceholderPath(p: string): boolean {
  return /^\d{1,10}\/therapist_placeholder_[A-Za-z0-9_.\-]{1,80}$/.test(p) && !p.includes('..');
}

export async function resolveTherapistPhotoFile(
  svc: SupabaseClient,
  input: { therapistId: number; imageSetId: number; profileImageUrl?: string | null; path?: string },
): Promise<TherapistPhotoResult> {
  // ── ① 在処 ──────────────────────────────────────────────
  let path = typeof input.path === 'string' ? input.path : '';
  let bucket: string = THERAPIST_PHOTO_BUCKET;
  if (!path) {
    const url = String(input.profileImageUrl ?? '');
    const i = url.indexOf('/' + THERAPIST_PHOTO_BUCKET + '/');
    // ★★ 第1549便: 写真が1枚も無い子に使う【お店の既定画像】（salon-images/<店>/therapist_placeholder_…）だけは読んでよい
    const j = url.indexOf('/' + PLACEHOLDER_BUCKET + '/');
    if (i >= 0) {
      path = url.slice(i + THERAPIST_PHOTO_BUCKET.length + 2).split('?')[0];
    } else if (j >= 0 && isPlaceholderPath(url.slice(j + PLACEHOLDER_BUCKET.length + 2).split('?')[0])) {
      bucket = PLACEHOLDER_BUCKET;
      path = url.slice(j + PLACEHOLDER_BUCKET.length + 2).split('?')[0];
    } else {
      return { ok: false, status: 400, error: 'この子のプロフィール写真が ' + THERAPIST_PHOTO_BUCKET + ' に無い（path を指定する）' };
    }
  }
  // ★★ ② フクエスの中だけを指していること。★ `..` や `//` で外へ出さない
  if (!/^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/.test(path) || path.includes('..') || path.includes('//')) {
    return { ok: false, status: 400, error: 'path の形が不正' };
  }

  // ── ③ 実物を読む ────────────────────────────────────────
  const { data: blob, error: dlErr } = await svc.storage.from(bucket).download(path);
  if (dlErr || !blob) {
    return { ok: false, status: 404, error: '写真を Storage から読めない: ' + (dlErr?.message ?? '') };
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.byteLength === 0) return { ok: false, status: 400, error: '写真が空' };
  if (buf.byteLength > PHOTO_MAX_BYTES) return { ok: false, status: 400, error: '写真が 10MB を超えている（駅ちかの上限）' };
  const size = readImageSize(buf);
  if (!size) return { ok: false, status: 400, error: 'jpg / png として寸法を読めない' };
  if (size.width < PHOTO_MIN_WIDTH || size.height < PHOTO_MIN_HEIGHT) {
    return {
      ok: false, status: 400,
      error: '駅ちかの最低推奨（横' + PHOTO_MIN_WIDTH + '×縦' + PHOTO_MIN_HEIGHT + '）より小さい: ' + size.width + '×' + size.height,
    };
  }

  // ── ④ 送るときの名前 ──────────────────────────────────
  const ext = size.type === 'image/png' ? 'png' : 'jpg';
  return {
    ok: true,
    file: {
      bucket,
      path,
      filename: 'fukues_' + input.therapistId + '_' + input.imageSetId + '.' + ext,
      contentType: size.type,
      width: size.width,
      height: size.height,
      bytes: buf.byteLength,
    },
  };
}

// ── エステ魂へ送る「1枚の写真」を用意する（第267便で1か所に寄せた）─────────────
//
// ★★★ なぜ別の関数か … 駅ちかとエステ魂で**検査が違う**。
//   駅ちか   … 寸法を読む（最低 300×400・10MB）。★ 3:4 の切り取り枠をこちらで決めるから
//   エステ魂 … 寸法は取り出し口が 357×556 に合わせる（第241便）。★ ここでは **在処と実在と大きさ**だけ
// ★★ 第243便の `esutama-photo-push` にあった検査を、そのまま移した（★ 振る舞いは同じ）。
//   ★ 登録の流れ（castCreatePlan.ts）からも同じ検査を通す。★ 2か所に書くと片方だけ緩む（第255便(2)）。

export type EsutamaPhotoFile = {
  bucket: string;
  path: string;
  bytes: number;
};

export type EsutamaPhotoResult =
  | { ok: true; file: EsutamaPhotoFile }
  | { ok: false; status: number; error: string };

/**
 * エステ魂へ送る1枚を用意する。★ 判断はしない・材料を作るだけ。
 *
 * @param svc              service client（★ Storage を読む）
 * @param profileImageUrl  その方の profile_image_url（★ path を省いたときの出どころ）
 * @param path             Storage の中の場所（★ 指定があればこちらが優先）
 */
export async function resolveEsutamaPhotoFile(
  svc: SupabaseClient,
  input: { profileImageUrl?: string | null; path?: string },
): Promise<EsutamaPhotoResult> {
  // ── ① 在処（★ フクエスの therapist-photos だけ） ──
  let path = typeof input.path === 'string' ? input.path : '';
  if (!path) {
    const url = String(input.profileImageUrl ?? '');
    const i = url.indexOf('/' + THERAPIST_PHOTO_BUCKET + '/');
    if (i < 0) {
      return { ok: false, status: 400, error: 'この方のプロフィール写真が ' + THERAPIST_PHOTO_BUCKET + ' にありません（path を指定してください）' };
    }
    path = url.slice(i + THERAPIST_PHOTO_BUCKET.length + 2).split('?')[0];
  }
  // ★★ ② フクエスの中だけを指していること。★ `..` や `//` で外へ出さない
  if (!/^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/.test(path) || path.includes('..') || path.includes('//')) {
    return { ok: false, status: 400, error: 'path の形が不正' };
  }

  // ── ③ 実在と大きさだけ確かめる（★ 中身は見ない） ──
  const { data: blob, error: dlErr } = await svc.storage.from(THERAPIST_PHOTO_BUCKET).download(path);
  if (dlErr || !blob) return { ok: false, status: 404, error: '写真を Storage から読めません: ' + (dlErr?.message ?? '') };
  const bytes = (await blob.arrayBuffer()).byteLength;
  if (bytes === 0) return { ok: false, status: 400, error: '写真が空' };
  if (bytes > ESUTAMA_PHOTO_MAX_BYTES) return { ok: false, status: 400, error: '写真が大きすぎます（20MB まで）' };

  return { ok: true, file: { bucket: THERAPIST_PHOTO_BUCKET, path, bytes } };
}
