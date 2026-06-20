'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 店名を1行に収める自動フォント縮小。2行になりそうなら、入る大きさまでフォントを段階的に下げる。
// SSR とクライアントで挙動を合わせるため、初期は max で描画し、マウント後に計測して縮小する。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function AutoFitName({
  name,
  max = 16,
  min = 11,
  className = '',
}: {
  name: string;
  max?: number;
  min?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);

  useIsomorphicLayoutEffect(() => {
    const fit = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      let s = max;
      t.style.fontSize = `${s}px`;
      // 1行（whitespace-nowrap）で枠内に収まるまでフォントを下げる
      while (t.scrollWidth > c.clientWidth && s > min) {
        s -= 0.5;
        t.style.fontSize = `${s}px`;
      }
      setSize(s);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [name, max, min]);

  return (
    <div ref={containerRef} className={`min-w-0 overflow-hidden ${className}`}>
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap font-bold text-slate-900 leading-snug"
        style={{ fontSize: `${size}px` }}
      >
        {name}
      </span>
    </div>
  );
}
