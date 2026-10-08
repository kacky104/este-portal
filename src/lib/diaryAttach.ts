// 写メ日記をメールで他サイトへ送るときの、添付画像の形式（第1313便・2026-10-08）。
//
// ★★★ 実際に起きた（2026-10-08 12:46・ラビリンス様 みきさん）:
//   フクエスで書いた写メ日記が、駅ちかでは件名だけ載り、画像は「載らなかったとき」の画像になった。
//   ★ 記録: 9/20 以降に駅ちかへ送れた日記は2件。10/7 の jpg（画像が載った）と、10/8 の webp（載らなかった）。
//   ★ 第999便（9/29）から、写メ日記の画像はスマホ側で縮めて WebP で保存している。転送はそれをそのまま添付していた。
//   → 駅ちかの投稿用メールは WebP を受け付けない。★ 送るときだけ JPEG に変える（フクエスに保存した WebP はそのまま）。
//
// ★ 純粋な判定だけをここに置く（番人 check:diaryattach）。変換そのものは forwardDiary.ts（sharp）。

export type AttachKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'unknown';

/** 中身の先頭バイトで形式を見る。★ 拡張子や Content-Type は信じない（縮めたあとの拡張子と中身がずれることがある） */
export function attachKindOf(buf: Uint8Array): AttachKind {
  const b = (i: number) => buf[i] ?? -1;
  const ascii = (from: number, len: number) => {
    let s = '';
    for (let i = from; i < from + len; i++) s += String.fromCharCode(b(i) < 0 ? 0 : b(i));
    return s;
  };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg';
  if (b(0) === 0x89 && ascii(1, 3) === 'PNG') return 'png';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (ascii(4, 4) === 'ftyp' && /^(heic|heix|mif1|msf1|heim|heis|avif)$/.test(ascii(8, 4))) return 'heic';
  return 'unknown';
}

/** メールで送ってよい形式か。★ JPEG・PNG・GIF はそのまま、ほかは JPEG に変えてから送る */
export function attachNeedsJpeg(kind: AttachKind): boolean {
  return !(kind === 'jpeg' || kind === 'png' || kind === 'gif');
}

/** 添付のファイル名の拡張子（★ 中身に合わせる） */
export function attachExt(kind: AttachKind): string {
  return kind === 'png' ? 'png' : kind === 'gif' ? 'gif' : 'jpg';
}
