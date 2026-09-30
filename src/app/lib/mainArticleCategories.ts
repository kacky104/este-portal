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

// キー → カテゴリバッジの色（2026-10-01 第1043便）。一覧カード・記事ページの両方がここを読む。
// 選び方ガイド＝赤／初めての方へ＝緑／楽しみ方・マナー＝オレンジ／用語解説＝青。
export const MAIN_ARTICLE_CATEGORY_BADGE: Record<MainArticleCategory, string> = {
  'howto': 'bg-red-50 text-red-600 border-red-200',
  'beginner': 'bg-green-50 text-green-700 border-green-200',
  'manner': 'bg-orange-50 text-orange-600 border-orange-200',
  'glossary': 'bg-blue-50 text-blue-600 border-blue-200',
};

/** カテゴリバッジの色クラス（未知キーはピンク＝従来色）。 */
export function mainArticleCategoryBadge(key: string | null | undefined): string {
  return MAIN_ARTICLE_CATEGORY_BADGE[key as MainArticleCategory] ?? 'bg-pink-50 text-pink-600 border-pink-200';
}

// キー → 絞り込みチップの色（2026-10-01 第1045便）。バッジと同じ色相で、選択中は塗り・未選択は白地。
export const MAIN_ARTICLE_CATEGORY_CHIP: Record<MainArticleCategory, { active: string; inactive: string }> = {
  'howto': { active: 'bg-red-600 text-white border-transparent shadow-sm shadow-red-500/25', inactive: 'bg-white text-red-600 border-red-200 hover:border-red-300' },
  'beginner': { active: 'bg-green-600 text-white border-transparent shadow-sm shadow-green-500/25', inactive: 'bg-white text-green-700 border-green-200 hover:border-green-300' },
  'manner': { active: 'bg-orange-500 text-white border-transparent shadow-sm shadow-orange-500/25', inactive: 'bg-white text-orange-600 border-orange-200 hover:border-orange-300' },
  'glossary': { active: 'bg-blue-600 text-white border-transparent shadow-sm shadow-blue-500/25', inactive: 'bg-white text-blue-600 border-blue-200 hover:border-blue-300' },
};

/** 絞り込みチップの色クラス（未知キーはピンク＝「すべて」と同じ）。 */
export function mainArticleCategoryChip(key: string | null | undefined, active: boolean): string {
  const c = MAIN_ARTICLE_CATEGORY_CHIP[key as MainArticleCategory];
  if (!c) return active ? 'bg-pink-600 text-white border-transparent shadow-sm shadow-pink-500/25' : 'bg-white text-pink-600 border-pink-200 hover:border-pink-300';
  return active ? c.active : c.inactive;
}

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
