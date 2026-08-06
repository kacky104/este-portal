import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchAllRows } from '@/app/lib/fetchAllRows';
import { fetchActiveJobsForSitemap, fetchFeatureSlugsWithActiveJobs, fetchAreaTagPairsWithActiveJobs, fetchActiveDispatchJobs } from '@/app/lib/jobs';
import { fetchPublishedArticlesForSitemap } from '@/app/lib/workArticles';
import { fetchPublishedMainArticlesForSitemap } from '@/app/lib/mainArticles';
import { jobsAreaHref, AREA_SLUGS_LIST } from '@/app/lib/areas';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { badgeToSlug } from '@/lib/therapistBadgeSlugs';
import { ARTICLE_CATEGORY_ORDER } from '@/app/lib/articleCategories';
import { MAIN_ARTICLE_CATEGORY_ORDER } from '@/app/lib/mainArticleCategories';

const SITE_URL = 'https://fukues.com';

// ISR：10分ごとに再生成（サイト他ページと同じ周期。新規求人／サロンを反映する）。
export const revalidate = 600;

// lastModified の方針（2026-08-05 変更）:
// 従来は実データの無い行に `new Date()` を入れていたため、revalidate（10分）ごとに
// 「全ページがたった今更新された」という嘘のシグナルを送り続けていた。Google は lastmod が
// 信用できないサイトではこのシグナル自体を無視するため、実更新日時（updated_at 等）を持つ
// エントリだけに lastModified を付け、持たないものは省略する（省略は仕様上問題ない）。

// Supabase(PostgREST) の既定 max-rows=1000 対策の全件ページング。
// /salons でも使うため src/app/lib/fetchAllRows.ts に移した（2026-08-06）。

