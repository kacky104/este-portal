'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';

// 求人詳細のヒーローバナー（2枚以上）のスワイプ可能スライダー。
// 時間依存ではない純表示なので ISR のままで問題なし（クライアントで scroll 位置→インジケータのみ管理）。
// 方式: CSS スクロール（overflow-x-auto + scroll-snap）。JSカルーセルは使わない。
// - 各スライドは w-full・16:9。snap-center でぴたっと止まる。
// - 下部にドットインジケータ、矢印は PC（md以上）のみ表示。
// - 画像上にテキストは重ねない（現トーン維持）。
export function JobHeroSlider({ images, title }: { images: string[]; title: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // スクロール位置から現在のスライド番号を求める（幅で割って四捨五入）。
  const handleScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(Math.max(0, Math.min(images.length - 1, i)));
  };

  const goto = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="hero-shine-loop relative rounded-2xl overflow-hidden shadow-md border border-emerald-100 mb-4">
      {/* トラック（横スクロール＋スナップ） */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <div key={i} className="relative w-full flex-shrink-0 snap-center aspect-video">
            <Image
              src={src}
              alt={`${title}（${i + 1}枚目）`}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {/* 矢印（全デバイス表示）。本体ピックアップサロンスライダーと同仕様＝半透明黒の円形ボタン。
          タップ領域は誤タップ防止のため 40×40px（w-10 h-10）。端では goto がクランプ（無害な no-op）。 */}
      <button
        type="button"
        aria-label="前の画像"
        onClick={() => goto(active - 1)}
        className="flex items-center justify-center absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white border border-white/20 shadow hover:bg-black/50 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="次の画像"
        onClick={() => goto(active + 1)}
        className="flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white border border-white/20 shadow hover:bg-black/50 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* ドットインジケータ（z-10：白帯スイープ(z-5)より前面に保つ） */}
      <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}枚目へ`}
            aria-current={i === active ? 'true' : undefined}
            onClick={() => goto(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
            } shadow`}
          />
        ))}
      </div>
    </div>
  );
}
