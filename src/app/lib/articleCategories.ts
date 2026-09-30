import type React from 'react';
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

// キー → カテゴリバッジの色（2026-10-01 第1044便）。一覧カード・記事ページの両方がここを読む。
// 働き方ガイド＝緑（従来色）／お金・給料＝オレンジ／面接・応募対策＝紫／業界知識＝青。
export const ARTICLE_CATEGORY_BADGE: Record<ArticleCategory, { background: string; color: string }> = {
  'work-guide': { background: 'rgba(16,185,129,0.12)', color: '#059669' },
  'money': { background: 'rgba(249,115,22,0.12)', color: '#ea580c' },
  'interview': { background: 'rgba(139,92,246,0.12)', color: '#7c3aed' },
  'industry': { background: 'rgba(59,130,246,0.12)', color: '#2563eb' },
};

/** カテゴリバッジの色（未知キーは緑＝従来色）。 */
export function articleCategoryBadge(key: string | null | undefined): { background: string; color: string } {
  return ARTICLE_CATEGORY_BADGE[key as ArticleCategory] ?? ARTICLE_CATEGORY_BADGE['work-guide'];
}

// キー → 絞り込みチップの色（2026-10-01 第1045便）。選択中は塗り・未選択は白地に色文字。働き方ガイドは従来の緑グラデ。
export const ARTICLE_CATEGORY_CHIP: Record<ArticleCategory, { active: React.CSSProperties; inactive: React.CSSProperties }> = {
  'work-guide': {
    active: { background: 'linear-gradient(to right,#10B981,#84CC16)', color: '#fff', borderColor: 'transparent' },
    inactive: { color: '#059669', borderColor: '#A7F3D0', background: '#fff' },
  },
  'money': {
    active: { background: '#f97316', color: '#fff', borderColor: 'transparent' },
    inactive: { color: '#ea580c', borderColor: '#fed7aa', background: '#fff' },
  },
  'interview': {
    active: { background: '#8b5cf6', color: '#fff', borderColor: 'transparent' },
    inactive: { color: '#7c3aed', borderColor: '#ddd6fe', background: '#fff' },
  },
  'industry': {
    active: { background: '#3b82f6', color: '#fff', borderColor: 'transparent' },
    inactive: { color: '#2563eb', borderColor: '#bfdbfe', background: '#fff' },
  },
};

/** 絞り込みチップの色（未知キー＝「すべて」は働き方ガイドと同じ緑）。 */
export function articleCategoryChip(key: string | null | undefined, active: boolean): React.CSSProperties {
  const c = ARTICLE_CATEGORY_CHIP[key as ArticleCategory] ?? ARTICLE_CATEGORY_CHIP['work-guide'];
  return active ? c.active : c.inactive;
}

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
