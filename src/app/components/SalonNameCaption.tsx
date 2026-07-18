'use client';

import Link from 'next/link';
import { useRef, useState, useLayoutEffect, useEffect } from 'react';

// バナー（ピックアップ店舗 / おすすめ店舗）の「下」に表示する店名キャプション。
// - 中央寄せ・濃いグレー太字（白背景ページ上でも読める）。
// - 幅に収まらない店名は MAX→MIN で1行に自動縮小（収まる名前は MAX のまま）。
// - link=true：自身を /salon/{salonId} への Link で包む（スライド自体が非リンクのピックアップ用）。
// - link=false：テキストのみ返す（カード全体が既に Link のおすすめ用＝<a> の二重ネスト回避）。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const MAX = 18;   // 既定サイズ(px)
const MIN = 12;   // 下限(px)
const STEP = 0.5; // 縮小ステップ

export function SalonNameCaption({ salonId, name, link = true }: { salonId: number; name: string; link?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(MAX);

  useIsomorphicLayoutEffect(() => {
    const c = containerRef.current;
    const t = textRef.current;
    if (!c || !t) return;
    const fit = () => {
      let s = MAX;
      t.style.fontSize = `${s}px`;
      while (t.scrollWidth > c.clientWidth && s > MIN) {
        s = Math.max(MIN, s - STEP);
        t.style.fontSize = `${s}px`;
      }
      setSize(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [name]);

  if (!name) return null;

  const inner = (
    <div ref={containerRef} className="min-w-0 overflow-hidden mt-2 px-2 text-center">
      <span
        ref={textRef}
        className="inline-block max-w-full whitespace-nowrap font-bold text-slate-600 leading-tight"
        style={{ fontSize: `${size}px`, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </span>
    </div>
  );

  if (!link) return inner;
  return (
    <Link href={`/salon/${salonId}`} className="block hover:opacity-80 transition-opacity">
      {inner}
    </Link>
  );
}
