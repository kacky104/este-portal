'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isSaved, toggleSaved, SAVED_SALONS_EVENT } from '@/lib/savedSalons';

// SSR とクライアントで挙動を合わせるためのレイアウト計測フック。
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const MAX = 18; // 既定サイズ（元の text-lg = 18px）
const MIN = 11; // 下限

// 店名行：店名（左・可変幅・1行自動縮小）＋ 保存ボタン（右・固定）。
// 店名は white-space: nowrap で1行を維持し、収まらない場合はフォントを下げる。
// 下限でも収まらないときだけ「…」省略を許可する。
export function SalonNameRow({
  salonId,
  salonName,
  showSaveButton = false,
}: {
  salonId: number;
  salonName: string;
  showSaveButton?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(MAX);
  const [allowEllipsis, setAllowEllipsis] = useState(false);

  // ハイドレーション対策：初期は未保存扱いで描画し、マウント後に反映する。
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => setSaved(isSaved(salonId));
    sync();
    window.addEventListener(SAVED_SALONS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_SALONS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [salonId]);

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

  const handleToggle = (e: React.MouseEvent) => {
    // カードが Link/クリックで包まれているため、遷移を必ず抑止する。
    e.preventDefault();
    e.stopPropagation();
    setSaved(toggleSaved({ id: salonId, name: salonName }));
  };

  const isSavedNow = mounted && saved;

  return (
    <div className="flex items-center gap-2 mb-3">
      <div ref={containerRef} className="min-w-0 flex-1 overflow-hidden">
        <span
          ref={textRef}
          className="inline-block max-w-full whitespace-nowrap font-bold text-slate-900 group-hover:text-pink-700 transition-colors leading-snug"
          style={{
            fontSize: `${size}px`,
            overflow: 'hidden',
            textOverflow: allowEllipsis ? 'ellipsis' : 'clip',
          }}
        >
          {salonName}
        </span>
      </div>

      {showSaveButton && (
        <button
          type="button"
          onClick={handleToggle}
          aria-label={isSavedNow ? 'お気に入りから削除' : 'お気に入りに保存'}
          aria-pressed={isSavedNow}
          className="flex-shrink-0 inline-flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 29,
            height: 29,
            background: isSavedNow ? '#E2B85A' : '#161412',
            border: `1px solid ${isSavedNow ? '#E2B85A' : '#3A352A'}`,
          }}
        >
          {/* ブックマーク：未保存はゴールド輪郭、保存済みは暗色の塗り */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={isSavedNow ? '#161412' : 'none'}
            stroke={isSavedNow ? '#161412' : '#E2B85A'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  );
}
