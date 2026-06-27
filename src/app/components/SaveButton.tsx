'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isSaved as isSalonSaved, toggleSaved as toggleSalon, SAVED_SALONS_EVENT } from '@/lib/savedSalons';
import {
  isTherapistSaved,
  toggleTherapist,
  SAVED_THERAPISTS_EVENT,
} from '@/lib/savedTherapists';

// ── 演出スタイルをコンポーネントに同梱（どのページで使っても効くようにする） ──
// globals.css 等のページ別CSSに依存せず、SaveButton が初めて使われた時点で <style> を head へ1度だけ注入する。
const FX_STYLE_ID = 'save-button-fx-styles';
const FX_CSS = `
@keyframes save-pop {
  0% { transform: scale(1); } 40% { transform: scale(1.3); }
  70% { transform: scale(0.93); } 100% { transform: scale(1); }
}
.save-fx-pop { animation: save-pop 0.42s ease; transform-origin: center; }
@keyframes save-burst {
  from { transform: translate(-50%, -50%) scale(0.3) rotate(0deg); opacity: 1; }
  to { transform: translate(calc(-50% + var(--p-x)), calc(-50% + var(--p-y))) scale(1.1) rotate(var(--p-rot, 200deg)); opacity: 0; }
}
@keyframes save-flutter {
  from { transform: translate(-50%, -50%) scale(0.3) rotate(0deg); opacity: 1; }
  to { transform: translate(calc(-50% + var(--p-x)), calc(-50% + var(--p-y))) scale(1.05) rotate(var(--p-rot, 90deg)); opacity: 0; }
}
.save-fx-particle { position: absolute; left: 50%; top: 50%; pointer-events: none; }
.save-fx-burst { animation: save-burst 0.58s ease-out forwards; }
.save-fx-flutter { animation: save-flutter 0.72s ease-out forwards; }
@media (prefers-reduced-motion: reduce) {
  .save-fx-pop { animation: none; }
  .save-fx-particle { animation: none; opacity: 0; }
}
`;
function ensureFxStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(FX_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = FX_STYLE_ID;
  el.textContent = FX_CSS;
  document.head.appendChild(el);
}

// ── グリフ（すべて塗りで表現。輪郭線だと重なりが汚いため） ──
// 店舗＝肉球（paw）／セラピスト＝桜（sakura）の唯一のソース。会員ダッシュボード等でも参照する。
export const PawGlyph = ({ fill = 'currentColor' }: { fill?: string } = {}) => (
  <g fill={fill}>
    <ellipse cx="12" cy="17" rx="5.2" ry="4.6" />
    <ellipse cx="5.8" cy="11" rx="1.9" ry="2.5" transform="rotate(-18 5.8 11)" />
    <ellipse cx="9.7" cy="7.6" rx="2" ry="2.7" transform="rotate(-7 9.7 7.6)" />
    <ellipse cx="14.3" cy="7.6" rx="2" ry="2.7" transform="rotate(7 14.3 7.6)" />
    <ellipse cx="18.2" cy="11" rx="1.9" ry="2.5" transform="rotate(18 18.2 11)" />
  </g>
);

const SAKURA_PETAL = 'M12 12C9 12 7.5 6.5 9 4 10 2.5 11 4.5 12 5.5 13 4.5 14 2.5 15 4 16.5 6.5 15 12 12 12Z';
export const SakuraGlyph = ({ fill = 'currentColor' }: { fill?: string } = {}) => (
  <g fill={fill}>
    {[0, 72, 144, 216, 288].map(deg => (
      <path key={deg} d={SAKURA_PETAL} transform={`rotate(${deg} 12 12)`} />
    ))}
  </g>
);

// 単一花びら（フラッター粒用）。
const PetalGlyph = () => <path d="M12 4C8 8 8 16 12 20 16 16 16 8 12 4Z" fill="currentColor" />;

