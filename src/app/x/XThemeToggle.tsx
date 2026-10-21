'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getTheme } from '@/app/lib/themes';

// fukuX 背景テーマ切替（グラデ ⇄ 白 ⇄ 壁紙）。選択は localStorage に保存し、#x-root の属性を即時切替（リロード不要）。
// 属性の初期反映は layout.tsx のインラインスクリプト（FOUC対策）が担うため、ここは現状追従と更新のみ。
// ★ 第1600便（2026-10-21・カッキーさん）: /cast の着せ替えと同じ壁紙（theme_wallpapers）を選べるようにした。
//   ・壁紙のときは文字・カードの色は「白」のセットを使い回す（data-x-theme='white'）＋ data-x-wp='1'。
//   ・背景は「壁紙の地の色を半透明に重ねた壁紙」（/cast・店舗ページと同じ薄め方。少しだけ薄め）。
//   ・黒は白の色セットと合わないので出さない。壁紙が登録されていない色は出さない。
//   ・保存は localStorage（'fukux-theme' と 'fukux-wp'＝{k,u,c}）。端末ごと（今までどおり）。DB は使わない。
const KEY = 'fukux-theme';
const WP_KEY = 'fukux-wp';
type Base = 'gradient' | 'white';

const WP_CHOICES: { key: string; label: string }[] = [
  { key: 'pink', label: 'ピンク' },
  { key: 'yellow', label: '黄色' },
  { key: 'blue', label: '青' },
  { key: 'red', label: '赤' },
  { key: 'purple', label: '紫' },
  { key: 'green', label: 'グリーン' },
  { key: 'gold', label: 'ゴールド' },
  { key: 'silver', label: 'シルバー' },
];

// 壁紙を #x-root に当てる（layout.tsx の THEME_INIT と同じ作り）。
export function applyXWallpaper(root: HTMLElement, url: string | null, color: string | null) {
  if (url && color) {
    root.style.setProperty('--x-wp-bg', `linear-gradient(${color}8C, ${color}8C), url("${url}")`);
    root.style.setProperty('--x-wp-color', color);
    root.setAttribute('data-x-wp', '1');
  } else {
    root.style.removeProperty('--x-wp-bg');
    root.style.removeProperty('--x-wp-color');
    root.removeAttribute('data-x-wp');
  }
}

function readCurrent(): string {
  if (typeof document === 'undefined') return 'gradient';
  try {
    const wp = localStorage.getItem(WP_KEY);
    if (wp) {
      const k = (JSON.parse(wp) as { k?: string }).k;
      if (k) return `wp:${k}`;
    }
  } catch { /* 読めなければ属性で判断 */ }
  const cur = document.getElementById('x-root')?.getAttribute('data-x-theme');
  return cur === 'white' ? 'white' : 'gradient';
}

export function XThemeToggle() {
  // SSR/初回ハイドレーションは既定 'gradient' に合わせ、マウント後に実値へ同期（不一致を避ける）。
  const [current, setCurrent] = useState<string>('gradient');
  const [wallpapers, setWallpapers] = useState<Record<string, string>>({});

  useEffect(() => {
    setCurrent(readCurrent());
    let alive = true;
    createClient().from('theme_wallpapers').select('theme_key, image_url').then(({ data }) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as { theme_key: string | null; image_url: string | null }[]) {
        if (r.theme_key && r.image_url) map[r.theme_key] = r.image_url;
      }
      setWallpapers(map);
    });
    return () => { alive = false; };
  }, []);

  const applyBase = (t: Base) => {
    setCurrent(t);
    try {
      localStorage.setItem(KEY, t);
      localStorage.removeItem(WP_KEY);
    } catch { /* localStorage 不可環境は無視（その場の切替のみ有効） */ }
    const root = document.getElementById('x-root');
    if (!root) return;
    root.setAttribute('data-x-theme', t);
    applyXWallpaper(root, null, null);
  };

  const applyWp = (k: string) => {
    const url = wallpapers[k];
    if (!url) return;
    const color = getTheme(k).bg;
    setCurrent(`wp:${k}`);
    try {
      localStorage.setItem(KEY, 'white');
      localStorage.setItem(WP_KEY, JSON.stringify({ k, u: url, c: color }));
    } catch { /* その場の切替のみ有効 */ }
    const root = document.getElementById('x-root');
    if (!root) return;
    root.setAttribute('data-x-theme', 'white');
    applyXWallpaper(root, url, color);
  };

  const choices = WP_CHOICES.filter((c) => wallpapers[c.key]);

  return (
    <div className="px-3 pt-2 pb-1">
      <p className="text-[11px] font-bold text-[color:var(--x-text-muted)] mb-1.5 px-1">背景テーマ</p>
      <div className="flex gap-1 p-1 rounded-xl bg-[color:var(--x-inset)]">
        {(
          [
            ['gradient', 'グラデ'],
            ['white', '白'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => applyBase(key)}
            aria-pressed={current === key}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              current === key ? 'bg-[color:var(--x-surface)] text-[color:var(--x-accent)] shadow-sm' : 'text-[color:var(--x-text-muted)] hover:text-[color:var(--x-text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {choices.length > 0 && (
        <>
          <p className="text-[11px] font-bold text-[color:var(--x-text-muted)] mt-3 mb-1.5 px-1">壁紙</p>
          <div className="grid grid-cols-4 gap-x-1 gap-y-2.5 px-0.5">
            {choices.map((c) => {
              const on = current === `wp:${c.key}`;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => applyWp(c.key)}
                  aria-pressed={on}
                  aria-label={`壁紙：${c.label}`}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`block w-10 h-10 rounded-full border-2 transition-shadow ${on ? 'border-[color:var(--x-accent)] ring-2 ring-[color:var(--x-accent)] ring-offset-1' : 'border-[color:var(--x-border-strong)]'}`}
                    style={{ backgroundImage: `url("${wallpapers[c.key]}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                  />
                  <span className={`text-[10px] font-bold leading-none ${on ? 'text-[color:var(--x-accent)]' : 'text-[color:var(--x-text-muted)]'}`}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
