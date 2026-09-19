'use client';

// /cast の着せ替え：背景適用ラッパー（CastThemeProvider）と選択UI（CastThemePicker）。
// context で連携し、ピッカーで選ぶと即座に背景へ反映＋サーバー（therapists.cast_theme）へ保存する。
// 保存は本人検証付きの Server Action（setCastTheme）経由。再ログイン時は page.tsx が cast_theme を読み initialTheme で渡す。

import { CastCardTitle } from './CastCardTitle';
import { createContext, useContext, useState, useTransition } from 'react';
import { CAST_THEMES, getCastTheme, type CastThemeKey } from './castThemes';
import { setCastTheme } from '@/app/actions/castTheme';
import { getTheme } from '@/app/lib/themes';

type CastThemeCtx = {
  themeKey: CastThemeKey;
  setThemeKey: (k: CastThemeKey) => void;
  saving: boolean;
  /** ★ 第493便: 店舗テーマの壁紙（theme_key → 画像URL） */
  wallpapers: Record<string, string>;
};

const CastThemeContext = createContext<CastThemeCtx | null>(null);

export function CastThemeProvider({
  initialTheme,
  wallpapers = {},
  children,
}: {
  initialTheme: string | null;
  /** ★ 第493便: 管理画面で登録したテーマ壁紙（theme_wallpapers）。page.tsx が読んで渡す */
  wallpapers?: Record<string, string>;
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
  // ★ 第493便: 店舗詳細ページと同じ敷き方（テーマの地の色を85%かぶせて、壁紙を薄く見せる）
  const wp = wallpapers[theme.wallpaperKey];
  const bg = getTheme(theme.wallpaperKey).bg;
  const style: React.CSSProperties = wp
    ? { ...theme.wrapperStyle, backgroundColor: bg, backgroundImage: `linear-gradient(${bg}D9, ${bg}D9), url(${wp})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
    : { ...theme.wrapperStyle };

  return (
    <CastThemeContext.Provider value={{ themeKey, setThemeKey, saving: isPending, wallpapers }}>
      <div className={`min-h-screen ${theme.wrapperClass}`} style={style}>
        {children}
      </div>
    </CastThemeContext.Provider>
  );
}

export function CastThemePicker() {
  const ctx = useContext(CastThemeContext);
  if (!ctx) return null;
  const { themeKey, setThemeKey, saving, wallpapers } = ctx;

  return (
    <div className="bg-white/85 backdrop-blur-sm rounded-3xl border border-pink-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <CastCardTitle icon="palette">ページの色を選ぶ</CastCardTitle>
        {saving && <span className="text-[11px] text-pink-400">保存中...</span>}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {CAST_THEMES.map((t) => {
          const selected = t.key === themeKey;
          // ★ 第493便: 見本は壁紙の画像（無ければ今までの色）
          const wp = wallpapers[t.wallpaperKey];
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
                style={wp ? { backgroundImage: `url(${wp})`, backgroundSize: 'cover', backgroundPosition: 'center' } : t.swatchStyle}
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