// ── パーティクルの飛び先（共通生成。形と回転・距離・アニメ名だけ variant で差し替え） ──
// paw: 8個・放射状・距離30〜39px・回転控えめ。
const BURST_JITTER = [0.12, -0.16, 0.09, -0.06, 0.14, -0.11, 0.07, -0.1];
const BURST_PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI * 2 / 8) * i + BURST_JITTER[i];
  const dist  = 30 + (i % 4) * 3;
  return { x: Math.round(Math.cos(angle) * dist), y: Math.round(Math.sin(angle) * dist), rot: 24 + i * 4 };
});
// sakura: 8枚・放射状・距離30〜40px・ひらひら回転（-40〜160deg程度）。
const FLUTTER_ROT = [120, -30, 95, 40, 150, -40, 65, 110];
const FLUTTER_PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI * 2 / 8) * i + BURST_JITTER[i];
  const dist  = 30 + (i % 4) * 3.3;
  return { x: Math.round(Math.cos(angle) * dist), y: Math.round(Math.sin(angle) * dist), rot: FLUTTER_ROT[i] };
});

// ── バリアント別の配色・グリフ・粒 ──
// 未保存は共通（白丸/薄グレー枠/グレー塗り）。保存・ホバー枠・粒の色を variant 別に持つ。
// paw（店舗）＝フクエスのブランドグラデ（オレンジ→マゼンタ）、sakura（セラピスト）＝紫。
// paw のアイコン色は VARIANTS.brandIcon=true 側でブランドグラデのSVG塗りに差し替えるため、
// ここの icon/iconHover は paw では実質未使用（型の互換のため残す）。
const BRAND_GRADIENT = 'linear-gradient(95deg,#FB923C,#DB2777)';
const PINK = {
  unsaved: { bg: '#FFFFFF', border: '#E5E7EB', borderHover: '#FDBA74', icon: '#9CA3AF', iconHover: '#DB2777' },
  saved:   { bg: BRAND_GRADIENT, border: '#DB2777', icon: '#FFFFFF' },
} as const;
const PURPLE = {
  unsaved: { bg: '#FFFFFF', border: '#E5E7EB', borderHover: '#D8B4FE', icon: '#9CA3AF', iconHover: '#EC4899' },
  saved:   { bg: '#A855F7', border: '#A855F7', icon: '#FFFFFF' },
} as const;
const VARIANTS = {
  paw: {
    Glyph: PawGlyph, Particle: PawGlyph, particles: BURST_PARTICLES,
    particleSize: 11, animClass: 'save-fx-burst', colors: PINK, particleColor: '#DB2777',
    brandIcon: true,
  },
  sakura: {
    Glyph: SakuraGlyph, Particle: PetalGlyph, particles: FLUTTER_PARTICLES,
    particleSize: 12, animClass: 'save-fx-flutter', colors: PURPLE, particleColor: '#A855F7',
    brandIcon: false,
  },
} as const;

const FX_DURATION_MS = 740; // 粒の生存時間（アニメ最長0.72s＋余白）。これを過ぎたら必ず除去。

export type SaveItem = { id: number; name: string; salonId?: number };

