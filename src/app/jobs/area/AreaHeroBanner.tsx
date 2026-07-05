import Image from 'next/image';

// エリア別ヒーローバナー。定義があるエリアのみ表示（キーが無ければ何もレンダリングしない）。
// 画像は public/jobs/area/ 配下の静的アセット（DB非依存）。命名: {slug}-hero-sp.png / {slug}-hero-pc.png。
// sp: スマホ用（縦長 5:6・750×900）／pc: PC用（横長 3:1・1536×512）。
// 画像を追加したら public/jobs/area/ に置いてこのマッピングに追記するだけでよい。
// ※ 実ファイルが未配置でもここは URL を指すだけなので、ビルドは通る（未配置時は Next の画像404になるのみ）。
const AREA_HERO_BANNERS: Record<string, { sp?: string; pc?: string }> = {
  'hakata-eki': { sp: '/jobs/area/hakata-eki-hero-sp.png' },
};

// 画像の実寸（CLS防止のため width/height を明示）。
const SP_W = 750;
const SP_H = 900; // 5:6
const PC_W = 1536;
const PC_H = 512; // 3:1

// slug: URLスラッグ（マッピングキー）／areaLabel: 表示名（alt用・areaLabel経由の上書き名）。
export function AreaHeroBanner({ slug, areaLabel }: { slug: string; areaLabel: string }) {
  const banner = AREA_HERO_BANNERS[slug];
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
