// /cast（セラピスト本人ページ）の着せ替えテーマ定義（一元管理）。
// UIの選択肢表示（CastThemePicker）と、実際の背景適用（CastThemeProvider）の両方でこれを参照する。
// 保存値（therapists.cast_theme）：null/未設定 = デフォルト。それ以外はキー文字列（'black' 等）。
//
// 方針：ページ全体の背景にテーマを適用。挨拶ブロック・日記などの白カードはそのまま背景の上に乗る。
//       濃い背景（black）はカード外の地の文字が読めるよう明るい文字色を、
//       淡い背景は濃い文字色を wrapperClass に持たせる（カード内は各コンポーネント側の従来配色を維持）。

import type { ThemeKey } from '@/app/lib/themes';

export type CastThemeKey =
  | 'default' | 'black' | 'pink' | 'yellow' | 'blue' | 'red' | 'purple' | 'gold' | 'gradient';

export type CastTheme = {
  key: CastThemeKey;
  label: string;
  /** min-h-screen ラッパーに付ける背景＋地の文字色クラス（壁紙が無いときの地の色もここ） */
  wrapperClass: string;
  /** クラスで表せない背景はインラインstyleで */
  wrapperStyle?: Record<string, string>;
  /** ピッカーの色見本（スウォッチ）。★ 壁紙があるときは壁紙の画像を優先して出す */
  swatchClass?: string;
  swatchStyle?: Record<string, string>;
  /**
   * ★ 第493便（2026-09-18・カッキーさん）: フクエスの店舗テーマ（theme_wallpapers.theme_key）のどれの壁紙を敷くか。
   *   ★ 壁紙は管理画面で登録したもの（店舗詳細ページと同じ画像・同じ薄め方）。★ 無ければ地の色だけ
   */
  wallpaperKey: ThemeKey;
};

const GOLD_SWATCH = 'linear-gradient(135deg, #e8d28a 0%, #c9a227 100%)';
const SILVER_SWATCH = 'linear-gradient(135deg, #f1f3f6 0%, #b8bec8 100%)';

// ★ 第493便: 「グラデーション」は【シルバー】に変えた。★ 保存値は 'gradient' のまま使う
//   （★ therapists.cast_theme の値を増やさない＝DBの作りを変えない。★ すでに選んでいる人はそのままシルバーになる）
export const CAST_THEMES: CastTheme[] = [
  { key: 'default',  label: '白',          wrapperClass: 'bg-white text-slate-800',         swatchClass: 'bg-white',       wallpaperKey: 'white' },
  { key: 'black',    label: '黒',          wrapperClass: 'bg-neutral-900 text-neutral-100', swatchClass: 'bg-neutral-900', wallpaperKey: 'black' },
  { key: 'pink',     label: 'ピンク',      wrapperClass: 'bg-pink-100 text-slate-800',      swatchClass: 'bg-pink-300',    wallpaperKey: 'pink' },
  { key: 'yellow',   label: '黄色',        wrapperClass: 'bg-amber-100 text-slate-800',     swatchClass: 'bg-amber-300',   wallpaperKey: 'yellow' },
  { key: 'blue',     label: '青',          wrapperClass: 'bg-sky-100 text-slate-800',       swatchClass: 'bg-sky-300',     wallpaperKey: 'blue' },
  { key: 'red',      label: '赤',          wrapperClass: 'bg-rose-100 text-slate-800',      swatchClass: 'bg-rose-300',    wallpaperKey: 'red' },
  { key: 'purple',   label: '紫',          wrapperClass: 'bg-purple-100 text-slate-800',    swatchClass: 'bg-purple-300',  wallpaperKey: 'purple' },
  { key: 'gold',     label: 'ゴールド',    wrapperClass: 'bg-[#f4ecd0] text-slate-800',     swatchStyle: { background: GOLD_SWATCH }, wallpaperKey: 'gold' },
  { key: 'gradient', label: 'シルバー',    wrapperClass: 'bg-[#f6f7f9] text-slate-800',     swatchStyle: { background: SILVER_SWATCH }, wallpaperKey: 'silver' },
];

export const DEFAULT_CAST_THEME = CAST_THEMES[0];

/** 保存値（null可・不明値可）から CastTheme を引く。null/未設定/不明は default。 */
export function getCastTheme(value: string | null | undefined): CastTheme {
  if (!value) return DEFAULT_CAST_THEME;
  return CAST_THEMES.find(t => t.key === value) ?? DEFAULT_CAST_THEME;
}

/** サーバー側バリデーション用：保存を許可するキー（default は null として保存）。 */
export const CAST_THEME_VALUES: string[] = CAST_THEMES
  .filter(t => t.key !== 'default')
  .map(t => t.key);
