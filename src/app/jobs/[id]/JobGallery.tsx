'use client';

import Image from 'next/image';
import { useRef } from 'react';
import type { JobGalleryItem } from '@/app/lib/jobs';

// 求人詳細の「お店の雰囲気」正方形スライダー。
// CSS スクロール（overflow-x-auto + scroll-snap）方式。JSカルーセルは使わない。
// PC でホイール横スクロールしづらいため、JobHeroSlider と同仕様の左右矢印を追加（全デバイス表示）。
// カードは正方形（aspect-square）・object-cover。キャプションは画像の「下」に2行まで（超過は省略）。
// 全カードが空ならキャプション領域ごと非表示。見せ方: モバイル2.1枚 / PC(md)3.1枚。
// ※白帯スイープ（.hero-shine-loop）はヒーロー専用の演出として、ここには適用しない。
const GAP_PX = 6; // gap-1.5 = 0.375rem

export function JobGallery({ images }: { images: JobGalleryItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  // 0枚時はセクションごと非表示（呼び出し側でも制御するが二重防御）。
  if (images.length === 0) return null;

  // 1枚でもキャプションがあれば、全カードにキャプション領域（2行分の高さ）を確保して下端を揃える。
  // 全カードが空のときはキャプション領域ごと出さない（画像のみ）。
  const hasAnyCaption = images.some((img) => img.caption !== '');

  // カード1枚分＋gap だけスクロール。端では scrollBy がクランプされ no-op（矢印は常時表示のまま）。
  const scrollByCard = (dir: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>('[data-gallery-card]');
    const cardW = card ? card.getBoundingClientRect().width : track.clientWidth * 0.45;
    track.scrollBy({ left: dir * (cardW + GAP_PX), behavior: 'smooth' });
  };

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm mt-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900">お店の雰囲気</h2>
      </div>

      {/* 矢印を重ねるため relative。-mx-5 でカードの p-5 分まで端を使い切る。 */}
      <div className="relative -mx-5">
        <div
          ref={trackRef}
          className="overflow-x-auto snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex gap-1.5 px-5">
            {images.map((img, i) => (
              <div
                key={img.url}
                data-gallery-card
                className="snap-start flex-shrink-0 w-[calc((100%-0.375rem)/2.1)] md:w-[calc((100%-0.75rem)/3.1)]"
              >
                <div className="relative aspect-square rounded-2xl overflow-hidden shadow border border-emerald-100 bg-slate-50">
                  <Image
                    src={img.url}
                    alt={img.caption || `お店の雰囲気${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 45vw, 220px"
                  />
                </div>
                {/* キャプションは画像の下・2行まで（超過は省略）。高さ揃えのため min-h を確保。 */}
                {hasAnyCaption && (
                  <p className="text-[11px] leading-snug text-slate-600 mt-1.5 line-clamp-2 min-h-[31px]">{img.caption}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 左右矢印（全デバイス表示・JobHeroSlider と同仕様＝半透明黒の円形ボタン）。
            リング(白帯なし)・スワイプ操作と共存。pointer-events はボタンのみ有効（画像は透過）。 */}
        <button
          type="button"
          aria-label="前へ"
          onClick={() => scrollByCard(-1)}
          className="flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white border border-white/20 shadow hover:bg-black/50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="次へ"
          onClick={() => scrollByCard(1)}
          className="flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white border border-white/20 shadow hover:bg-black/50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
