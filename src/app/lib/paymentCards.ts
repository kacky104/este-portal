// クレジットカード決済の「対応カードブランド」定義（料金ページ表示・/mypage 設定で共用）。
// slug は DB(salons.payment_cards text[]) に保存する小文字スラッグ。label は表示用テキスト。
// ロゴ画像は今回使わずテキストバッジで表示（後日ロゴ差し替え可能なよう slug で管理）。
export const PAYMENT_CARD_OPTIONS = [
  { slug: 'visa', label: 'VISA' },
  { slug: 'mastercard', label: 'Mastercard' },
  { slug: 'jcb', label: 'JCB' },
  { slug: 'amex', label: 'American Express' },
  { slug: 'diners', label: 'Diners Club' },
] as const;

export type PaymentCardSlug = (typeof PAYMENT_CARD_OPTIONS)[number]['slug'];

export const cardLabel = (slug: string): string =>
  PAYMENT_CARD_OPTIONS.find((c) => c.slug === slug)?.label ?? slug;
