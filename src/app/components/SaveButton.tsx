'use client';

import { useEffect, useRef, useState } from 'react';
import { isSaved as isSalonSaved, toggleSaved as toggleSalon, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import {
  isTherapistSaved,
  toggleTherapist,
  SAVED_THERAPISTS_EVENT,
} from '@/lib/savedTherapists';

// 肉球グリフ（複数楕円の塗りで構成）。アイコンと飛び散る粒で共用。
// 輪郭線だと楕円の重なりが汚く見えるため、塗り（fill）で表現する。
const PawGlyph = () => (
  <g fill="currentColor">
    <ellipse cx="12" cy="17" rx="5.2" ry="4.6" />
    <ellipse cx="5.8" cy="11" rx="1.9" ry="2.5" transform="rotate(-18 5.8 11)" />
    <ellipse cx="9.7" cy="7.6" rx="2" ry="2.7" transform="rotate(-7 9.7 7.6)" />
    <ellipse cx="14.3" cy="7.6" rx="2" ry="2.7" transform="rotate(7 14.3 7.6)" />
    <ellipse cx="18.2" cy="11" rx="1.9" ry="2.5" transform="rotate(18 18.2 11)" />
  </g>
);

// 桜グリフ（花びら1枚を72°ずつ回転した5枚の塗りで構成）。
const SAKURA_PETAL = 'M12 12C9 12 7.5 6.5 9 4 10 2.5 11 4.5 12 5.5 13 4.5 14 2.5 15 4 16.5 6.5 15 12 12 12Z';
const SakuraGlyph = () => (
  <g fill="currentColor">
    {[0, 72, 144, 216, 288].map(deg => (
      <path key={deg} d={SAKURA_PETAL} transform={`rotate(${deg} 12 12)`} />
    ))}
  </g>
);

// 単一花びら（フラッター粒用）。
const PetalGlyph = () => <path d="M12 4C8 8 8 16 12 20 16 16 16 8 12 4Z" fill="currentColor" />;

// ── バリアント別の配色・アイコン・演出 ──────────────────────────
// paw    : 肉球（塗り）＋ピンク＋肉球バースト（8個）。トップ/保存ページのサロンカード（kind=salon）。
// sakura : 桜（塗り）＋ピンク＋花びら舞い散り（8枚）。セラピスト保存ボタン（kind=therapist）。
// 配色は共通（白丸/薄グレー枠/グレー → 保存でピンク地+白）。演出粒はどちらも前面。
const COLORS = {
  unsaved: { bg: '#FFFFFF', border: '#E5E7EB', borderHover: '#F9A8D4', icon: '#9CA3AF', iconHover: '#EC4899' },
  saved:   { bg: '#EC4899', border: '#EC4899', icon: '#FFFFFF' },
} as const;
const VARIANTS = {
  paw:    { ...COLORS, glyph: 'paw'    as const, effect: 'pawburst' as const },
  sakura: { ...COLORS, glyph: 'sakura' as const, effect: 'flutter'  as const },
} as const;

// バースト（paw用）：8個を放射状に。角度は 2π/8 ごと＋わずかなジッター、
// 飛距離 30〜39px（円の外まで確実に出す）。肉球は回転控えめ（最終 ~40deg）。
const BURST_JITTER = [0.12, -0.16, 0.09, -0.06, 0.14, -0.11, 0.07, -0.1];
const BURST_PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI * 2 / 8) * i + BURST_JITTER[i];
  const dist  = 30 + (i % 4) * 3; // 30 / 33 / 36 / 39 を循環
  return {
    x:   Math.round(Math.cos(angle) * dist),
    y:   Math.round(Math.sin(angle) * dist),
    rot: 24 + i * 4, // 控えめな回転（~24〜52deg）
  };
});

// 花びら舞い散り（sakura用）：8枚を放射状に。飛距離 30〜40px、ひらひら回転（-40〜160deg程度）。
const FLUTTER_ROT = [120, -30, 95, 40, 150, -40, 65, 110];
const FLUTTER_PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI * 2 / 8) * i + BURST_JITTER[i];
  const dist  = 30 + (i % 4) * 3.3; // 30 / 33.3 / 36.6 / 39.9
  return {
    x:   Math.round(Math.cos(angle) * dist),
    y:   Math.round(Math.sin(angle) * dist),
    rot: FLUTTER_ROT[i],
  };
});

export type SaveItem = { id: number; name: string; salonId?: number };

// 汎用の保存ボタン（円・案4のポップ演出・hover配色）。
// kind に応じて savedSalons / savedTherapists を呼び分け、variant で見た目・演出を切り替える。
export function SaveButton({
  kind,
  item,
  size = 33,
  variant = 'paw',
}: {
  kind: 'salon' | 'therapist';
  item: SaveItem;
  size?: number;
  variant?: 'paw' | 'sakura';
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

  const cfg = VARIANTS[variant];
  const isSavedNow = mounted && saved;
  const iconSize = Math.round(size * (18 / 33)); // 既定33pxでアイコン18px相当

  return (
    // ラッパ：演出をボタンの裏側〜周囲に出すため relative + overflow:visible。
    <span className="relative inline-flex flex-shrink-0" style={{ overflow: 'visible' }}>
      {/* 演出：保存した瞬間のみ。key で単一ラッパを再マウントして毎回最初から再生。
          粒はボタンより前面（z-index上）。transform のみで動きレイアウト不変。 */}
      {burst > 0 && (
        <span
          key={`fx-${burst}`}
          aria-hidden="true"
          className="absolute inset-0"
          style={{ zIndex: 2, overflow: 'visible', pointerEvents: 'none', color: '#EC4899' }}
        >
          {cfg.effect === 'pawburst'
            ? BURST_PARTICLES.map((s, i) => (
                <svg
                  key={i}
                  className="save-burst-star"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  style={{ ['--burst-x']: `${s.x}px`, ['--burst-y']: `${s.y}px`, ['--burst-rot']: `${s.rot}deg` } as React.CSSProperties}
                >
                  <PawGlyph />
                </svg>
              ))
            : FLUTTER_PARTICLES.map((s, i) => (
                <svg
                  key={i}
                  className="save-flutter-petal"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  style={{ ['--flutter-x']: `${s.x}px`, ['--flutter-y']: `${s.y}px`, ['--flutter-rot']: `${s.rot}deg` } as React.CSSProperties}
                >
                  <PetalGlyph />
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
          background: isSavedNow ? cfg.saved.bg : cfg.unsaved.bg,
          border: `1.5px solid ${
            isSavedNow
              ? cfg.saved.border
              : hovered
                ? cfg.unsaved.borderHover
                : cfg.unsaved.border
          }`,
        }}
      >
        {/* アイコンは塗り（currentColor）。未保存はグレー（ホバーで色付き）、保存済みは白。 */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          style={{
            color: isSavedNow
              ? cfg.saved.icon
              : hovered
                ? cfg.unsaved.iconHover
                : cfg.unsaved.icon,
          }}
        >
          {cfg.glyph === 'paw' ? <PawGlyph /> : <SakuraGlyph />}
        </svg>
      </button>
    </span>
  );
}
