'use client';

import { useEffect, useState } from 'react';

// fukuX 背景テーマ切替（グラデ ⇄ 白）。選択は localStorage('fukux-theme') に保存し、
// #x-root の data-x-theme 属性を即時切替（CSSが出し分け＝リロード不要）。
// 属性の初期反映は layout.tsx のインラインスクリプト（FOUC対策）が担うため、ここは現状追従と更新のみ。
const KEY = 'fukux-theme';
type Theme = 'gradient' | 'white';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'gradient';
  const cur = document.getElementById('x-root')?.getAttribute('data-x-theme');
  return cur === 'white' ? 'white' : 'gradient';
}

export function XThemeToggle() {
  // SSR/初回ハイドレーションは既定 'gradient' に合わせ、マウント後に実値へ同期（不一致を避ける）。
  const [theme, setTheme] = useState<Theme>('gradient');
  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const apply = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* localStorage 不可環境は無視（その場の切替のみ有効） */
    }
    document.getElementById('x-root')?.setAttribute('data-x-theme', t);
  };

  return (
    <div className="px-3 pt-2 pb-1">
      <p className="text-[11px] font-bold text-slate-400 mb-1.5 px-1">背景テーマ</p>
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
        {(
          [
            ['gradient', 'グラデ'],
            ['white', '白'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => apply(key)}
            aria-pressed={theme === key}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              theme === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
