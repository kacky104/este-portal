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

// キー → カテゴリ別一覧ページの説明文（2026-08-18 第23便）。
// ねらいと注意は本体側 mainArticleCategories.ts と同じ（文章はここ1か所・記事の存在を前提にしない）。
export const ARTICLE_CATEGORY_DESCRIPTIONS: Record<ArticleCategory, string> = {
  'work-guide': 'メンズエステで働くとはどういうことか、その全体像をまとめたコラムです。仕事の内容や勤務のスタイル、1日の流れなど、はじめる前に知っておきたいことを扱います。',
  'money': 'お給料まわりのコラムです。バック率や日払いのしくみ、指名料の考え方、手取りの目安など、お金の疑問をわかりやすく整理しています。',
  'interview': '応募から面接、体験入店までの流れをまとめたコラムです。当日の服装や持ち物、よく聞かれること、お店を見極めるポイントを扱います。',
  'industry': '業界のしくみを知るためのコラムです。お店の種類や集客の考え方、安全に働くためのルールなど、長く続けていくために役立つ知識をまとめています。',
};

/** カテゴリ別一覧ページの説明文（未知キーは空文字＝画面に何も出ない）。 */
export function articleCategoryDescription(key: string | null | undefined): string {
  if (!key) return '';
  return ARTICLE_CATEGORY_DESCRIPTIONS[key as ArticleCategory] ?? '';
}

/** カテゴリキーが有効（check制約に載っている）か。サーバー側バリデーションでも使う。 */
export function isValidArticleCategory(v: unknown): v is ArticleCategory {
  return typeof v === 'string' && (ARTICLE_CATEGORY_ORDER as readonly string[]).includes(v);
}

/** DBのカテゴリキーを画面表示ラベルに変換する（未定義・未知キーはそのまま返す）。 */
export function articleCategoryLabel(key: string | null | undefined): string {
  if (!key) return '';
  return ARTICLE_CATEGORIES[key as ArticleCategory] ?? key;
}
