'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// SSR とクライアントで挙動を合わせるためのレイアウト計測フック（SalonNameRow と同流儀）。
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const MAX = 20; // 既定サイズ（text-xl = 1.25rem = 20px）
const MIN = 13; // 下限

// グラデ帯見出し用の1行自動フィット。SalonNameRow.tsx の実測縮小ロジックをそのまま踏襲：
// whitespace-nowrap で1行を維持し、収まらない間フォントを 0.5px 刻みで下げる。
// 下限でも収まらないときだけ「…」省略を許可する。
// 見た目（白・太字・leading-none＋translateY(1px) の光学センター補正）はグラデ帯の h1 に合わせる。
// span は inline-block だとベースライン揃えで h1 行ボックスのディセント分だけ上寄りになるため block にする。
export function AutoFitHeadingText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(MAX);
  const [allowEllipsis, setAllowEllipsis] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const fit = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      let s = MAX;
      setAllowEllipsis(false);
      t.style.fontSize = `${s}px`;
      // scrollWidth が親の clientWidth を超える間、0.5px ずつ下げる。
      while (t.scrollWidth > c.clientWidth && s > MIN) {
        s = Math.max(MIN, s - 0.5);
        t.style.fontSize = `${s}px`;
      }
      setSize(s);
      // 下限でも収まらない場合のみ ellipsis を許可。
      if (t.scrollWidth > c.clientWidth) setAllowEllipsis(true);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [text]);

  return (
    <div ref={containerRef} className="min-w-0 overflow-hidden">
      <span
        ref={textRef}
        className="block max-w-full whitespace-nowrap font-bold text-slate-600 leading-none"
        style={{
          fontSize: `${size}px`,
          transform: 'translateY(1px)',
          overflow: 'hidden',
          textOverflow: allowEllipsis ? 'ellipsis' : 'clip',
        }}
      >
        {text}
      </span>
    </div>
  );
}
