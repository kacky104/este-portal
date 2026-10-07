// エステ魂の写メ日記に付ける写真の決まり（第1284便・2026-10-07）。★ 純粋関数（通信も DB も画像の加工も持たない）。
//
// ★★★ なぜ要るか
//   エステ魂への写メ日記は、第129便（9/4）から【文章だけ】を送っていた。写真を入れる項目の形が未確認だったため。
//   「写真は送っていない」は設計メモの「残っていること」に書いたきり、画面にも引き継ぎにも出ないまま
//   コネックエフで店舗様に開放された。10/7、ラビリンス様のなぎささんの日記が、駅ちかには写真つき・
//   エステ魂には写真なしで載り、カッキーさんが気づいた。
//
// ★★★ 実物で確かめた形（2026-10-07・カッキーさんの Chrome・代理ログイン中の投稿ページと main.min.js を読んだだけ・投稿はしていない）
//   ・フォームは 9/4 から変わっていた。photo_data はもう無い。いまは:
//       photos[1][data] / photos[1][album_id] 〜 photos[3][data] / photos[3][album_id]   ★ 1つの日記に3枚まで
//   ・端末から選んだ写真は、画面の切り抜き（Cropper）を通って
//       getCroppedCanvas({ width: 714, height: 1112, fillColor: '#fff' }).toDataURL('image/jpeg', 0.8)
//     の結果（"data:image/jpeg;base64,…"）が photos[N][data] に入る。album_id は空。
//   ・album_id は「アルバムから選ぶ」ときだけ入る（すでに上げてある写真の番号）。こちらでは使わない。
//   ・画面の決まり: 16MB 以内の JPEG・PNG。
//   ・フォームの enctype は指定なし（＝ application/x-www-form-urlencoded のまま）。
//
// ★ 載ったあとの見え方は、まだ実物で確かめていない（最初の1通で見る）。

/** 切り抜いたあとの大きさ（実物の main.min.js の Ln・Sn）。★ 縦長 */
export const ESUTAMA_DIARY_PHOTO_W = 714;
export const ESUTAMA_DIARY_PHOTO_H = 1112;
/** 1つの日記に入る枚数（実物のフォームの枠の数） */
export const ESUTAMA_DIARY_PHOTO_MAX = 3;
/** JPEG の品質。★ 実物は 0.8。大きすぎるときだけ、この順に下げる */
export const ESUTAMA_DIARY_PHOTO_QUALITIES: readonly number[] = [80, 70, 60, 50];
/**
 * 1枚の JPEG の上限（バイト）。
 *   ★ 中継に積める本文は 1,000,000 バイトまで（relayJob の MAX_REQUEST_BODY_BYTES）。
 *     base64 で 4/3 倍、さらに URL エンコードで + / = が3文字になる（約 +6%）。
 *     200,000 バイト × 3枚 ≒ 85万バイト ＋ 題名と本文 → 上限に収まる。
 */
export const ESUTAMA_DIARY_PHOTO_MAX_BYTES = 200_000;
/** 写真つきの本文の上限（バイト）。★ 中継の上限より少し手前で止める */
export const ESUTAMA_DIARY_POST_MAX_BYTES = 950_000;
/** 取ってくる元の写真の上限（バイト）。★ エステ魂の画面の決まりと同じ 16MB */
export const ESUTAMA_DIARY_SOURCE_MAX_BYTES = 16 * 1024 * 1024;
/** photos[N][data] の頭。★ 実物の JS はこれで始まらないものを「変換に失敗」として捨てる */
export const ESUTAMA_DIARY_PHOTO_PREFIX = 'data:image/jpeg;base64,';
/** 枠に合わせて切るときに、失ってよい面積の上限。★ これより多く切れる写真は、切らずに白い余白を足す */
export const ESUTAMA_DIARY_CROP_LOSS_MAX = 0.2;

/**
 * ★★★ 枠（714×1112 の縦長）への入れ方を決める。
 *   cover   … 枠いっぱいに広げて、はみ出た端を切る（中央を残す）
 *   contain … 切らずに全体を入れ、足りない部分は白い余白
 * ★ 縦長の写真（スマホの自撮り 3:4 など）は cover。端が少し切れるだけで、枠いっぱいに見える。
 * ★ 横長・正方形は cover だと半分近く切れる（顔が切れる）。だから contain。
 * ★ 大きさが分からない写真は contain（切らない側に倒す）。
 */
export function esutamaDiaryPhotoFit(width: number, height: number): 'cover' | 'contain' {
  const w = Number(width), h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'contain';
  const target = ESUTAMA_DIARY_PHOTO_W / ESUTAMA_DIARY_PHOTO_H;
  const ratio = w / h;
  // ★ 枠より横に広い写真は左右が切れ、枠より縦に長い写真は上下が切れる
  const kept = ratio > target ? target / ratio : ratio / target;
  return 1 - kept <= ESUTAMA_DIARY_CROP_LOSS_MAX ? 'cover' : 'contain';
}

/** JPEG の中身（base64）を、photos[N][data] に入れる形にする */
export function esutamaDiaryPhotoDataUrl(base64: string): string {
  return ESUTAMA_DIARY_PHOTO_PREFIX + String(base64 ?? '');
}

/**
 * ★ photos[N][data] に入れてよい形か。★ 違う形を本人のアカウントへ送らない。
 *   頭が data:image/jpeg;base64, で、うしろが base64 の文字だけ。短すぎるもの（空の画像）は通さない。
 */
export function isEsutamaDiaryPhotoDataUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v.startsWith(ESUTAMA_DIARY_PHOTO_PREFIX)) return false;
  const b64 = v.slice(ESUTAMA_DIARY_PHOTO_PREFIX.length);
  return b64.length >= 200 && b64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64);
}

/**
 * ★ 日記の写真（diary_posts.images）から、送る候補を先頭から3枚まで選ぶ。
 * ★★ 取りに行ってよいのは【フクエスの保管庫の公開 URL】だけ（storageBase で始まるもの）。
 *   ★ それ以外の URL は取りに行かない（サーバーから知らない宛先へ飛ばない）。数だけ skipped に入れる。
 */
export function pickEsutamaDiaryPhotoUrls(images: unknown, storageBase: string): { urls: string[]; skipped: number } {
  const list = Array.isArray(images) ? images.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  const base = String(storageBase ?? '').replace(/\/+$/, '');
  const urls: string[] = [];
  let skipped = 0;
  for (const u of list) {
    const ok = base.length > 0 && u.startsWith(base + '/storage/v1/object/public/') && !/[\s"'<>\\]/.test(u) && !u.includes('..');
    if (ok && urls.length < ESUTAMA_DIARY_PHOTO_MAX) urls.push(u);
    else skipped += 1;
  }
  return { urls, skipped };
}
