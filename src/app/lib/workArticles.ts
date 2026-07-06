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
};

export type WorkArticleDetail = WorkArticleListItem & {
  body: string;
  updatedAt: string | null;
};

const LIST_COLUMNS = 'id, slug, title, excerpt, hero_image_url, category, published_at';
const DETAIL_COLUMNS = `${LIST_COLUMNS}, body, updated_at`;

function mapListItem(row: Record<string, unknown>): WorkArticleListItem {
  return {
    id: String(row.id),
    slug: (row.slug as string | null) ?? '',
    title: (row.title as string | null) ?? '',
    excerpt: (row.excerpt as string | null) ?? '',
    heroImageUrl: (row.hero_image_url as string | null) ?? null,
    category: (row.category as string | null) ?? 'work-guide',
    publishedAt: (row.published_at as string | null) ?? null,
  };
}

function mapDetail(row: Record<string, unknown>): WorkArticleDetail {
  return {
    ...mapListItem(row),
    body: (row.body as string | null) ?? '',
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

// ── 一覧（published・published_at 降順）。limit 指定で件数制限（トップの新着枠など）。 ──
export async function fetchPublishedArticles(limit?: number): Promise<WorkArticleListItem[]> {
  const supabase = createPublicClient();
  let q = supabase
    .from('work_articles')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (limit != null) q = q.limit(limit);
  const { data } = await q;
  return (data ?? []).map(mapListItem);
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
  return (data ?? []).map(mapListItem);
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
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapListItem);
}
