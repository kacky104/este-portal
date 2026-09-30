import { createPublicClient } from '@/app/lib/supabase/public';
import { isValidMainArticleCategory } from '@/app/lib/mainArticleCategories';
import { getAllMainColumnFiles, getMainColumnFile } from '@/app/lib/workColumnFiles';

// ★★ 第1037便（2026-10-01・カッキーさん）: 本体コラムも「用語集型」（src/content/column/*.md）へ。
//   各 fetch は【md → DB】の順で合成する（mergeWithFiles）。同じ slug は md が勝つ。DB の main_articles は残置。

// 本体コラム記事（main_articles）の公開ページ用データ取得。
// ワーク側 workArticles.ts と同じ流儀：公開ページ専用のため anon クライアント（createPublicClient）で
// 読む＝cookieを触らないので ISR（revalidate）が有効。RLS の公開SELECT（status='published'）で守られるが、
// 多重防御としてクエリ側でも .eq('status', 'published') を明示する（draft を公開ページに一切出さない）。

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

const LIST_COLUMNS = 'id, slug, title, excerpt, hero_image_url, category, published_at, updated_at';
const DETAIL_COLUMNS = `${LIST_COLUMNS}, body`;

function mapListItem(row: Record<string, unknown>): MainArticleListItem {
  return {
    id: String(row.id),
    slug: (row.slug as string | null) ?? '',
    title: (row.title as string | null) ?? '',
    excerpt: (row.excerpt as string | null) ?? '',
    heroImageUrl: (row.hero_image_url as string | null) ?? null,
    category: (row.category as string | null) ?? 'howto',
    publishedAt: (row.published_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

function mapDetail(row: Record<string, unknown>): MainArticleDetail {
  return {
    ...mapListItem(row),
    body: (row.body as string | null) ?? '',
  };
}

// 一覧の並び順キー：published_at と updated_at の「新しい方」のミリ秒。
function effectiveDateMs(a: { publishedAt: string | null; updatedAt: string | null }): number {
  const p = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const u = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  return Math.max(Number.isNaN(p) ? 0 : p, Number.isNaN(u) ? 0 : u);
}

function sortByEffectiveDateDesc<T extends { publishedAt: string | null; updatedAt: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => effectiveDateMs(b) - effectiveDateMs(a));
}

function mergeWithFiles<T extends { slug: string }>(files: T[], db: T[]): T[] {
  const taken = new Set(files.map((f) => f.slug));
  return [...files, ...db.filter((d) => !taken.has(d.slug))];
}

function fileListItems(category?: string): MainArticleListItem[] {
  return getAllMainColumnFiles()
    .filter((a) => !category || a.category === category)
    .map((a) => { const { body, ...rest } = a; void body; return rest; });
}

// ── 一覧（published・実質更新日降順）。limit 指定で件数制限。 ──
export async function fetchPublishedMainArticles(limit?: number): Promise<MainArticleListItem[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('main_articles')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  const sorted = sortByEffectiveDateDesc(mergeWithFiles(fileListItems(), (data ?? []).map(mapListItem)));
  return limit != null ? sorted.slice(0, limit) : sorted;
}

// ── カテゴリ別一覧。不正キーは空配列。 ──
export async function fetchPublishedMainArticlesByCategory(
  category: string,
): Promise<MainArticleListItem[]> {
  if (!isValidMainArticleCategory(category)) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('main_articles')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .eq('category', category)
    .order('published_at', { ascending: false });
  return sortByEffectiveDateDesc(mergeWithFiles(fileListItems(category), (data ?? []).map(mapListItem)));
}

// ── slug 単体（published のみ）。存在しない／draft は null（呼び出し側で notFound）。 ──
export async function fetchPublishedMainArticleBySlug(
  slug: string,
): Promise<MainArticleDetail | null> {
  const file = getMainColumnFile(slug);
  if (file) return file;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('main_articles')
    .select(DETAIL_COLUMNS)
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle();
  return data ? mapDetail(data) : null;
}

// ── sitemap 用：published 記事の slug / category / updated_at。 ──
export type MainArticleSitemapRow = { slug: string; category: string; updatedAt: string | null };

export async function fetchPublishedMainArticlesForSitemap(): Promise<MainArticleSitemapRow[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('main_articles')
    .select('slug, category, updated_at')
    .eq('status', 'published');
  const db = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      slug: String(row.slug ?? ''),
      category: String(row.category ?? ''),
      updatedAt: (row.updated_at as string | null) ?? null,
    };
  });
  const files = getAllMainColumnFiles().map((a) => ({ slug: a.slug, category: a.category, updatedAt: a.updatedAt ?? a.publishedAt }));
  return mergeWithFiles(files, db);
}

// ── generateStaticParams 用：published 記事の slug 一覧。 ──
export async function fetchPublishedMainArticleSlugs(): Promise<string[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('main_articles')
    .select('slug')
    .eq('status', 'published');
  return [...new Set([...getAllMainColumnFiles().map((a) => a.slug), ...(data ?? []).map((r) => String((r as { slug: unknown }).slug))])];
}

// ── 関連記事：同カテゴリの他の published 記事（現在の slug を除外・最大 limit 件）。 ──
export async function fetchRelatedMainArticles(
  category: string,
  excludeSlug: string,
  limit = 3,
): Promise<MainArticleListItem[]> {
  if (!isValidMainArticleCategory(category)) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('main_articles')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .eq('category', category)
    .neq('slug', excludeSlug)
    .order('published_at', { ascending: false });
  const files = fileListItems(category).filter((a) => a.slug !== excludeSlug);
  return sortByEffectiveDateDesc(mergeWithFiles(files, (data ?? []).map(mapListItem))).slice(0, limit);
}
