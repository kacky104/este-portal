import Image from 'next/image';
import type { AreaHeroBannerUrls } from '@/app/lib/areaBanners';

// エリア別ヒーローバナー（表示専任）。URL は area_hero_banners から fetch した値を page.tsx が props で渡す。
// sp: スマホ用（縦長 5:6・750×900）／pc: PC用（横長 3:1・1536×512）。
// URL は相対パス（/jobs/area/…）と Storage 絶対URLの両対応（next/image・remotePatterns 登録済み）。
// sp/pc いずれか null なら該当画面幅では非表示。banner が null または両方 null なら何も出さない。
const SP_W = 750;
const SP_H = 900; // 5:6
const PC_W = 1536;
const PC_H = 512; // 3:1

// banner: 該当エリアの sp/pc URL（無ければ null）／areaLabel: 表示名（alt用・areaLabel経由の上書き名）。
export function AreaHeroBanner({ banner, areaLabel }: { banner: AreaHeroBannerUrls | null; areaLabel: string }) {
  if (!banner || (!banner.sp && !banner.pc)) return null;

  const alt = `${areaLabel}のメンズエステ求人はフクエスワーク`;

  return (
    <div className="mb-6">
      {banner.sp && (
        <Image
          src={banner.sp}
          alt={alt}
          width={SP_W}
          height={SP_H}
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="w-full h-auto rounded-xl md:hidden"
        />
      )}
      {banner.pc && (
        <Image
          src={banner.pc}
          alt={alt}
          width={PC_W}
          height={PC_H}
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="w-full h-auto rounded-xl hidden md:block"
        />
      )}
    </div>
  );
}
