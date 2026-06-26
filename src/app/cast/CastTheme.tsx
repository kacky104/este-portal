'use client';

// /cast の着せ替え：背景適用ラッパー（CastThemeProvider）と選択UI（CastThemePicker）。
// context で連携し、ピッカーで選ぶと即座に背景へ反映＋サーバー（therapists.cast_theme）へ保存する。
// 保存は本人検証付きの Server Action（setCastTheme）経由。再ログイン時は page.tsx が cast_theme を読み initialTheme で渡す。

import { createContext, useContext, useState, useTransition } from 'react';
import { CAST_THEMES, getCastTheme, type CastThemeKey } from './castThemes';
import { setCastTheme } from '@/app/actions/castTheme';

type CastThemeCtx = {
  themeKey: CastThemeKey;
  setThemeKey: (k: CastThemeKey) => void;
  saving: boolean;
};

const CastThemeContext = createContext<CastThemeCtx | null>(null);

export function CastThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: string | null;
  children: React.ReactNode;
}) {
  const [themeKey, setKey] = useState<CastThemeKey>(getCastTheme(initialTheme).key);
  const [isPending, startTransition] = useTransition();

  const setThemeKey = (k: CastThemeKey) => {
    setKey(k); // 即時に背景反映
    startTransition(async () => {
      const res = await setCastTheme(k);
      // 保存失敗時は静かにログのみ（着せ替えはお遊び機能のため操作は止めない）。
      if (!res.ok) console.warn('[castTheme] save failed:', res.error);
    });
  };

  const theme = getCastTheme(themeKey);

  return (
    <CastThemeContext.Provider value={{ themeKey, setThemeKey, saving: isPending }}>
      <div className={`min-h-screen ${theme.wrapperClass}`} style={theme.wrapperStyle}>
        {children}
      </div>
    </CastThemeContext.Provider>
  );
}

export function CastThemePicker() {
  const ctx = useContext(CastThemeContext);
  if (!ctx) return null;
  const { themeKey, setThemeKey, saving } = ctx;

  return (
    <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5">
      <p className="text-[11px] font-bold text-slate-400 mb-3">
        ページの色を選ぶ
        {saving && <span className="ml-2 text-pink-400 font-normal">保存中...</span>}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {CAST_THEMES.map((t) => {
          const selected = t.key === themeKey;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setThemeKey(t.key)}
              aria-pressed={selected}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span
                className={`w-10 h-10 rounded-full border transition-all ${t.swatchClass ?? ''} ${
                  selected
                    ? 'ring-2 ring-pink-500 ring-offset-2 border-transparent'
                    : 'border-slate-200 group-hover:border-pink-300'
                }`}
                style={t.swatchStyle}
              />
              <span className={`text-[11px] font-bold ${selected ? 'text-pink-600' : 'text-slate-500'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
