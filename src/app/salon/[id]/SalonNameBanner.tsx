'use client';

import { useEffect, useState } from 'react';

// サロン店名ブロック。初回マウント時に一度だけ「キラリ」と光を走らせる（ループなし）。
// prefers-reduced-motion: reduce では .play を付与せず静止表示のまま。
// 静止時のデザイン（枠線・文字色・レイアウト）は従来どおり。
export function SalonNameBanner({
  name,
  cardBg,
  cardBorder,
  heading,
}: {
  name: string;
  cardBg: string;
  cardBorder: string;
  heading: string;
}) {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return; // 動きを抑える設定では再生しない
    }
    // マウント後の次フレームで .play を付与し、初回の1回だけアニメーションさせる。
    const raf = requestAnimationFrame(() => setPlay(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`salon-name-banner rounded-2xl border shadow-sm p-5 mb-4 text-center${play ? ' play' : ''}`}
      style={{ backgroundColor: cardBg, borderColor: cardBorder, '--sn-heading': heading } as React.CSSProperties}
      // アニメ完了で .play を外し、文字を必ず静止色（単色ヘッディング）へ戻す（黒テーマの色残り防止）。
      onAnimationEnd={() => setPlay(false)}
    >
      <h1
        className="salon-name-text font-bold whitespace-nowrap overflow-hidden"
        style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis' }}
      >
        {name}
      </h1>
    </div>
  );
}
