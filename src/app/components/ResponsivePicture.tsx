import { getImageProps } from 'next/image';
import type { CSSProperties } from 'react';

// ★ 第1054便（2026-10-01）: PC／SP で別画像を出すときの共通部品。
//   next/image の <Image> を2つ置いて CSS（hidden md:block / md:hidden）で隠す方法は、
//   display:none の画像もブラウザが取りに行くので、毎回2枚ぶん転送していた。
//   getImageProps で next/image の最適化（AVIF/WebP・サイズ別配信）を保ったまま
//   素の <picture> に流し込む（PageHero と同じ「アートディレクション」手順）。
//   境目は Tailwind の md（768px）に合わせる。

const SP_MAX = 767.98;
// ★ 第1076便: 境目を変えたい部品（トップの hero は sm=640px）のため spMax を受ける。既定は md。

type Source = { src: string; width: number; height: number };

export function ResponsivePicture({
  sp,
  pc,
  alt,
  sizes,
  priority = false,
  className,
  style,
  fill = false,
  spMax = SP_MAX,
}: {
  sp: Source;
  pc: Source;
  alt: string;
  /** PC/SP 共通の sizes。別々にしたいときは spSizes/pcSizes を足す */
  sizes: string;
  priority?: boolean;
  /** <img> に付けるクラス（w-full h-auto など）。fill のときは object-cover など */
  className?: string;
  style?: CSSProperties;
  /** 親（position:relative）いっぱいに敷く（next/image の fill 相当） */
  fill?: boolean;
  /** SP とみなす最大幅（px）。既定 767.98（md）。sm で分けるなら 639.98 */
  spMax?: number;
}) {
  const common = { alt, sizes, priority } as const;
  const spProps = fill
    ? getImageProps({ ...common, src: sp.src, fill: true }).props
    : getImageProps({ ...common, src: sp.src, width: sp.width, height: sp.height }).props;
  const { srcSet: pcSrcSet, ...imgProps } = fill
    ? getImageProps({ ...common, src: pc.src, fill: true }).props
    : getImageProps({ ...common, src: pc.src, width: pc.width, height: pc.height }).props;

  return (
    <picture>
      <source media={`(max-width: ${spMax}px)`} srcSet={spProps.srcSet} {...(fill ? {} : { width: sp.width, height: sp.height })} />
      <source media={`(min-width: ${spMax + 0.02}px)`} srcSet={pcSrcSet} {...(fill ? {} : { width: pc.width, height: pc.height })} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt は imgProps に含まれている */}
      <img
        {...imgProps}
        className={className}
        style={fill ? { ...imgProps.style, ...style } : { ...(imgProps.style ?? {}), ...style }}
      />
    </picture>
  );
}
