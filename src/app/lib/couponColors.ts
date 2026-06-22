// クーポン券の背景カラープリセット定義
// /mypage の色選択UIと、公開ページ /salon/[id]/coupon の券描画で共用する。
// プリセットを増減する場合はこの1か所だけを編集すれば両方に反映される。
// （DB側の CHECK 制約のキーと必ず一致させること）

export type CouponColorKey =
  | 'gold'
  | 'orange_pink'
  | 'red'
  | 'blue'
  | 'green'
  | 'pink'
  | 'black';

export type CouponColor = {
  key: CouponColorKey;
  /** /mypage の選択UI用ラベル */
  label: string;
  /** 券の背景（単色 or グラデーション。CSS background 値） */
  background: string;
  /** 券のベース文字色 */
  text: string;
  /** 任意：券の枠線色（black のみ使用） */
  border?: string;
  /** 濃いトーン：白背景でも読めるアクセント色（割引額・『フクエスを見た！』強調用） */
  accent: string;
};

export const COUPON_COLORS: CouponColor[] = [
  { key: 'gold',        label: 'ゴールド',        background: 'linear-gradient(135deg,#E8C766,#C49A2C)', text: '#3A2A06', accent: '#9A7A1C' },
  { key: 'orange_pink', label: 'オレンジ→ピンク', background: 'linear-gradient(120deg,#F59E0B,#EC4899)', text: '#FFFFFF', accent: '#DB2777' },
  { key: 'red',         label: 'レッド',          background: '#D8332B', text: '#FFFFFF', accent: '#C0271F' },
  { key: 'blue',        label: 'ブルー',          background: '#2D7FE0', text: '#FFFFFF', accent: '#1D4ED8' },
  { key: 'green',       label: 'グリーン',        background: '#1C9E63', text: '#FFFFFF', accent: '#117A4C' },
  { key: 'pink',        label: 'ピンク',          background: '#E0478F', text: '#FFFFFF', accent: '#BE185D' },
  { key: 'black',       label: 'ブラック',        background: '#161412', text: '#E2B85A', border: '#3A352A', accent: '#161412' },
];

export const DEFAULT_COUPON_COLOR_KEY: CouponColorKey = 'pink';

const COUPON_COLOR_MAP: Record<string, CouponColor> = Object.fromEntries(
  COUPON_COLORS.map((c) => [c.key, c]),
);

/** key からプリセットを取得。未設定/不明な値は pink（デフォルト）にフォールバック。 */
export function getCouponColor(key: string | null | undefined): CouponColor {
  return (key != null && COUPON_COLOR_MAP[key]) || COUPON_COLOR_MAP[DEFAULT_COUPON_COLOR_KEY];
}
