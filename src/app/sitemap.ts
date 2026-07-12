import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchActiveJobsForSitemap, fetchFeatureSlugsWithActiveJobs, fetchAreaTagPairsWithActiveJobs, fetchActiveDispatchJobs } from '@/app/lib/jobs';
import { fetchPublishedArticlesForSitemap } from '@/app/lib/workArticles';
import { fetchPublishedMainArticlesForSitemap } from '@/app/lib/mainArticles';
import { jobsAreaHref, AREA_SLUGS_LIST } from '@/app/lib/areas';
import { ARTICLE_CATEGORY_ORDER } from '@/app/lib/articleCategories';
import { MAIN_ARTICLE_CATEGORY_ORDER } from '@/app/lib/mainArticleCategories';

const SITE_URL = 'https://fukues.com';

// ISR：10分ごとに再生成（サイト他ページと同じ周期。新規求人／サロンを反映する）。
export const revalidate = 600;

// サイトマップ（本プロジェクト初の sitemap。求人フェーズ1で新規作成）。
// 公開データのみを anon クライアントで読む（非表示サロンは RLS＋明示フィルタで除外）。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  // 公開サロン／公開サロン所属セラピスト／掲載中求人を並列取得。失敗時は空配列（サイトマップは壊さない）。
  const [salonsRes, therapistsRes, jobs, featureSlugs, areaTag, dispatchJobs, columnArticles, mainColumnArticles, xProfilesRes, xPostsRes] = await Promise.all([
    supabase.from('salons').select('id').eq('is_hidden', false),
    supabase.from('therapists').select('id, salons!inner(is_hidden)').eq('salons.is_hidden', false),
    fetchActiveJobsForSitemap(),
    // 求人が1件以上あるタグのみ（0件＝noindexページはsitemapに入れない）。
    fetchFeatureSlugsWithActiveJobs(),
    // 求人ありのエリア／エリア×タグペア（0件ペアはnoindexなのでsitemapに入れない）。
    fetchAreaTagPairsWithActiveJobs(),
    // 出張専門ページ（/jobs/dispatch）は求人が1件以上あるときのみ列挙（エリアページと同じ「求人あり」方針）。
    fetchActiveDispatchJobs(),
    // 公開コラム（work_articles・published のみ）。詳細URL＋公開記事のあるカテゴリページに使う。
    fetchPublishedArticlesForSitemap(),
    // 本体コラム（main_articles・published のみ）。/column 配下のURLに使う。
    fetchPublishedMainArticlesForSitemap(),
    // fukuX: 承認済みプロフィール全件＋トップレベル投稿全件（RLSに加え status='approved' を明示フィルタ）。
    supabase.from('x_profiles').select('handle').eq('status', 'approved'),
    supabase.from('x_posts').select('id, edited_at, created_at').is('parent_post_id', null),
  ]);

  const now = new Date();

  // 主要な静的ページ。
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/salons`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/diary`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    // 出勤中一覧・新人一覧・サロン新着情報（2026-07-12 canonical 明示とセットで sitemap 掲載）。
    { url: `${SITE_URL}/working`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/therapist/new`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/news`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/jobs`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    // コラム一覧（公開記事の有無に関わらず存在する静的ページ）。
    { url: `${SITE_URL}/jobs/column`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    // 本体コラム一覧（/column・利用者向け）。
    { url: `${SITE_URL}/column`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    // ポリシー類（法令対応・E-E-A-T用の静的ページ。更新頻度は低い）。
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/listing`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    // リンクバナー配布ページ（本体・ワーク。fukuX版 /x/banner と同じ yearly 0.3）。
    { url: `${SITE_URL}/banner`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/jobs/banner`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    // フクエスワークの規約・ポリシー（本体の特則。/x/terms 等と同じ yearly 0.3）。
    { url: `${SITE_URL}/jobs/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/jobs/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // 本体フクエスのエリア別サロンページ（/area/[slug]・全6スラッグ）。
  const areaPageEntries: MetadataRoute.Sitemap = AREA_SLUGS_LIST.map((slug) => ({
    url: `${SITE_URL}/area/${slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  const salonEntries: MetadataRoute.Sitemap = (salonsRes.data ?? []).map((s) => ({
    url: `${SITE_URL}/salon/${s.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const therapistEntries: MetadataRoute.Sitemap = (therapistsRes.data ?? []).map((t) => ({
    url: `${SITE_URL}/therapist/${t.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const jobEntries: MetadataRoute.Sitemap = jobs.map((j) => ({
    url: `${SITE_URL}/jobs/${j.id}`,
    lastModified: j.updatedAt ? new Date(j.updatedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  // 特徴タグページ（求人ありのタグのみ）。
  const tagEntries: MetadataRoute.Sitemap = featureSlugs.map((slug) => ({
    url: `${SITE_URL}/jobs/tag/${slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // エリア別求人ページ（求人ありの通常エリアのみ）。jobsAreaHref で /jobs/area/<slug> を生成。
  const areaEntries: MetadataRoute.Sitemap = areaTag.areas.map((area) => ({
    url: `${SITE_URL}${jobsAreaHref(area)}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // エリア×タグ掛け合わせページ（求人ありのペアのみ＝0件ペアはnoindexなので除外）。
  const areaTagEntries: MetadataRoute.Sitemap = areaTag.pairs.map(({ area, slug }) => ({
    url: `${SITE_URL}${jobsAreaHref(area)}/tag/${slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  // 出張専門ページ（/jobs/dispatch）。出張専門サロンの求人が1件以上あるときのみ列挙。
  const dispatchEntries: MetadataRoute.Sitemap =
    dispatchJobs.length > 0
      ? [{ url: `${SITE_URL}/jobs/dispatch`, lastModified: now, changeFrequency: 'daily', priority: 0.7 }]
      : [];

  // コラム詳細（/jobs/column/[slug]）。published のみ・lastModified は updated_at（無ければ now）。
  const columnArticleEntries: MetadataRoute.Sitemap = columnArticles.map((a) => ({
    url: `${SITE_URL}/jobs/column/${a.slug}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  // コラムのカテゴリ別ページ（/jobs/column/category/[key]）。
  // 既存のタグ/エリアと同じ「中身ありのみ」方針＝公開記事が1件以上あるカテゴリだけ列挙する
  // （0件カテゴリのページはsitemapに入れない）。順序は ARTICLE_CATEGORY_ORDER に従う。
  const publishedCategories = new Set(columnArticles.map((a) => a.category));
  const columnCategoryEntries: MetadataRoute.Sitemap = ARTICLE_CATEGORY_ORDER
    .filter((key) => publishedCategories.has(key))
    .map((key) => ({
      url: `${SITE_URL}/jobs/column/category/${key}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  // 本体コラム詳細（/column/[slug]）・カテゴリ別（/column/category/[key]）。ワーク側と同方針
  // （published のみ・カテゴリは公開記事が1件以上あるものだけ）。
  const mainColumnArticleEntries: MetadataRoute.Sitemap = mainColumnArticles.map((a) => ({
    url: `${SITE_URL}/column/${a.slug}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));
  const publishedMainCategories = new Set(mainColumnArticles.map((a) => a.category));
  const mainColumnCategoryEntries: MetadataRoute.Sitemap = MAIN_ARTICLE_CATEGORY_ORDER
    .filter((key) => publishedMainCategories.has(key))
    .map((key) => ({
      url: `${SITE_URL}/column/category/${key}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  // fukuX（/x配下）：トップ＋承認済みプロフィール＋トップレベル投稿。失敗時は空配列（サイトマップは壊さない）。
  const xStaticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/x`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    // ポリシー類（fukuX特則）。本体 /terms・/privacy と同じ扱い（yearly・低priority）。
    { url: `${SITE_URL}/x/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/x/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/x/banner`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/x/guide/user`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/x/guide/therapist`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/x/guide/shop`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ];

  const xProfileEntries: MetadataRoute.Sitemap = (xProfilesRes.data ?? []).map((p) => ({
    url: `${SITE_URL}/x/u/${encodeURIComponent(p.handle)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  const xPostEntries: MetadataRoute.Sitemap = (xPostsRes.data ?? []).map((r) => ({
    url: `${SITE_URL}/x/post/${r.id}`,
    lastModified: new Date(r.edited_at ?? r.created_at),
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [
    ...staticEntries,
    ...areaPageEntries,
    ...salonEntries,
    ...therapistEntries,
    ...jobEntries,
    ...tagEntries,
    ...areaEntries,
    ...areaTagEntries,
    ...dispatchEntries,
    ...columnCategoryEntries,
    ...columnArticleEntries,
    ...mainColumnCategoryEntries,
    ...mainColumnArticleEntries,
    ...xStaticEntries,
    ...xProfileEntries,
    ...xPostEntries,
  ];
}
