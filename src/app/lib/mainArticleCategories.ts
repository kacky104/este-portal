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

// キー → カテゴリ別一覧ページの説明文（2026-08-18 第23便）。
//
// カテゴリ別一覧（/column/category/[key]）は見出ししか無く、検索エンジンから見ると
// 「記事カードのタイトルだけが並ぶページ」だった。ここに1〜2文の説明を置いて、
// そのカテゴリが何のページなのかを本文として持たせる。
//
// ★ 文章はここ1か所だけに置くこと。画面（ColumnHeading）と <meta description> の
//   両方がここを読む。ページ側に書き写すと、そのうち食い違う。
// ★ 特定の記事があることを前提にした書き方をしないこと（記事は増減する）。
//   「そのカテゴリが扱う話題の範囲」を書く。
export const MAIN_ARTICLE_CATEGORY_DESCRIPTIONS: Record<MainArticleCategory, string> = {
  'howto': '初めての一軒選びから、いつものお店の見直しまで。料金の見方・お店の雰囲気・セラピストの探し方など、福岡のメンズエステを選ぶときに知っておきたいことをまとめています。',
  'beginner': 'メンズエステが初めての方に向けたコラムです。予約の取り方から当日の流れ、服装や持ち物まで、行く前の不安をひとつずつ解消していきます。',
  'manner': 'お店とセラピストの双方が気持ちよく過ごすための、楽しみ方とマナーのコラムです。基本の心づかいから、また会いたいと思ってもらうための距離感まで扱います。',
  'glossary': 'お店選びや予約のときに見かける言葉、施術や技法の名前をやさしく解説します。意味が分かると、お店選びの精度がぐっと上がります。',
};

/** カテゴリ別一覧ページの説明文（未知キーは空文字＝画面に何も出ない）。 */
export function mainArticleCategoryDescription(key: string | null | undefined): string {
  if (!key) return '';
  return MAIN_ARTICLE_CATEGORY_DESCRIPTIONS[key as MainArticleCategory] ?? '';
}

/** カテゴリキーが有効（check制約に載っている）か。サーバー側バリデーションでも使う。 */
export function isValidMainArticleCategory(v: unknown): v is MainArticleCategory {
  return typeof v === 'string' && (MAIN_ARTICLE_CATEGORY_ORDER as readonly string[]).includes(v);
}

/** DBのカテゴリキーを画面表示ラベルに変換する（未定義・未知キーはそのまま返す）。 */
export function mainArticleCategoryLabel(key: string | null | undefined): string {
  if (!key) return '';
  return MAIN_ARTICLE_CATEGORIES[key as MainArticleCategory] ?? key;
}
