'use client';

import { useEffect, useRef, useState } from 'react';
import { isSaved as isSalonSaved, toggleSaved as toggleSalon, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import {
  isTherapistSaved,
  toggleTherapist,
  SAVED_THERAPISTS_EVENT,
} from '@/lib/savedTherapists';

// 保存ボタンの配色。白×ピンク（LIGHT）。将来テーマ別に差し替え可能。
const LIGHT = {
  unsaved: {
    bg:          '#FFFFFF',
    border:      '#E5E7EB', // 薄グレー
    borderHover: '#F9A8D4', // ピンク（薄）
    icon:        '#9CA3AF', // グレー
    iconHover:   '#EC4899', // ピンク
  },
  saved: {
    bg:     '#EC4899', // 主要ピンク
    border: '#EC4899',
    icon:   '#FFFFFF', // 白の塗り＋白の線
  },
} as const;

// キラッ（スパーク）の飛び先オフセット（ボタン中心からの相対）。
const SPARKS = [
  { x: -16, y: -14 },
  { x:  16, y: -14 },
  { x:   0, y: -20 },
] as const;

export type SaveItem = { id: number; name: string; salonId?: number };

// 汎用の保存ブックマークボタン（円・案4のポップ＋スパーク演出・hover配色）。
// kind に応じて savedSalons / savedTherapists を呼び分ける。
export function SaveButton({
  kind,
  item,
  size = 33,
}: {
  kind: 'salon' | 'therapist';
  item: SaveItem;
  size?: number;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ハイドレーション対策：初期は未保存扱いで描画し、マウント後に反映する。
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hovered, setHovered] = useState(false);
  // 保存した瞬間のクリック演出。保存済みに切り替わったときだけ +1 して再生。
  const [burst, setBurst] = useState(0);

  const eventName = kind === 'salon' ? SAVED_SALONS_EVENT : SAVED_THERAPISTS_EVENT;

  useEffect(() => {
    setMounted(true);
    const check = () =>
      kind === 'salon' ? isSalonSaved(item.id) : isTherapistSaved(item.id);
    const sync = () => setSaved(check());
    sync();
    window.addEventListener(eventName, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(eventName, sync);
      window.removeEventListener('storage', sync);
    };
  }, [item.id, kind, eventName]);

  // 円（ボタン）のポップ。ボタンは再マウントせず、burst が増えるたびに
  // クラスを付け直し＋強制リフローでアニメを毎回最初から再生する（連打対応）。
  useEffect(() => {
    if (burst === 0) return;
    const el = buttonRef.current;
    if (!el) return;
    el.classList.remove('save-pop');
    void el.offsetWidth; // 強制リフローでアニメをリセット
    el.classList.add('save-pop');
  }, [burst]);

  const handleToggle = (e: React.MouseEvent) => {
    // カードや Link に包まれているため、遷移を必ず抑止する。
    e.preventDefault();
    e.stopPropagation();
    const next =
      kind === 'salon'
        ? toggleSalon({ id: item.id, name: item.name })
        : toggleTherapist({ id: item.id, name: item.name, salonId: item.salonId ?? 0 });
    setSaved(next);
    // 保存済みになった瞬間だけ演出（解除時は出さない）。連打追従のため毎回 +1。
    if (next) setBurst(b => b + 1);
  };

  const isSavedNow = mounted && saved;
  const iconSize = Math.round(size * (18 / 33)); // 既定33pxでアイコン18px相当

  return (
    // ラッパ：演出をボタンの裏側〜周囲に出すため relative + overflow:visible。
    <span className="relative inline-flex flex-shrink-0" style={{ overflow: 'visible' }}>
      {/* キラッ：保存した瞬間のみ。key={`sparks-${burst}`} で再マウントして毎回最初から再生。
          z-index はボタンより下（裏側〜周囲に出る）。 */}
      {burst > 0 && (
        <span
          key={`sparks-${burst}`}
          aria-hidden="true"
          className="save-sparkles absolute inset-0"
          style={{ zIndex: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          {SPARKS.map((s, i) => (
            <svg
              key={i}
              className="save-spark"
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="#F472B6"
              style={{ ['--spark-x']: `${s.x}px`, ['--spark-y']: `${s.y}px` } as React.CSSProperties}
            >
              <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
            </svg>
          ))}
        </span>
      )}

      {/* 円（ボタン）ごと弾ませる。再マウントはせず ref＋useEffect で pop を再生。 */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={isSavedNow ? 'お気に入りから削除' : 'お気に入りに保存'}
        aria-pressed={isSavedNow}
        className="relative inline-flex items-center justify-center rounded-full transition-colors"
        style={{
          width: size,
          height: size,
          zIndex: 1,
          background: isSavedNow ? LIGHT.saved.bg : LIGHT.unsaved.bg,
          border: `1.5px solid ${
            isSavedNow
              ? LIGHT.saved.border
              : hovered
                ? LIGHT.unsaved.borderHover
                : LIGHT.unsaved.border
          }`,
        }}
      >
        {/* ブックマーク：未保存はグレー輪郭（ホバーでピンク）、保存済みは白の塗り */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill={isSavedNow ? LIGHT.saved.icon : 'none'}
          stroke={
            isSavedNow
              ? LIGHT.saved.icon
              : hovered
                ? LIGHT.unsaved.iconHover
                : LIGHT.unsaved.icon
          }
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </span>
  );
}
