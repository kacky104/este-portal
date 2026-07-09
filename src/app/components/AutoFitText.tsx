'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// SSR とクライアントで挙動を合わせるためのレイアウト計測フック（AutoFitName と同流儀）。
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// 1行自動フィットの汎用版。AutoFitName（セラピスト名用）の実測縮小ロジックを踏襲しつつ、
// 色・太さなどを className / style で外から渡せるようにした。
// min まで下げても収まらない場合は折り返し（従来の複数行表示・元サイズ）にフォールバックし、
// 文字は省略しない（コース名は情報として欠けさせない）。
export function AutoFitText({
  text,
  max,
  min,
  className = '',
  style,
}: {
  text: string;
  max: number;
  min: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  const [wrapFallback, setWrapFallback] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const fit = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      let s = max;
      setWrapFallback(false);
      t.style.whiteSpace = 'nowrap';
      t.style.fontSize = `${s}px`;
      // 1行（nowrap）で枠内に収まるまで 0.5px ずつ下げる。
      while (t.scrollWidth > c.clientWidth && s > min) {
        s = Math.max(min, s - 0.5);
        t.style.fontSize = `${s}px`;
      }
      // min でも収まらない場合は縮小をやめ、元サイズのまま折り返す（従来表示に戻す）。
      if (t.scrollWidth > c.clientWidth) {
        setWrapFallback(true);
        setSize(max);
      } else {
        setSize(s);
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [text, max, min]);

  return (
    <div ref={containerRef} className={`min-w-0 overflow-hidden ${className}`}>
      <span
        ref={textRef}
        className={`block max-w-full ${wrapFallback ? 'break-words' : 'whitespace-nowrap'}`}
        style={{ fontSize: `${size}px`, ...style }}
      >
        {text}
      </span>
    </div>
  );
}
