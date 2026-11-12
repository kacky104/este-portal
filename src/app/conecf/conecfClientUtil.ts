// コネックエフの画面で使い回す小さな道具（第1957便・総点検の整理）。
// ★ 画面ごとに同じ写しがあった（画像を縮める 6か所・日時 7か所）のを1か所に。中身は写しと同じ。

export { useLoadOnMount } from '../components/useLoadOnMount';

/** 「11/12 14:36」（日本時間）。無ければ「まだ」 */
export const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(iso)) : 'まだ');

/** ブラウザで長い辺 1440px の JPEG に縮めてから送る（サーバーアクションの上限の内側） */
export async function shrinkToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('read'));
      el.src = url;
    });
    const scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** アップロードするファイルの名前（`<id>-<今の時刻>.<拡張子>`）。★ 押したときにだけ呼ぶ */
export const uploadFileName = (id: string | number, ext: string) => `${id}-${Date.now()}.${ext}`;
