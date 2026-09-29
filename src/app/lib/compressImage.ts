// ★★ 第999便（2026-09-30・カッキーさん）: 画像を送る前に【スマホ側で縮める】共通の道具（ブラウザ専用）。
// ★ 目的: スマホの写真は1枚 3〜5MB。そのまま Storage に入れると、投稿4枚で 20MB を全員が読み込むことになる。
//   長辺 1600px・WebP（品質 0.85）に縮めると 1枚 200〜400KB。表示が速くなり、Storage と転送量の費用も減る。
// ★ 使う場所: fukuX の投稿・ストーリー・アイコン、写メ日記、店舗マイページのセラピスト写真。
// ★ 縮めない場合（元のファイルをそのまま返す）:
//   ・GIF（動きが消えるため）
//   ・ブラウザで開けない形式（HEIC など。iPhone は選んだ時点で JPEG に変換されることが多い）
//   ・縮めた結果が元より大きい、または元が十分小さい（300KB 以下で長辺 1600px 以下）
export type CompressedImage = { blob: Blob; ext: 'webp' | 'jpg' | 'png' | 'gif'; changed: boolean };

const MAX_EDGE = 1600;
const QUALITY = 0.85;
const SKIP_UNDER_BYTES = 300 * 1024;

function extOf(file: File): CompressedImage['ext'] {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/gif') return 'gif';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  return 'jpg';
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if ('createImageBitmap' in window) {
      // ★ EXIF の向きを反映して読む（横向きに保存された写真が回転して見える事故を防ぐ）
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    }
  } catch { /* 下の img で再挑戦 */ }
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function compressImage(file: File, opts?: { maxEdge?: number; quality?: number }): Promise<CompressedImage> {
  const ext = extOf(file);
  const asIs: CompressedImage = { blob: file, ext, changed: false };
  if (typeof window === 'undefined' || ext === 'gif') return asIs;

  const maxEdge = opts?.maxEdge ?? MAX_EDGE;
  const quality = opts?.quality ?? QUALITY;

  const src = await loadBitmap(file);
  if (!src) return asIs; // 開けない形式はそのまま
  const w = 'width' in src ? src.width : 0;
  const h = 'height' in src ? src.height : 0;
  if (!w || !h) return asIs;

  const longest = Math.max(w, h);
  if (file.size <= SKIP_UNDER_BYTES && longest <= maxEdge) {
    if ('close' in src) src.close();
    return asIs; // 十分小さい
  }
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) { if ('close' in src) src.close(); return asIs; }
  ctx.drawImage(src, 0, 0, tw, th);
  if ('close' in src) src.close();

  // ★ WebP で出す（対応していないブラウザは JPEG）。PNG の透過は WebP でも保てる。
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  let out: Blob | null = blob;
  let outExt: CompressedImage['ext'] = 'webp';
  if (!out || out.type !== 'image/webp') {
    out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    outExt = 'jpg';
  }
  if (!out) return asIs;
  if (out.size >= file.size && scale === 1) return asIs; // 縮めて大きくなるなら元のまま
  return { blob: out, ext: outExt, changed: true };
}
