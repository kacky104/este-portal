'use client';

import { useState, useRef, useEffect } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINS  = [0, 15, 30, 45];
const ITEM_H = 48;

function Drum({ values, selected, onSelect, fmt }: {
  values:   number[];
  selected: number;
  onSelect: (v: number) => void;
  fmt:      (v: number) => string;
}) {
  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync scroll position when modal first opens
  useEffect(() => {
    const idx = values.indexOf(selected);
    if (ref.current && idx >= 0) {
      ref.current.scrollTop = idx * ITEM_H;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const v = values[Math.max(0, Math.min(idx, values.length - 1))];
      if (v !== undefined) onSelect(v);
    }, 80);
  };

  const handleClick = (v: number) => {
    onSelect(v);
    const idx = values.indexOf(v);
    ref.current?.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  };

  return (
    <div className="relative" style={{ height: ITEM_H * 5, width: 56 }}>
      {/* Center highlight bar */}
      <div
        className="absolute inset-x-0 pointer-events-none z-10 border-t border-b border-pink-200 bg-pink-50/70"
        style={{ top: ITEM_H * 2, height: ITEM_H }}
      />
      {/* Fade top */}
      <div className="absolute inset-x-0 top-0 pointer-events-none z-10 h-16 bg-gradient-to-b from-white to-transparent" />
      {/* Fade bottom */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-10 h-16 bg-gradient-to-t from-white to-transparent" />

      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll"
        style={{
          scrollSnapType: 'y mandatory',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        } as React.CSSProperties}
      >
        {/* Top spacer */}
        <div style={{ height: ITEM_H * 2 }} />

        {values.map(v => (
          <div
            key={v}
            onClick={() => handleClick(v)}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
            className={`flex items-center justify-center text-xl font-black cursor-pointer select-none transition-colors ${
              v === selected ? 'text-pink-600' : 'text-slate-300 hover:text-slate-400'
            }`}
          >
            {fmt(v)}
          </div>
        ))}

        {/* Bottom spacer */}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  );
}

function parseValue(value: string) {
  const def = { sH: 10, sM: 0, eH: 22, eM: 0 };
  if (!value) return def;
  const clean = value.replace(/翌/g, '');
  const parts = clean.split(/[〜～~]/);
  if (parts.length < 2) return def;
  const pt = (s: string) => {
    const [h, m] = s.trim().split(':').map(Number);
    return { h: isNaN(h) ? 0 : h % 24, m: isNaN(m) ? 0 : Math.round(m / 15) * 15 % 60 };
  };
  const s = pt(parts[0]);
  const e = pt(parts[1]);
  return { sH: s.h, sM: s.m, eH: e.h, eM: e.m };
}

function buildValue(sH: number, sM: number, eH: number, eM: number): string {
  const pad  = (n: number) => String(n).padStart(2, '0');
  const prefix = (eH * 60 + eM) < (sH * 60 + sM) ? '翌' : '';
  return `${sH}:${pad(sM)}〜${prefix}${eH}:${pad(eM)}`;
}

export function TimeRangePicker({ value, onChange }: {
  value:    string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sH, setSH] = useState(10);
  const [sM, setSM] = useState(0);
  const [eH, setEH] = useState(22);
  const [eM, setEM] = useState(0);

  const handleOpen = () => {
    const p = parseValue(value);
    setSH(p.sH); setSM(p.sM);
    setEH(p.eH); setEM(p.eM);
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(buildValue(sH, sM, eH, eM));
    setOpen(false);
  };

  const isNextDay = (eH * 60 + eM) < (sH * 60 + sM);
  const preview   = buildValue(sH, sM, eH, eM);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-pink-200 bg-pink-50/50 text-pink-600 text-xs font-bold hover:bg-pink-100/60 transition-colors whitespace-nowrap flex-shrink-0"
      >
        🕐 選択
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />

          <div className="relative bg-white w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-800 text-sm">時間帯を選択</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Preview */}
            <div className="pt-4 pb-1 text-center">
              <span className="text-2xl font-black text-pink-600">{preview}</span>
              {isNextDay && (
                <span className="ml-2 text-xs font-bold text-pink-400 bg-pink-50 border border-pink-100 px-2 py-0.5 rounded-full">翌日まで</span>
              )}
            </div>

            {/* Drums */}
            <div className="px-4 py-2 flex items-center justify-center gap-1">
              {/* Start time */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 mb-1">開始</span>
                <div className="flex items-center gap-0.5">
                  <Drum values={HOURS} selected={sH} onSelect={setSH} fmt={v => String(v)} />
                  <span className="text-slate-300 font-black text-xl pb-1 px-0.5">:</span>
                  <Drum values={MINS}  selected={sM} onSelect={setSM} fmt={v => String(v).padStart(2, '0')} />
                </div>
              </div>

              <span className="text-slate-300 font-black text-2xl pb-4 mx-1">〜</span>

              {/* End time */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 mb-1">
                  終了{isNextDay ? <span className="text-pink-400 ml-0.5">（翌）</span> : ''}
                </span>
                <div className="flex items-center gap-0.5">
                  <Drum values={HOURS} selected={eH} onSelect={setEH} fmt={v => String(v)} />
                  <span className="text-slate-300 font-black text-xl pb-1 px-0.5">:</span>
                  <Drum values={MINS}  selected={eM} onSelect={setEM} fmt={v => String(v).padStart(2, '0')} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold hover:bg-slate-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
              >
                決定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
