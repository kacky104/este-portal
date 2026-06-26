// /cast（セラピスト本人ページ）の着せ替えテーマ定義（一元管理）。
// UIの選択肢表示（CastThemePicker）と、実際の背景適用（CastThemeProvider）の両方でこれを参照する。
// 保存値（therapists.cast_theme）：null/未設定 = デフォルト。それ以外はキー文字列（'black' 等）。
//
// 方針：ページ全体の背景にテーマを適用。挨拶ブロック・日記などの白カードはそのまま背景の上に乗る。
//       濃い背景（black / gradient）はカード外の地の文字が読めるよう明るい文字色を、
//       淡い背景は濃い文字色を wrapperClass に持たせる（カード内は各コンポーネント側の従来配色を維持）。

export type CastThemeKey =
  | 'default' | 'black' | 'pink' | 'yellow' | 'blue' | 'red' | 'purple' | 'gold' | 'gradient';

export type CastTheme = {
  key: CastThemeKey;
  label: string;
  /** min-h-screen ラッパーに付ける背景＋地の文字色クラス */
  wrapperClass: string;
  /** gradient 等、クラスで表せない背景はインラインstyleで */
  wrapperStyle?: Record<string, string>;
  /** ピッカーの色見本（スウォッチ） */
  swatchClass?: string;
  swatchStyle?: Record<string, string>;
};

// フクエスのブランドグラデーション（オレンジ→マゼンタ）。
const BRAND_GRADIENT = 'linear-gradient(135deg, #FB923C 0%, #DB2777 100%)';
const GOLD_SWATCH = 'linear-gradient(135deg, #e8d28a 0%, #c9a227 100%)';

export const CAST_THEMES: CastTheme[] = [
  { key: 'default',  label: 'なし',          wrapperClass: 'bg-slate-50 text-slate-800',      swatchClass: 'bg-slate-100' },
  { key: 'black',    label: '黒',            wrapperClass: 'bg-neutral-900 text-neutral-100', swatchClass: 'bg-neutral-900' },
  { key: 'pink',     label: 'ピンク',        wrapperClass: 'bg-pink-100 text-slate-800',      swatchClass: 'bg-pink-300' },
  { key: 'yellow',   label: '黄色',          wrapperClass: 'bg-amber-100 text-slate-800',     swatchClass: 'bg-amber-300' },
  { key: 'blue',     label: '青',            wrapperClass: 'bg-sky-100 text-slate-800',       swatchClass: 'bg-sky-300' },
  { key: 'red',      label: '赤',            wrapperClass: 'bg-rose-100 text-slate-800',      swatchClass: 'bg-rose-300' },
  { key: 'purple',   label: '紫',            wrapperClass: 'bg-purple-100 text-slate-800',    swatchClass: 'bg-purple-300' },
  { key: 'gold',     label: 'ゴールド',      wrapperClass: 'bg-[#f4ecd0] text-slate-800',     swatchStyle: { background: GOLD_SWATCH } },
  { key: 'gradient', label: 'グラデーション', wrapperClass: 'text-white', wrapperStyle: { backgroundImage: BRAND_GRADIENT }, swatchStyle: { backgroundImage: BRAND_GRADIENT } },
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
