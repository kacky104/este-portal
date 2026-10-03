import Image from 'next/image';

// 写メ日記一覧の正方形サムネ（第1123便・2026-10-03）。
//
// ★ 以前は /diary・/salon/[id]/diary・/therapist/[id]/diary の3つの一覧が、元画像（平均 345kB・駅ちかから取り込んだものは最大 4.8MB）を
//   そのまま <img> で正方形に詰めていた。★ 一覧は1画面に 20 枚並ぶので、転送量はほぼここで決まる。
// ★ Supabase Storage の公開URL（next.config.ts の remotePatterns にある）だけ next/image に通す：
//   列幅に合わせた大きさ（最大でも 1 列ぶん）・AVIF/WebP・30日キャッシュ（minimumCacheTTL）。
//   ★ それ以外の URL（古い外部画像など）は今までどおり <img>（★ 変換できない場所を next/image に渡して落とさない）。
// ★ 見た目は変えない（object-cover・hover の拡大は呼び出し側の className のまま）。

const STORAGE_PUBLIC_PREFIX = 'https://efjrpanojfahqjwqpagg.supabase.co/storage/v1/object/public/';

/** ★ 一覧の列: スマホ2列・sm 3列・lg 4列（親の最大幅 ≒ 1024px）。★ 1列ぶんより大きい画像を取らない */
const GRID_SIZES = '(min-width: 1024px) 256px, (min-width: 640px) 33vw, 50vw';

export function DiaryThumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (src.startsWith(STORAGE_PUBLIC_PREFIX)) {
    return <Image src={src} alt={alt} fill sizes={GRID_SIZES} className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />;
}
