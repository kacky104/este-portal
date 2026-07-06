// コラム記事（work_articles）のカテゴリ：DB値（キー）→ 画面表示ラベルの変換を一元管理する。
// areaLabel.ts と同じ設計＝DBに入るキー（'work-guide' 等）は不変、日本語ラベルはコード側でのみ持つ。
// フィルタ・保存・check制約はキーで行い、表示時のみ articleCategoryLabel() を通す。

// 表示順つきのキー配列（セレクトの並び・一覧の既定順はこの順序）。
export const ARTICLE_CATEGORY_ORDER = [
  'work-guide',
  'money',
  'interview',
  'industry',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORY_ORDER)[number];

// キー → 日本語ラベル。DBの category check 制約と厳密に一致させること。
export const ARTICLE_CATEGORIES: Record<ArticleCategory, string> = {
  'work-guide': '働き方ガイド',
  'money': 'お金・給料',
  'interview': '面接・応募対策',
  'industry': '業界知識',
};

/** カテゴリキーが有効（check制約に載っている）か。サーバー側バリデーションでも使う。 */
export function isValidArticleCategory(v: unknown): v is ArticleCategory {
  return typeof v === 'string' && (ARTICLE_CATEGORY_ORDER as readonly string[]).includes(v);
}

/** DBのカテゴリキーを画面表示ラベルに変換する（未定義・未知キーはそのまま返す）。 */
export function articleCategoryLabel(key: string | null | undefined): string {
  if (!key) return '';
  return ARTICLE_CATEGORIES[key as ArticleCategory] ?? key;
}
