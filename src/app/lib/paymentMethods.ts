// 店舗基本情報の「支払い方法」定義（店舗ページ表示・/mypage 設定で共用）。
// slug は DB(salons.payment_methods text[]) に保存する小文字スラッグ。label は表示用テキスト。
export const PAYMENT_METHOD_OPTIONS = [
  { slug: 'cash',        label: '現金' },
  { slug: 'credit_card', label: 'クレジットカード' },
  { slug: 'qr',          label: 'QRコード決済' },
  { slug: 'emoney',      label: '電子マネー' },
] as const;

export type PaymentMethodSlug = (typeof PAYMENT_METHOD_OPTIONS)[number]['slug'];

export const paymentMethodLabel = (slug: string): string =>
  PAYMENT_METHOD_OPTIONS.find((m) => m.slug === slug)?.label ?? slug;
