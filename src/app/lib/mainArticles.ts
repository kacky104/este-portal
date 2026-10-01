import { isValidMainArticleCategory } from '@/app/lib/mainArticleCategories';
import { getAllMainColumnFiles, getMainColumnFile } from '@/app/lib/workColumnFiles';

// ★★ 第1054便（2026-10-01・カッキーさん）: コラムは【md だけ】を読む（src/content/column/*.md）。
//   第1033便〜で md→DB の合成（mergeWithFiles）にしていたが、全記事の md 化が済んだので
//   DB（main_articles）の読み取りをやめた。これでコラムのページは Supabase を一切読まない。
//   ★ 関数名・引数・返す型は以前のまま（呼び出し側は変更なし）。async のままにしてある。
//   ★ DB の main_articles テーブルと管理画面は当面そのまま（公開ページからは参照しない）。

export type MainArticleListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  heroImageUrl: string | null;
  category: string;
  publishedAt: string | null;
  // 一覧の並び順（公開日と更新日の新しい方＝実質の最終更新日で降順）に使う。
  updatedAt: string | null;
};

export type MainArticleDetail = MainArticleListItem & {
  body: string;
};

// 一覧の並び順キー：publishedAt と updatedAt の「新しい方」のミリ秒。
function effectiveDateMs(a: { publishedAt: string | null; updatedAt: string | null }): number {
  const p = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const u = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  return Math.max(Number.isNaN(p) ? 0 : p, Number.isNaN(u) ? 0 : u);
}

// effectiveDateMs の降順（新しい順）で安定ソート。入力は破壊しない。
function sortByEffectiveDateDesc<T extends { publishedAt: string | null; updatedAt: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => effectiveDateMs(b) - effectiveDateMs(a));
}

function fileListItems(category?: string): MainArticleListItem[] {
  return getAllMainColumnFiles()
    .filter((a) => !category || a.category === category)
    .map((a) => { const { body, ...rest } = a; void body; return rest; });
}

// ── 一覧（新しい順）。limit 指定で件数制限（トップの新着枠など）。 ──
export async function fetchPublishedMainArticles(limit?: number): Promise<MainArticleListItem[]> {
  const sorted = sortByEffectiveDateDesc(fileListItems());
  return limit != null ? sorted.slice(0, limit) : sorted;
}

// ── カテゴリ別一覧（新しい順）。不正キーは空配列。 ──
export async function fetchPublishedMainArticlesByCategory(category: string): Promise<MainArticleListItem[]> {
  if (!isValidMainArticleCategory(category)) return [];
  return sortByEffectiveDateDesc(fileListItems(category));
}

// ── slug 単体。存在しなければ null（呼び出し側で notFound）。 ──
export async function fetchPublishedMainArticleBySlug(slug: string): Promise<MainArticleDetail | null> {
  return getMainColumnFile(slug);
}

// ── sitemap 用：slug / category / updatedAt（無ければ publishedAt）。 ──
export type MainArticleSitemapRow = { slug: string; category: string; updatedAt: string | null };

export async function fetchPublishedMainArticlesForSitemap(): Promise<MainArticleSitemapRow[]> {
  return getAllMainColumnFiles().map((a) => ({ slug: a.slug, category: a.category, updatedAt: a.updatedAt ?? a.publishedAt }));
}

// ── generateStaticParams 用：slug 一覧。 ──
export async function fetchPublishedMainArticleSlugs(): Promise<string[]> {
  return getAllMainColumnFiles().map((a) => a.slug);
}

// ── 関連記事：同カテゴリの他の記事（現在の slug を除外・新しい順・最大 limit 件）。 ──
export async function fetchRelatedMainArticles(category: string, excludeSlug: string, limit = 3): Promise<MainArticleListItem[]> {
  if (!isValidMainArticleCategory(category)) return [];
  return sortByEffectiveDateDesc(fileListItems(category).filter((a) => a.slug !== excludeSlug)).slice(0, limit);
}
