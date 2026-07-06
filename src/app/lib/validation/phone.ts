// 電話番号の正規化・検証（応募フォーム・ネット予約で共用）。
// 「ハイフン除去後の数字桁数」で数える方式に統一するための共通関数。
// DBスキーマには関与しない（保存値の整形と入力検証のみ）。

// ハイフン／ダッシュ／長音記号の類（半角ハイフン・各種ダッシュ・全角ハイフン・長音記号など）。
// これらは電話番号の区切りとして入力されうるため、桁数カウント前に除去する。
const HYPHEN_LIKE = /[-‐‑‒–—―−ー－ｰ]/g;
// 空白類（半角スペース・タブ等の \s と全角スペース U+3000）。
const WHITESPACE = /[\s　]/g;
// 全角数字（U+FF10〜U+FF19）。
const FULLWIDTH_DIGIT = /[０-９]/g;

// 全角数字→半角に変換し、ハイフン類・空白を除去した文字列を返す。
// 数字以外の文字（英字など）は保持するので、isValidPhone 側で数字のみ判定に弾かれる。
export function normalizePhone(input: string): string {
  return String(input ?? '')
    .replace(FULLWIDTH_DIGIT, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(HYPHEN_LIKE, '')
    .replace(WHITESPACE, '');
}

// 正規化後が「数字のみ・10〜13桁」なら true。
export function isValidPhone(input: string): boolean {
  return /^\d{10,13}$/.test(normalizePhone(input));
}
