// サロンページのテーマカラー定義（/mypage の選択UIと /salon/[id] の表示で共用）

export type ThemeKey = 'white' | 'black' | 'pink' | 'blue' | 'red' | 'purple';

export type SalonTheme = {
  key:   ThemeKey;
  label: string;
  bg:    string;
  text:  string;
  /** カラーサンプル用のアクセント色（枠線など） */
  swatchBorder: string;
};

export const SALON_THEMES: SalonTheme[] = [
  { key: 'white',  label: 'ホワイト', bg: '#ffffff', text: '#0f172a', swatchBorder: '#e2e8f0' },
  { key: 'black',  label: 'ブラック', bg: '#1a1a1a', text: '#f1f5f9', swatchBorder: '#1a1a1a' },
  { key: 'pink',   label: 'ピンク',   bg: '#fff0f5', text: '#0f172a', swatchBorder: '#fbcfe8' },
  { key: 'blue',   label: 'ブルー',   bg: '#f0f5ff', text: '#0f172a', swatchBorder: '#bfdbfe' },
  { key: 'red',    label: 'レッド',   bg: '#fff5f5', text: '#0f172a', swatchBorder: '#fecaca' },
  { key: 'purple', label: 'パープル', bg: '#f5f0fe', text: '#0f172a', swatchBorder: '#ddd6fe' },
];

const DEFAULT_THEME = SALON_THEMES[0];

export function getTheme(key: string | null | undefined): SalonTheme {
  return SALON_THEMES.find(t => t.key === key) ?? DEFAULT_THEME;
}
