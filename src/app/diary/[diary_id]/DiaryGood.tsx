'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// ★ 第1591便（2026-10-21・カッキーさん）: 写メ日記の「グッド」ボタン（親指・枠なし）。
//   ・誰でも押せる（ログイン不要）。1人1回・もう一度押すと取り消し。数字を出す（0 のときは親指だけ）。
//   ・「1人」はブラウザごとのランダムなUUID（localStorage）で数える。
//   ・押した瞬間は保存ボタン（SaveButton）と同じ演出：ポンと弾む＋小さな親指が散る。
//   ・DB は RPC 2本（get_diary_goods / toggle_diary_good）だけ。追加SQL_第1591便。

const VOTER_KEY = 'fukues_diary_voter';

export function getVoterKey(): string | null {
  try {
    let v = localStorage.getItem(VOTER_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(VOTER_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}

export type GoodState = { count: number; mine: boolean };

const FX_STYLE_ID = 'diary-good-fx-styles';
const FX_CSS = `
@keyframes dg-pop { 0%{transform:scale(1)} 40%{transform:scale(1.35)} 70%{transform:scale(0.92)} 100%{transform:scale(1)} }
.dg-pop { animation: dg-pop 0.42s ease; transform-origin: center; }
@keyframes dg-burst {
  from { transform: translate(-50%,-50%) scale(0.3) rotate(0deg); opacity: 1; }
  to { transform: translate(calc(-50% + var(--p-x)), calc(-50% + var(--p-y))) scale(1) rotate(var(--p-rot)); opacity: 0; }
}
.dg-particle { position:absolute; left:50%; top:50%; pointer-events:none; animation: dg-burst 0.6s ease-out forwards; }
@media (prefers-reduced-motion: reduce) { .dg-pop{animation:none} .dg-particle{animation:none;opacity:0} }
`;
function ensureFxStyles() {
  if (typeof document === 'undefined' || document.getElementById(FX_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = FX_STYLE_ID;
  el.textContent = FX_CSS;
  document.head.appendChild(el);
}

const JITTER = [0.12, -0.16, 0.09, -0.06, 0.14, -0.11, 0.07, -0.1];
const PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const a = (Math.PI * 2 / 8) * i + JITTER[i];
  const d = 34 + (i % 4) * 3;
  return { x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d), rot: (i % 2 ? -1 : 1) * (20 + i * 6) };
});
const FX_MS = 700;

const THUMB = 'M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V6a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1-2 2h-7a3 3 0 0 1-3-3';

function ThumbIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={THUMB} />
    </svg>
  );
}

export function DiaryGoodButton({
  supabase,
  diaryId,
  state,
  onChange,
  size = 22,
}: {
  supabase: SupabaseClient;
  diaryId: string;
  state: GoodState;
  onChange: (next: GoodState) => void;
  size?: number;
}) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const [fxKey, setFxKey] = useState(0);
  const [fxOn, setFxOn] = useState(false);
  const busy = useRef(false);

  useEffect(() => { ensureFxStyles(); }, []);

  useEffect(() => {
    if (fxKey === 0) return;
    const el = iconRef.current;
    if (el) { el.classList.remove('dg-pop'); void el.offsetWidth; el.classList.add('dg-pop'); }
    const t = window.setTimeout(() => setFxOn(false), FX_MS);
    return () => window.clearTimeout(t);
  }, [fxKey]);

  const handleClick = async () => {
    if (busy.current) return;
    const voter = getVoterKey();
    if (!voter) return;
    busy.current = true;
    const prev = state;
    const optimistic: GoodState = { mine: !prev.mine, count: Math.max(0, prev.count + (prev.mine ? -1 : 1)) };
    onChange(optimistic);
    if (optimistic.mine) { setFxOn(true); setFxKey((k) => k + 1); }
    const { data, error } = await supabase.rpc('toggle_diary_good', { p_diary_id: diaryId, p_voter_key: voter });
    busy.current = false;
    if (error) { onChange(prev); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) onChange({ mine: !!row.good, count: Number(row.good_count) || 0 });
  };

  const color = state.mine ? '#DB2777' : '#C0577F';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={state.mine}
      aria-label={state.mine ? `グッドを取り消す（${state.count}）` : `グッド（${state.count}）`}
      className="inline-flex items-center gap-1.5 py-1 pl-1 select-none"
      style={{ color, WebkitTapHighlightColor: 'transparent' }}
    >
      <span className="relative inline-flex" style={{ overflow: 'visible' }}>
        {fxOn && (
          <span key={fxKey} aria-hidden="true" className="absolute inset-0" style={{ overflow: 'visible', pointerEvents: 'none', color: '#EC4899' }}>
            {PARTICLES.map((p, i) => (
              <svg key={i} className="dg-particle" width={Math.round(size * 0.45)} height={Math.round(size * 0.45)} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round"
                style={{ ['--p-x']: `${p.x}px`, ['--p-y']: `${p.y}px`, ['--p-rot']: `${p.rot}deg` } as React.CSSProperties}>
                <path d={THUMB} />
              </svg>
            ))}
          </span>
        )}
        <span ref={iconRef} className="inline-flex"><ThumbIcon size={size} filled={state.mine} /></span>
      </span>
      {state.count > 0 && (
        <span className="tabular-nums" style={{ fontSize: size >= 28 ? '17px' : '14px', fontWeight: state.mine ? 700 : 500 }}>{state.count}</span>
      )}
    </button>
  );
}
