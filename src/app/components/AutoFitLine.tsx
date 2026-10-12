'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 1行に収まるまで文字を小さくする（第1425便・2026-10-13・カッキーさん）。
// ★ セラピストのページの AutoFitName と同じ考え方で、色・太さを外から渡せる版（おすすめセラピストNEWS の題名に使う）。
// ★ 最初は max で描き、画面に出たあとで測って小さくする。min まで下げても入らないときは末尾を「…」で切る。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function AutoFitLine({
  text, max = 16, min = 10, color, bold = true, className = '', as = 'span',
}: {
  text: string;
  max?: number;
  min?: number;
  color?: string;
  bold?: boolean;
  className?: string;
  /** 見出しとして置くときは 'h2'（SEO・読み上げ用） */
  as?: 'span' | 'h2';
}) {
  const boxRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);

  useIsomorphicLayoutEffect(() => {
    const fit = () => {
      const c = boxRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      let s = max;
      t.style.fontSize = `${s}px`;
      while (t.scrollWidth > c.clientWidth && s > min) {
        s -= 0.5;
        t.style.fontSize = `${s}px`;
      }
      setSize(s);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [text, max, min]);

  const Tag = as;
  return (
    <Tag ref={boxRef as React.Ref<HTMLHeadingElement & HTMLSpanElement>} className={`block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${className}`}>
      <span
        ref={textRef}
        className={`whitespace-nowrap leading-snug ${bold ? 'font-bold' : ''}`}
        style={{ fontSize: `${size}px`, color }}
      >
        {text}
      </span>
    </Tag>
  );
}
