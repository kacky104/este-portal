// 公式ホームページ制作の申し込みフォームで聞く「フクエス掲載状況」（2026-08-16 追加）。
//
// ★ ここは 'use server' ではない普通のモジュール。
//   actions/hpInquiry.ts は 'use server' なので定数を export できない
//   （lib/booking/source.ts・lib/booking/limits.ts と同じ理由・禁則61）。
//   フォーム（クライアント）と server action の両方から読むので、必ずここに置くこと。
//
// ★ 値を増やすときは4か所を同時に直すこと。1つ忘れると、
//   片方は INSERT できず（DBのCHECK）、片方は「(不明)」と表示される。
//     ① この配列
//     ② DB の hp_inquiries_listing_status_check
//        （supabase/migrations/20260816_hp_inquiries.sql）
//     ③ フォームの選択肢（自動でこの配列から作るので、実際は①だけで足りる）
//     ④ 管理画面のラベル（HpInquiryManager も この配列を参照している）

export const HP_LISTING_STATUSES = [
  { key: 'listed',      label: 'フクエスに掲載中' },
  { key: 'applied',     label: '掲載を申し込み済み・準備中' },
  { key: 'considering', label: '掲載を検討中（まだ未掲載）' },
  { key: 'none',        label: '掲載はせず、ホームページだけ希望' },
] as const;

export type HpListingStatus = (typeof HP_LISTING_STATUSES)[number]['key'];

export function isHpListingStatus(v: unknown): v is HpListingStatus {
  return HP_LISTING_STATUSES.some((s) => s.key === v);
}

/** キー → 表示名（不明な値は「(不明)」）。過去データに無くなった値が残っていても落ちないようにする。 */
export function hpListingStatusLabel(key: string): string {
  return HP_LISTING_STATUSES.find((s) => s.key === key)?.label ?? '(不明)';
}
