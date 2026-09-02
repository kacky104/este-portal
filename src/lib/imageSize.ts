// 画像の寸法をヘッダから読む（第107便・純粋関数）。
//
// ★★★ なぜ要るか
//   駅ちかへ写真を送るとき、大画像の 3:4 の切り抜き座標を【実寸】で送る（設計メモ 追記 B）。
//   ★ そのために幅と高さが要る。★ sharp は next の巻き添えで入っているだけで直接の依存ではないので当てにしない。
//   ★ 読むのはヘッダだけ。画素は触らない。
//
// ★ 対応は jpg / png だけ（★ 駅ちかの画面の注記どおり）。★ それ以外は null（推測で埋めない）。

export type ImageSize = { width: number; height: number; type: 'image/jpeg' | 'image/png' };

/** 先頭のバイト列から寸法を読む。読めなければ null。 */
export function readImageSize(buf: Uint8Array): ImageSize | null {
  if (!buf || buf.length < 24) return null;
  // ── PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR（幅・高さは 16〜23 バイト目、ビッグエンディアン）──
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    if (!(buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52)) return null;
    const width = be32(buf, 16);
    const height = be32(buf, 20);
    if (width <= 0 || height <= 0) return null;
    return { width, height, type: 'image/png' };
  }
  // ── JPEG: FF D8 のあと、SOF0〜SOF15（C0〜CF、C4/C8/CC を除く）を探す ──
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }        // ★ 詰め物の FF を飛ばす
      const marker = buf[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) return null;  // ★ 画像の終わり／走査の始まりまで SOF が無い
      const len = (buf[i + 2] << 8) | buf[i + 3];
      if (len < 2) return null;
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = (buf[i + 5] << 8) | buf[i + 6];
        const width = (buf[i + 7] << 8) | buf[i + 8];
        if (width <= 0 || height <= 0) return null;
        return { width, height, type: 'image/jpeg' };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}

function be32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}
