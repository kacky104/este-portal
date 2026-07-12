// 本体コラム（main_articles）のカテゴリ：DB値（キー）→ 画面表示ラベルの変換を一元管理する。
// ワーク側 articleCategories.ts と同じ設計＝DBに入るキーは不変、日本語ラベルはコード側でのみ持つ。
// フィルタ・保存・check制約はキーで行い、表示時のみ mainArticleCategoryLabel() を通す。

// 表示順つきのキー配列（セレクトの並び・一覧の既定順はこの順序）。
export const MAIN_ARTICLE_CATEGORY_ORDER = [
  'howto',
  'beginner',
  'manner',
  'glossary',
] as const;

export type MainArticleCategory = (typeof MAIN_ARTICLE_CATEGORY_ORDER)[number];

// キー → 日本語ラベル。DBの category check 制約と厳密に一致させること。
export const MAIN_ARTICLE_CATEGORIES: Record<MainArticleCategory, string> = {
  'howto': '選び方ガイド',
  'beginner': '初めての方へ',
  'manner': '楽しみ方・マナー',
  'glossary': '用語解説',
};

/** カテゴリキーが有効（check制約に載っている）か。サーバー側バリデーションでも使う。 */
export function isValidMainArticleCategory(v: unknown): v is MainArticleCategory {
  return typeof v === 'string' && (MAIN_ARTICLE_CATEGORY_ORDER as readonly string[]).includes(v);
}

/** DBのカテゴリキーを画面表示ラベルに変換する（未定義・未知キーはそのまま返す）。 */
export function mainArticleCategoryLabel(key: string | null | undefined): string {
  if (!key) return '';
  return MAIN_ARTICLE_CATEGORIES[key as MainArticleCategory] ?? key;
}
