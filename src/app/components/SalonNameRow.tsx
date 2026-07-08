'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SaveButton } from './SaveButton';

// SSR とクライアントで挙動を合わせるためのレイアウト計測フック。
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const MAX = 18; // 既定サイズ（元の text-lg = 18px）
const MIN = 11; // 下限

// 店名行：店名（左・可変幅・1行自動縮小）＋ 保存ボタン（右・固定）。
// 店名は white-space: nowrap で1行を維持し、収まらない場合はフォントを下げる。
// 下限でも収まらないときだけ「…」省略を許可する。
// 保存ボタンは共通の SaveButton に切り出し済み（演出・配色はそちらに集約）。
export function SalonNameRow({
  salonId,
  salonName,
  showSaveButton = false,
  nameBanner = false,
}: {
  salonId: number;
  salonName: string;
  showSaveButton?: boolean;
  nameBanner?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(MAX);
  const [allowEllipsis, setAllowEllipsis] = useState(false);

  // 店名を1行に収める自動フォント縮小。
  useIsomorphicLayoutEffect(() => {
    const fit = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      let s = MAX;
      setAllowEllipsis(false);
      t.style.fontSize = `${s}px`;
      // scrollWidth が親の clientWidth を超える間、1px ずつ下げる。
      while (t.scrollWidth > c.clientWidth && s > MIN) {
        s -= 1;
        t.style.fontSize = `${s}px`;
      }
      setSize(s);
      // 下限でも収まらない場合のみ ellipsis を許可。
      if (t.scrollWidth > c.clientWidth) setAllowEllipsis(true);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [salonName]);

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* バナー時：ピンク単系グラデの帯（直角＝直角化方針に合わせ rounded 無し）。
          グラデ・padding は外側ラッパに付け、計測用の containerRef は無装飾のまま
          （padding を付けると clientWidth がずれてフォント縮小判定が狂うため）。
          flex-1 も外側ラッパに移し、内側 containerRef は block 要素として親幅いっぱいに広がる。 */}
      <div
        className={`min-w-0 flex-1 ${nameBanner ? 'px-3 py-1' : ''}`}
        style={nameBanner ? { background: 'linear-gradient(to right, #ec4899, #f472b6)' } : undefined}
      >
        <div ref={containerRef} className="min-w-0 overflow-hidden">
          <span
            ref={textRef}
            className={`inline-block max-w-full whitespace-nowrap font-bold leading-snug transition-colors ${
              nameBanner ? 'text-white' : 'text-slate-900 group-hover:text-pink-700'
            }`}
            style={{
              fontSize: `${size}px`,
              overflow: 'hidden',
              textOverflow: allowEllipsis ? 'ellipsis' : 'clip',
            }}
          >
            {salonName}
          </span>
        </div>
      </div>

      {showSaveButton && (
        // translateY で行中央から見た目だけ少し上へ（レイアウトは保持）。
        <span className="flex-shrink-0 inline-flex" style={{ transform: 'translateY(-3px)' }}>
          <SaveButton kind="salon" item={{ id: salonId, name: salonName }} variant="paw" />
        </span>
      )}
    </div>
  );
}
