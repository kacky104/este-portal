'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// SSR警告回避: クライアントのみ useLayoutEffect（描画前測定＝チラつき防止）。本体サイトの AutoFitSalonName と同手法。
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// 名前の1行自動縮小フィット（fukuX共通版）。収まらないときだけ max→min で fontSize を段階縮小して全文1行表示し、
// min でも溢れる超長名のみ末尾省略(…)。改行はしない。
// テキストは min-w-0 の flex 子＝溢れると clientWidth が利用可能幅で頭打ちになるため、
// scrollWidth > clientWidth の間だけ縮小すれば「after（バッジ等）分を除いた実効幅」に自動フィットする。
// after は縮めない前提（呼び出し側で flex-shrink-0 を付ける）。リサイズは ResizeObserver で再計測。
// 使用箇所: タイムラインお店カード（16→11px）／プロフィールの表示名（20→13px）。
export function AutoFitName({
  name,
  max,
  min,
  step = 0.5,
  className = 'gap-1',
  textClassName = '',
  textTag = 'span',
  after,
}: {
  name: string;
  max: number; // 開始 fontSize(px)＝収まる名前は従来と同じ見た目
  min: number; // 縮小の下限(px)
  step?: number;
  className?: string; // コンテナ追加クラス（gap 調整用）
  textClassName?: string; // テキストのフォント・色クラス
  textTag?: 'span' | 'h1'; // プロフィールでは h1（SEO/セマンティクス維持）
  after?: ReactNode; // 名前直後に置く縮めない要素（認証バッジ・種別チップ等）
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState(max);

  useIsomorphicLayoutEffect(() => {
    const c = containerRef.current;
    const t = textRef.current;
    if (!c || !t) return;
    const fit = () => {
      let s = max;
      t.style.fontSize = `${s}px`;
      while (t.scrollWidth > t.clientWidth && s > min) {
        s = Math.max(min, s - step);
        t.style.fontSize = `${s}px`;
      }
      setSize(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, max, min, step]);

  const TextTag = textTag;
  return (
    <div ref={containerRef} className={`flex-1 min-w-0 flex items-center ${className}`}>
      <TextTag
        ref={(el: HTMLElement | null) => {
          textRef.current = el;
        }}
        className={`min-w-0 whitespace-nowrap ${textClassName}`}
        style={{ fontSize: `${size}px`, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </TextTag>
      {after}
    </div>
  );
}