// 汎用の保存ボタン（円・ポップ＋パーティクル演出・hover配色）。
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
  // 保存した瞬間のクリック演出。保存済みに切り替わったときだけ +1。
  const [fxKey, setFxKey] = useState(0);
  const [fxOn, setFxOn] = useState(false); // 粒の表示中フラグ（740ms後に false にして必ず除去）

  const eventName = kind === 'salon' ? SAVED_SALONS_EVENT : SAVED_THERAPISTS_EVENT;

  useEffect(() => {
    ensureFxStyles();
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

  // 保存のたびに：円のポップを ref＋リフローで再生し、粒を表示→740ms後に確実に除去。
  useEffect(() => {
    if (fxKey === 0) return;
    const el = buttonRef.current;
    if (el) {
      el.classList.remove('save-fx-pop');
      void el.offsetWidth; // 強制リフローでアニメをリセット
      el.classList.add('save-fx-pop');
    }
    setFxOn(true);
    const t = window.setTimeout(() => setFxOn(false), FX_DURATION_MS);
    return () => window.clearTimeout(t); // 連打時は前のタイマーを破棄して残留を防ぐ
  }, [fxKey]);

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
    if (next) setFxKey(k => k + 1);
  };

  const cfg = VARIANTS[variant];
  const c = cfg.colors;
  const isSavedNow = mounted && saved;
  const iconSize = Math.round(size * (18 / 33)); // 既定33pxでアイコン18px相当
  const iconColor = isSavedNow ? c.saved.icon : hovered ? c.unsaved.iconHover : c.unsaved.icon;
  // paw（店舗）はブランドグラデのSVG塗りに差し替える：
  //   未保存＝白丸にグラデ肉球（url(#grad)）／保存済み＝グラデ丸に白抜き肉球。
  // 同一ページに複数描画されるため linearGradient の id は useId で一意化する。
  const gradId = useId();
  const iconFill = cfg.brandIcon
    ? (isSavedNow ? '#FFFFFF' : `url(#${gradId})`)
    : undefined; // sakura は従来どおり currentColor（iconColor）で描画。

  return (
    // ラッパ：演出をボタンの周囲に出すため relative + overflow:visible。
    <span className="relative inline-flex flex-shrink-0" style={{ overflow: 'visible' }}>
      {/* 粒：保存した瞬間のみ。単一のキー付きラッパで再マウントして毎回最初から再生。
          740ms 後に fxOn=false で必ず除去する（蓄積させない）。粒はボタンより前面。 */}
      {fxOn && (
        <span
          key={fxKey}
          aria-hidden="true"
          className="absolute inset-0"
          style={{ zIndex: 2, overflow: 'visible', pointerEvents: 'none', color: cfg.particleColor }}
        >
          {cfg.particles.map((p, i) => (
            <svg
              key={i}
              className={`save-fx-particle ${cfg.animClass}`}
              width={cfg.particleSize}
              height={cfg.particleSize}
              viewBox="0 0 24 24"
              style={{ ['--p-x']: `${p.x}px`, ['--p-y']: `${p.y}px`, ['--p-rot']: `${p.rot}deg` } as React.CSSProperties}
            >
              <cfg.Particle />
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
          // brandIcon（店舗ロゴ）はリング・地色をSVG側で描くので、ボタンの地色・枠線は持たない。
          background: cfg.brandIcon ? 'transparent' : (isSavedNow ? c.saved.bg : c.unsaved.bg),
          border: cfg.brandIcon
            ? 'none'
            : `1.5px solid ${
                isSavedNow
                  ? c.saved.border
                  : hovered
                    ? c.unsaved.borderHover
                    : c.unsaved.border
              }`,
        }}
      >
        {cfg.brandIcon ? (
          // フクエス正式ロゴ（グラデのリング＋肉球）。
          //   未保存   ＝ 白い内側＋グラデのリング＋グラデ肉球。
          //   保存済み ＝ グラデのベタ塗り円＋白抜き肉球（リングは塗りに溶かす方針を採用）。
          // 肉球は既存 PawGlyph を流用し、内側に余白を取って中央配置（12/24 ≒ 内径の約59%）。
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FB923C" />
                <stop offset="100%" stopColor="#DB2777" />
              </linearGradient>
            </defs>
            {isSavedNow ? (
              <>
                <circle cx="12" cy="12" r="11.8" fill={`url(#${gradId})`} />
                <svg x="6" y="6" width="12" height="12" viewBox="0 0 24 24">
                  <PawGlyph fill="#FFFFFF" />
                </svg>
              </>
            ) : (
              <>
                {/* 白い内側（どの背景でもロゴらしい抜け感を出す）＋細いグラデのリング。 */}
                <circle cx="12" cy="12" r="11.8" fill="#FFFFFF" />
                <circle cx="12" cy="12" r="11" fill="none" stroke={`url(#${gradId})`} strokeWidth="1.6" />
                <svg x="6" y="6" width="12" height="12" viewBox="0 0 24 24">
                  <PawGlyph fill={`url(#${gradId})`} />
                </svg>
              </>
            )}
          </svg>
        ) : (
          // sakura（セラピスト）は従来どおり：CSS円の中に currentColor のグリフ。
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" style={{ color: iconColor }}>
            <cfg.Glyph fill={iconFill} />
          </svg>
        )}
      </button>
    </span>
  );
}
