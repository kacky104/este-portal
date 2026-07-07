import { createPublicClient } from '@/app/lib/supabase/public';
import { isValidArticleCategory } from '@/app/lib/articleCategories';

// コラム記事（work_articles）の公開ページ用データ取得（段階3）。
// 公開ページ専用のため anon クライアント（createPublicClient）で読む＝cookieを触らないので
// ISR（revalidate）が有効。RLS の公開SELECT（status='published'）で守られるが、多重防御として
// クエリ側でも .eq('status', 'published') を明示する（draft を公開ページに一切出さない）。

export type WorkArticleListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  heroImageUrl: string | null;
  category: string;
  publishedAt: string | null;
  // 一覧の並び順（公開日と更新日の新しい方＝実質の最終更新日で降順）に使う。
  // 詳細ページの日付表示（isMeaningfulUpdate 等）は従来どおり WorkArticleDetail 経由でこの値を利用する。
  updatedAt: string | null;
};

export type WorkArticleDetail = WorkArticleListItem & {
  body: string;
};

const LIST_COLUMNS = 'id, slug, title, excerpt, hero_image_url, category, published_at, updated_at';
const DETAIL_COLUMNS = `${LIST_COLUMNS}, body`;

function mapListItem(row: Record<string, unknown>): WorkArticleListItem {
  return {
    id: String(row.id),
    slug: (row.slug as string | null) ?? '',
    title: (row.title as string | null) ?? '',
    excerpt: (row.excerpt as string | null) ?? '',
    heroImageUrl: (row.hero_image_url as string | null) ?? null,
    category: (row.category as string | null) ?? 'work-guide',
    publishedAt: (row.published_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

function mapDetail(row: Record<string, unknown>): WorkArticleDetail {
  return {
    ...mapListItem(row),
    body: (row.body as string | null) ?? '',
  };
}

// 一覧の並び順キー：published_at と updated_at の「新しい方」のミリ秒。updated_at が null なら published_at のみ。
// 記事を更新すると updated_at が上がり、一覧の先頭に来る（GREATEST 相当をアプリ側で実現）。
function effectiveDateMs(a: { publishedAt: string | null; updatedAt: string | null }): number {
  const p = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const u = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  return Math.max(Number.isNaN(p) ? 0 : p, Number.isNaN(u) ? 0 : u);
}

// effectiveDateMs の降順（新しい順）で安定ソート。呼び出し側はクエリで published_at 降順を付けておくと
// 同値時のタイブレークが決定的になる（Array.prototype.sort は安定ソート）。入力は破壊しない。
function sortByEffectiveDateDesc<T extends { publishedAt: string | null; updatedAt: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => effectiveDateMs(b) - effectiveDateMs(a));
}

// ── 一覧（published・published_at 降順）。limit 指定で件数制限（トップの新着枠など）。 ──
export async function fetchPublishedArticles(limit?: number): Promise<WorkArticleListItem[]> {
  const supabase = createPublicClient();
  // limit はクエリ側で掛けない：published_at 降順で先に切ると「更新で先頭に来るべき記事」が漏れるため、
  // 全 published を取得→effectiveDate（公開日/更新日の新しい方）でソート→slice の順にする（記事数が少なくコスト無視可）。
  const { data } = await supabase
    .from('work_articles')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  const sorted = sortByEffectiveDateDesc((data ?? []).map(mapListItem));
  return limit != null ? sorted.slice(0, limit) : sorted;
}

// ── カテゴリ別一覧（published・published_at 降順）。不正キーは空配列。 ──
export async function fetchPublishedArticlesByCategory(
  category: string,
): Promise<WorkArticleListItem[]> {
  if (!isValidArticleCategory(category)) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('work_articles')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .eq('category', category)
    .order('published_at', { ascending: false });
  return sortByEffectiveDateDesc((data ?? []).map(mapListItem));
}

// ── slug 単体（published のみ）。存在しない／draft は null（呼び出し側で notFound）。 ──
export async function fetchPublishedArticleBySlug(
  slug: string,
): Promise<WorkArticleDetail | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('work_articles')
    .select(DETAIL_COLUMNS)
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle();
  return data ? mapDetail(data) : null;
}

// ── sitemap 用：published 記事の slug / category / updated_at。 ──
// category は「公開記事が1件以上あるカテゴリだけ sitemap に載せる」判定に、
// updatedAt は詳細URLの lastModified に使う。
export type WorkArticleSitemapRow = { slug: string; category: string; updatedAt: string | null };

export async function fetchPublishedArticlesForSitemap(): Promise<WorkArticleSitemapRow[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('work_articles')
    .select('slug, category, updated_at')
    .eq('status', 'published');
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      slug: String(row.slug ?? ''),
      category: String(row.category ?? ''),
      updatedAt: (row.updated_at as string | null) ?? null,
    };
  });
}

// ── generateStaticParams 用：published 記事の slug 一覧。 ──
export async function fetchPublishedArticleSlugs(): Promise<string[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('work_articles')
    .select('slug')
    .eq('status', 'published');
  return (data ?? []).map((r) => String((r as { slug: unknown }).slug));
}

// ── 関連記事：同カテゴリの他の published 記事（現在の slug を除外・最大 limit 件）。 ──
export async function fetchRelatedArticles(
  category: string,
  excludeSlug: string,
  limit = 3,
): Promise<WorkArticleListItem[]> {
  if (!isValidArticleCategory(category)) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('work_articles')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .eq('category', category)
    .neq('slug', excludeSlug)
    .order('published_at', { ascending: false });
  // 関連記事も一覧と同じく「更新日を含めた新しい順」。limit はソート後に slice（クエリ側で先に切らない）。
  return sortByEffectiveDateDesc((data ?? []).map(mapListItem)).slice(0, limit);
}
