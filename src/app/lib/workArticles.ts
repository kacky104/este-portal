import { isValidArticleCategory } from '@/app/lib/articleCategories';
import { getAllWorkColumnFiles, getWorkColumnFile } from '@/app/lib/workColumnFiles';

// ★★ 第1054便（2026-10-01・カッキーさん）: コラムは【md だけ】を読む（src/content/work-column/*.md）。
//   第1033便〜で md→DB の合成（mergeWithFiles）にしていたが、全記事の md 化が済んだので
//   DB（work_articles）の読み取りをやめた。これでコラムのページは Supabase を一切読まない。
//   ★ 関数名・引数・返す型は以前のまま（呼び出し側は変更なし）。async のままにしてある。
//   ★ DB の work_articles テーブルと管理画面は当面そのまま（公開ページからは参照しない）。

export type WorkArticleListItem = {
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

export type WorkArticleDetail = WorkArticleListItem & {
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

function fileListItems(category?: string): WorkArticleListItem[] {
  return getAllWorkColumnFiles()
    .filter((a) => !category || a.category === category)
    .map((a) => { const { body, ...rest } = a; void body; return rest; });
}

// ── 一覧（新しい順）。limit 指定で件数制限（トップの新着枠など）。 ──
export async function fetchPublishedArticles(limit?: number): Promise<WorkArticleListItem[]> {
  const sorted = sortByEffectiveDateDesc(fileListItems());
  return limit != null ? sorted.slice(0, limit) : sorted;
}

// ── カテゴリ別一覧（新しい順）。不正キーは空配列。 ──
export async function fetchPublishedArticlesByCategory(category: string): Promise<WorkArticleListItem[]> {
  if (!isValidArticleCategory(category)) return [];
  return sortByEffectiveDateDesc(fileListItems(category));
}

// ── slug 単体。存在しなければ null（呼び出し側で notFound）。 ──
export async function fetchPublishedArticleBySlug(slug: string): Promise<WorkArticleDetail | null> {
  return getWorkColumnFile(slug);
}

// ── sitemap 用：slug / category / updatedAt（無ければ publishedAt）。 ──
export type WorkArticleSitemapRow = { slug: string; category: string; updatedAt: string | null };

export async function fetchPublishedArticlesForSitemap(): Promise<WorkArticleSitemapRow[]> {
  return getAllWorkColumnFiles().map((a) => ({ slug: a.slug, category: a.category, updatedAt: a.updatedAt ?? a.publishedAt }));
}

// ── generateStaticParams 用：slug 一覧。 ──
export async function fetchPublishedArticleSlugs(): Promise<string[]> {
  return getAllWorkColumnFiles().map((a) => a.slug);
}

// ── 関連記事：同カテゴリの他の記事（現在の slug を除外・新しい順・最大 limit 件）。 ──
export async function fetchRelatedArticles(category: string, excludeSlug: string, limit = 3): Promise<WorkArticleListItem[]> {
  if (!isValidArticleCategory(category)) return [];
  return sortByEffectiveDateDesc(fileListItems(category).filter((a) => a.slug !== excludeSlug)).slice(0, limit);
}
