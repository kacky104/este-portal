// サロンページのテーマカラー定義（/mypage の選択UIと /salon/[id] の表示で共用）

export type ThemeKey = 'white' | 'black' | 'pink' | 'blue' | 'red' | 'purple';

export type SalonTheme = {
  key:   ThemeKey;
  label: string;
  /** ページ全体の背景色 */
  bg:    string;
  /** ページのベース文字色 */
  text:  string;
  /** カード背景色 */
  card:  string;
  /** カード枠線色 */
  cardBorder: string;
  /** 見出し（強調）文字色 */
  heading: string;
  /** 本文・補助文字色 */
  body:  string;
  /** カラーサンプル用のアクセント色（枠線など） */
  swatchBorder: string;
};

export const SALON_THEMES: SalonTheme[] = [
  { key: 'white',  label: 'ホワイト', bg: '#ffffff', text: '#0f172a', card: '#ffffff', cardBorder: '#e2e8f0', heading: '#0f172a', body: '#475569', swatchBorder: '#e2e8f0' },
  { key: 'black',  label: 'ブラック', bg: '#1a1a1a', text: '#f1f5f9', card: '#262626', cardBorder: '#3f3f46', heading: '#f1f5f9', body: '#cbd5e1', swatchBorder: '#1a1a1a' },
  { key: 'pink',   label: 'ピンク',   bg: '#fff0f5', text: '#0f172a', card: '#ffe6ef', cardBorder: '#fbcfe8', heading: '#831843', body: '#475569', swatchBorder: '#fbcfe8' },
  { key: 'blue',   label: 'ブルー',   bg: '#f0f5ff', text: '#0f172a', card: '#e6efff', cardBorder: '#bfdbfe', heading: '#1e3a8a', body: '#475569', swatchBorder: '#bfdbfe' },
  { key: 'red',    label: 'レッド',   bg: '#ffe4e4', text: '#0f172a', card: '#ffdede', cardBorder: '#fca5a5', heading: '#7f1d1d', body: '#475569', swatchBorder: '#fca5a5' },
  { key: 'purple', label: 'パープル', bg: '#f5f0fe', text: '#0f172a', card: '#ece2fd', cardBorder: '#ddd6fe', heading: '#4c1d95', body: '#475569', swatchBorder: '#ddd6fe' },
];

const DEFAULT_THEME = SALON_THEMES[0];

export function getTheme(key: string | null | undefined): SalonTheme {
  return SALON_THEMES.find(t => t.key === key) ?? DEFAULT_THEME;
}

// パンくずの「現在地（リンクなし最終項目）」の文字色をテーマ連動で返す。
// 黒テーマは暗背景で #333 が埋もれるため明るい色に。それ以外は従来の濃色（#333）。
export function breadcrumbCurrentColor(key: string | null | undefined): string {
  // 黒テーマは白だと目立ちすぎるため、区切り(#999)より明るく白より抑えめのライトグレーに。
  return key === 'black' ? '#B0B0AC' : '#333';
}
