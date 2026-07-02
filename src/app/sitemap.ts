import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchActiveJobsForSitemap } from '@/app/lib/jobs';

const SITE_URL = 'https://fukues.com';

// ISR：10分ごとに再生成（サイト他ページと同じ周期。新規求人／サロンを反映する）。
export const revalidate = 600;

// サイトマップ（本プロジェクト初の sitemap。求人フェーズ1で新規作成）。
// 公開データのみを anon クライアントで読む（非表示サロンは RLS＋明示フィルタで除外）。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  // 公開サロン／公開サロン所属セラピスト／掲載中求人を並列取得。失敗時は空配列（サイトマップは壊さない）。
  const [salonsRes, therapistsRes, jobs] = await Promise.all([
    supabase.from('salons').select('id').eq('is_hidden', false),
    supabase.from('therapists').select('id, salons!inner(is_hidden)').eq('salons.is_hidden', false),
    fetchActiveJobsForSitemap(),
  ]);

  const now = new Date();

  // 主要な静的ページ。
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/salons`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/diary`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/jobs`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ];

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

  return [...staticEntries, ...salonEntries, ...therapistEntries, ...jobEntries];
}