// サイトマップ（本プロジェクト初の sitemap。求人フェーズ1で新規作成）。
// 公開データのみを anon クライアントで読む（非表示サロンは RLS＋明示フィルタで除外）。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  // 公開サロン／公開サロン所属セラピスト／掲載中求人を並列取得。失敗時は空配列（サイトマップは壊さない）。
  // ※salons/therapists/x_profiles/x_posts は fetchAllRows で全件ページング（.order は範囲取得の安定化に必須）。
  //   求人・コラムは件数規模が小さく lib 側取得のまま（1000件が見えてきたら同様にページング化する）。
  const [salonRows, therapistRows, diaryRows, jobs, featureSlugs, areaTag, dispatchJobs, columnArticles, mainColumnArticles, xProfileRows, xPostRows] = await Promise.all([
    // updated_at は 20260806 マイグレーションで追加（bump・今すぐ系だけの変更では動かないトリガつき）。
    // courses は /salon/[id]/price を sitemap に入れるかの判定にだけ使う（0件＝準備中表示なので入れない）。
    fetchAllRows<{ id: number; updated_at: string | null; courses: unknown }>((from, to) =>
      supabase.from('salons').select('id, updated_at, courses').eq('is_hidden', false).order('id').range(from, to)),
    // is_active=true のみ。退店・非公開セラピストを載せると 404 が sitemap 経由で発生する
    // （2026-07-28: /therapist/38・/therapist/40 が Search Console で「見つかりませんでした(404)」）。
    fetchAllRows<{ id: number; salon_id: number; feature_badges: unknown; updated_at: string | null }>((from, to) =>
      supabase.from('therapists').select('id, salon_id, feature_badges, updated_at, salons!inner(is_hidden)').eq('salons.is_hidden', false).eq('is_active', true).order('id').range(from, to)),
    // 写メ日記の詳細（/diary/[diary_id]）。従来は sitemap に一切載っておらず、
    // 内部リンク（/diary の1ページ目・各セラピストの日記一覧）からしか発見できなかった。
    // 公開サロン所属の日記のみ（salons!inner + is_hidden=false）。退店セラピストの日記は
    // 下で「公開セラピストID集合」と突き合わせて除外する（詳細ページ側が404にするため）。
    fetchAllRows<{ id: number; therapist_id: number; created_at: string | null }>((from, to) =>
      supabase.from('diary_posts').select('id, therapist_id, created_at, salons!inner(is_hidden)').eq('salons.is_hidden', false).order('id').range(from, to)),
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
    // fukuX: 承認済みプロフィール全件＋トップレベル投稿全件。
    // x_posts には status 列が無く、公開可否は「投稿者プロフィールが approved か」で決まる。
    // author_profile_id を取得し、下で承認済みプロフィールの id 集合と突き合わせて絞る（2026-07-28）。
    fetchAllRows<{ id: number; handle: string }>((from, to) =>
      supabase.from('x_profiles').select('id, handle').eq('status', 'approved').order('id').range(from, to)),
    fetchAllRows<{ id: number; author_profile_id: unknown; edited_at: string | null; created_at: string | null }>((from, to) =>
      supabase.from('x_posts').select('id, author_profile_id, edited_at, created_at').is('parent_post_id', null).order('id').range(from, to)),
  ]);

  // 主要な静的ページ（lastModified は実更新日時を持たないため省略）。
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/salons`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/diary`, changeFrequency: 'daily', priority: 0.6 },
    // 全店舗の口コミ一覧（新着順）。
    { url: `${SITE_URL}/reviews`, changeFrequency: 'daily', priority: 0.6 },
    // fukuX承認店舗の一覧（TOP「📣 SNS」からの導線・各店 /x/u へのハブページ）。
    { url: `${SITE_URL}/x-shops`, changeFrequency: 'daily', priority: 0.6 },
    // 出勤中一覧・新人一覧・サロン新着情報（2026-07-12 canonical 明示とセットで sitemap 掲載）。
    { url: `${SITE_URL}/working`, changeFrequency: 'daily', priority: 0.6 },
    // 特徴バッジ・エリアでのセラピスト検索ページ。
    { url: `${SITE_URL}/therapists`, changeFrequency: 'daily', priority: 0.7 },
    // 人気ランキング（トップ・ハンバーガーメニューから導線があり実在するが、
    // sitemap から漏れていた。2026-07-28 追加）。
    { url: `${SITE_URL}/ranking`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/therapist/new`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/news`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/jobs`, changeFrequency: 'daily', priority: 0.8 },
    // お仕事マッチング（求職者向けCVページ。sitemap から漏れていた。2026-08-05 追加）。
    { url: `${SITE_URL}/jobs/matching`, changeFrequency: 'monthly', priority: 0.6 },
    // コラム一覧（公開記事の有無に関わらず存在する静的ページ）。
    { url: `${SITE_URL}/jobs/column`, changeFrequency: 'daily', priority: 0.7 },
    // 本体コラム一覧（/column・利用者向け）。
    { url: `${SITE_URL}/column`, changeFrequency: 'daily', priority: 0.7 },
    // ポリシー類（法令対応・E-E-A-T用の静的ページ。更新頻度は低い）。
    // 運営者情報（E-E-A-T用の静的ページ。2026-07-23追加）。
    { url: `${SITE_URL}/about`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/listing`, changeFrequency: 'yearly', priority: 0.3 },
    // /contact は noindex（contact/page.tsx）のため sitemap に載せない（2026-08-05）。
    // noindex ページを sitemap に入れると GSC で「送信されたURLに noindex タグ」エラーになる。
    // 会員登録案内（/join）。ポリシー類より更新頻度は高く、集客導線でもあるので monthly 0.5。
    { url: `${SITE_URL}/join`, changeFrequency: 'monthly', priority: 0.5 },
    // リンクバナー配布ページ（本体・ワーク。fukuX版 /x/banner と同じ yearly 0.3）。
    { url: `${SITE_URL}/banner`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/jobs/banner`, changeFrequency: 'yearly', priority: 0.3 },
    // フクエスワークの規約・ポリシー（本体の特則。/x/terms 等と同じ yearly 0.3）。
    { url: `${SITE_URL}/jobs/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/jobs/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // 本体フクエスのエリア別サロンページ（/area/[slug]・全6スラッグ）。
  const areaPageEntries: MetadataRoute.Sitemap = AREA_SLUGS_LIST.map((slug) => ({
    url: `${SITE_URL}/area/${slug}`,
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  const salonEntries: MetadataRoute.Sitemap = salonRows.map((s) => ({
    url: `${SITE_URL}/salon/${s.id}`,
    ...(s.updated_at ? { lastModified: new Date(s.updated_at) } : {}),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const therapistEntries: MetadataRoute.Sitemap = therapistRows.map((t) => ({
    url: `${SITE_URL}/therapist/${t.id}`,
    ...(t.updated_at ? { lastModified: new Date(t.updated_at) } : {}),
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  // サロン配下サブページ（2026-08-06 追加）。固有 title/description・自己参照 canonical・
  // BreadcrumbList まで整備済みなのに sitemap には本体 /salon/[id] しか無かった。
  //
  // ただし既存の「中身ありのみ」方針（0件バッジ・0件タグを載せない）に合わせ、
  // **中身が必ず埋まる3種だけ**に絞る:
  //   - /info      … salons の店舗基本情報から常に生成される
  //   - /price     … courses が1件以上あるサロンのみ
  //   - /therapists… 公開セラピストが1名以上いるサロンのみ
  // /reviews・/diary・/news・/coupon は中身が0件のことがあり、薄いページを大量に送信すると
  // 「検出 - インデックス未登録」を増やすだけなので入れない（内部リンクからは到達できる）。
  // /imasugu は時刻ベースでクライアント描画＝初期HTMLが実質空なので同様に除外。
  // /book・/review/new は noindex なので当然対象外。
  const therapistCountBySalon = new Map<number, number>();
  for (const t of therapistRows) {
    therapistCountBySalon.set(t.salon_id, (therapistCountBySalon.get(t.salon_id) ?? 0) + 1);
  }
  const salonSubpageEntries: MetadataRoute.Sitemap = salonRows.flatMap((s) => {
    const subs: string[] = ['info'];
    if (Array.isArray(s.courses) && s.courses.length > 0) subs.push('price');
    if ((therapistCountBySalon.get(s.id) ?? 0) > 0) subs.push('therapists');
    return subs.map((sub) => ({
      url: `${SITE_URL}/salon/${s.id}/${sub}`,
      ...(s.updated_at ? { lastModified: new Date(s.updated_at) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    }));
  });

  // 写メ日記の詳細（/diary/[diary_id]）。公開サロン所属かつ公開セラピストの投稿のみ。
  // 退店（is_active=false）セラピストの日記は詳細ページ側が 404 になるため sitemap に載せない。
  const publicTherapistIds = new Set(therapistRows.map((t) => String(t.id)));
  const diaryEntries: MetadataRoute.Sitemap = diaryRows
    .filter((d) => publicTherapistIds.has(String(d.therapist_id)))
    .map((d) => ({
      url: `${SITE_URL}/diary/${d.id}`,
      ...(d.created_at ? { lastModified: new Date(d.created_at) } : {}),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    }));

  // 特徴バッジ別ランディングページ（/therapists/badge/[slug]）。
  // 「中身ありのみ」方針：公開（is_active）セラピストが実際に持つバッジのスラッグだけを列挙し、
  // 0件バッジ（＝空ページ）は sitemap に入れない（求人タグページと同じ考え方）。
  const usedBadgeSlugs = (() => {
    const set = new Set<string>();
    for (const t of therapistRows) {
      for (const label of sanitizeBadges(t.feature_badges)) {
        const slug = badgeToSlug(label);
        if (slug) set.add(slug);
      }
    }
    return [...set];
  })();
  const therapistBadgeEntries: MetadataRoute.Sitemap = usedBadgeSlugs.map((slug) => ({
    url: `${SITE_URL}/therapists/badge/${slug}`,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const jobEntries: MetadataRoute.Sitemap = jobs.map((j) => ({
    url: `${SITE_URL}/jobs/${j.id}`,
    ...(j.updatedAt ? { lastModified: new Date(j.updatedAt) } : {}),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  // 特徴タグページ（求人ありのタグのみ）。
  const tagEntries: MetadataRoute.Sitemap = featureSlugs.map((slug) => ({
    url: `${SITE_URL}/jobs/tag/${slug}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // エリア別求人ページ（求人ありの通常エリアのみ）。jobsAreaHref で /jobs/area/<slug> を生成。
  const areaEntries: MetadataRoute.Sitemap = areaTag.areas.map((area) => ({
    url: `${SITE_URL}${jobsAreaHref(area)}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // エリア×タグ掛け合わせページ（求人ありのペアのみ＝0件ペアはnoindexなので除外）。
  const areaTagEntries: MetadataRoute.Sitemap = areaTag.pairs.map(({ area, slug }) => ({
    url: `${SITE_URL}${jobsAreaHref(area)}/tag/${slug}`,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  // 出張専門ページ（/jobs/dispatch）。出張専門サロンの求人が1件以上あるときのみ列挙。
  const dispatchEntries: MetadataRoute.Sitemap =
    dispatchJobs.length > 0
      ? [{ url: `${SITE_URL}/jobs/dispatch`, changeFrequency: 'daily', priority: 0.7 }]
      : [];

  // コラム詳細（/jobs/column/[slug]）。published のみ・lastModified は updated_at（無ければ省略）。
  const columnArticleEntries: MetadataRoute.Sitemap = columnArticles.map((a) => ({
    url: `${SITE_URL}/jobs/column/${a.slug}`,
    ...(a.updatedAt ? { lastModified: new Date(a.updatedAt) } : {}),
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
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  // 本体コラム詳細（/column/[slug]）・カテゴリ別（/column/category/[key]）。ワーク側と同方針
  // （published のみ・カテゴリは公開記事が1件以上あるものだけ）。
  const mainColumnArticleEntries: MetadataRoute.Sitemap = mainColumnArticles.map((a) => ({
    url: `${SITE_URL}/column/${a.slug}`,
    ...(a.updatedAt ? { lastModified: new Date(a.updatedAt) } : {}),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));
  const publishedMainCategories = new Set(mainColumnArticles.map((a) => a.category));
  const mainColumnCategoryEntries: MetadataRoute.Sitemap = MAIN_ARTICLE_CATEGORY_ORDER
    .filter((key) => publishedMainCategories.has(key))
    .map((key) => ({
      url: `${SITE_URL}/column/category/${key}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  // fukuX（/x配下）：トップ＋承認済みプロフィール＋トップレベル投稿。失敗時は空配列（サイトマップは壊さない）。
  const xStaticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/x`, changeFrequency: 'daily', priority: 0.8 },
    // ポリシー類（fukuX特則）。本体 /terms・/privacy と同じ扱い（yearly・低priority）。
    { url: `${SITE_URL}/x/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/x/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/x/banner`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/x/guide/user`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/x/guide/therapist`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/x/guide/shop`, changeFrequency: 'monthly', priority: 0.4 },
  ];

  const xProfileEntries: MetadataRoute.Sitemap = xProfileRows.map((p) => ({
    url: `${SITE_URL}/x/u/${encodeURIComponent(p.handle)}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  // 承認済みプロフィールの投稿のみ（未承認・保留中の投稿者のURLは sitemap に載せない）。
  // lastModified は edited_at → created_at の順で採用。両方 null なら省略
  // （new Date(null) は Invalid Date → toISOString() 例外で sitemap 全体が落ちるため）。
  const approvedProfileIds = new Set(xProfileRows.map((p) => String(p.id)));
  const xPostEntries: MetadataRoute.Sitemap = xPostRows
    .filter((r) => approvedProfileIds.has(String(r.author_profile_id)))
    .map((r) => {
      const ts = r.edited_at ?? r.created_at;
      return {
        url: `${SITE_URL}/x/post/${r.id}`,
        ...(ts ? { lastModified: new Date(ts) } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.4,
      };
    });

  return [
    ...staticEntries,
    ...areaPageEntries,
    ...salonEntries,
    ...salonSubpageEntries,
    ...therapistEntries,
    ...diaryEntries,
    ...therapistBadgeEntries,
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
