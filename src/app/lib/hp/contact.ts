// 公式ホームページ（フクエスサイト）の【お問い合わせフォーム】の型・定数（第1717便・2026-11-02・カッキーさん）。
//
// ★ 用件の選択肢は全店共通の固定（店舗ごとに変えない）。サーバー（actions/hpContact.ts）と
//   フォーム（_templates/HpContactForm.tsx）とメール文が全部ここを見る。
// ★ 案内文（blocks.contact.note）が空のときはこの既定文を出す。

export const HP_CONTACT_SUBJECTS = [
  { key: 'service', label: '施術内容' },
  { key: 'recruit', label: '求人' },
  { key: 'booking', label: '予約' },
  { key: 'other',   label: 'その他' },
] as const;
export type HpContactSubject = (typeof HP_CONTACT_SUBJECTS)[number]['key'];

export function isHpContactSubject(v: unknown): v is HpContactSubject {
  return HP_CONTACT_SUBJECTS.some((s) => s.key === v);
}
export function hpContactSubjectLabel(key: string): string {
  return HP_CONTACT_SUBJECTS.find((s) => s.key === key)?.label ?? key;
}

/** 管理画面で案内文が空のときにフォームの上に出す既定文 */
export const HP_CONTACT_DEFAULT_NOTE =
  '下記のフォームよりお気軽にお問い合わせください。\n内容を確認のうえ、ご入力いただいたメールアドレスまたはお電話にてご連絡いたします。\n※ は入力必須項目です。';

/** 送信後に出す文（自動返信メールは送らない。この画面表示だけ） */
export const HP_CONTACT_DONE_MESSAGE =
  'お問い合わせありがとうございました。\n内容を確認次第、ご連絡差し上げます。';

export const MAX_HP_CONTACT_NOTE_LEN = 400;
export const MAX_HP_CONTACT_BODY_LEN = 2000;
