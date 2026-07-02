// 折り返し電話の希望時間帯（予約入力・mypage一覧・サーバー検証で共用）。
// slug は salon_bookings.callback_pref に保存する文字列。未選択のデフォルトは 'none'。
export const CALLBACK_PREF_OPTIONS = [
  { slug: '12-15', label: '12時〜15時' },
  { slug: '15-18', label: '15時〜18時' },
  { slug: '18-21', label: '18時〜21時' },
  { slug: '21-24', label: '21時〜24時' },
  { slug: 'none',  label: '希望なし' },
] as const;

export type CallbackPrefSlug = (typeof CALLBACK_PREF_OPTIONS)[number]['slug'];

// 有効な slug なら正規化して返し、不正値・null は 'none' にフォールバック（改ざん耐性）。
export const normalizeCallbackPref = (slug: string | null | undefined): CallbackPrefSlug =>
  CALLBACK_PREF_OPTIONS.find((o) => o.slug === slug)?.slug ?? 'none';

export const callbackPrefLabel = (slug: string | null): string =>
  CALLBACK_PREF_OPTIONS.find((o) => o.slug === slug)?.label ?? '希望なし';
