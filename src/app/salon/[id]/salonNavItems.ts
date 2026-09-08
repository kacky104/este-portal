// 店舗詳細（トップ・サブページ・セラピスト本人ページ）の【スマホ右ドロワー】の中身を作る（第219便・2026-09-08）。
// ★ クイックナビと同じ11個・同じ順・同じ数字。★ 店舗トップは page.tsx が既に持っている数字を渡す（ここは呼ばない）。
//   サブページと本人ページはこの関数で数字を引く（head count の軽いクエリ 5本＋求人1本・すべて並列）。
// ★ createPublicClient（anon）で読むので ISR を壊さない。★ 失敗しても数字が 0 になるだけ（一覧は出る）。
import { createPublicClient } from '@/app/lib/supabase/public';
import { getSalonReviewStats } from '@/app/lib/reviews';
import { fetchActiveJobsBySalon } from '@/app/lib/jobs';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import type { SalonNavItem } from './SalonMobileNav';

export type SalonNavCounts = {
  onDutyCount: number;
  diaryRecentCount: number;
  reviewCount: number;
  couponCount: number;
  announcementRecentCount: number;
  fukuxUrl: string | null;
  activeJobHref: string | null;
};

/** 数字から11個の項目を組み立てる（★ 判断はこの1か所。店舗トップも同じ関数を使う）。 */
export function buildSalonNavItems(salonId: number, c: SalonNavCounts): SalonNavItem[] {
  const id = salonId;
  return [
    { key: 'schedule', label: '本日出勤', href: `/salon/${id}/schedule`, count: c.onDutyCount },
    { key: 'imasugu', label: '今すぐ', href: `/salon/${id}/imasugu` },
    { key: 'diary', label: '写メ日記', href: `/salon/${id}/diary`, count: c.diaryRecentCount },
    { key: 'price', label: '料金', href: `/salon/${id}/price` },
    { key: 'reviews', label: '口コミ', href: `/salon/${id}/reviews`, count: c.reviewCount },
    { key: 'coupon', label: 'クーポン', href: `/salon/${id}/coupon`, count: c.couponCount },
    { key: 'therapists', label: 'セラピスト一覧', href: `/salon/${id}/therapists` },
    { key: 'news', label: 'お知らせ', href: `/salon/${id}/news`, count: c.announcementRecentCount },
    { key: 'info', label: '店舗情報', href: `/salon/${id}/info` },
    ...(c.fukuxUrl ? [{ key: 'fukux', label: 'fukuX', href: c.fukuxUrl, external: true }] : []),
    ...(c.activeJobHref ? [{ key: 'jobs', label: '女性求人', href: c.activeJobHref }] : []),
  ];
}

/** サブページ・本人ページ用: 数字をDBから引いて11個を組み立てる。 */
export async function fetchSalonNavItems(salonId: number): Promise<SalonNavItem[]> {
  const supabase = createPublicClient();
  const todayISO = getBusinessDateJST();
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const couponTodayJST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

  // ★ 在籍（is_active）の id を先に引く（出勤・日記は therapist_id でしか絞れないため）。
  const { data: ths } = await supabase.from('therapists').select('id').eq('salon_id', salonId).eq('is_active', true);
  const therapistIds = (ths ?? []).map((t) => t.id as number);

  const [salonRes, schedRes, diaryRes, couponRes, newsRes, reviewStats, jobs] = await Promise.all([
    supabase.from('salons').select('fukux_url').eq('id', salonId).maybeSingle(),
    therapistIds.length > 0
      ? supabase.from('therapist_schedules').select('therapist_id').in('therapist_id', therapistIds).eq('schedule_date', todayISO).eq('is_active', true)
      : Promise.resolve({ data: [] as Array<{ therapist_id: number }> }),
    therapistIds.length > 0
      ? supabase.from('diary_posts').select('id', { count: 'exact', head: true }).in('therapist_id', therapistIds).gte('created_at', cutoff48h)
      : Promise.resolve({ count: 0 }),
    supabase.from('coupons').select('id', { count: 'exact', head: true }).eq('salon_id', salonId).eq('is_published', true).or(`valid_until.is.null,valid_until.gte.${couponTodayJST}`),
    supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('salon_id', salonId).eq('is_published', true).gte('published_at', cutoff48h),
    getSalonReviewStats(salonId),
    fetchActiveJobsBySalon(salonId),
  ]);

  return buildSalonNavItems(salonId, {
    onDutyCount: new Set(((schedRes.data ?? []) as Array<{ therapist_id: number }>).map((r) => String(r.therapist_id))).size,
    diaryRecentCount: (diaryRes as { count?: number | null }).count ?? 0,
    reviewCount: reviewStats.count,
    couponCount: (couponRes as { count?: number | null }).count ?? 0,
    announcementRecentCount: (newsRes as { count?: number | null }).count ?? 0,
    fukuxUrl: ((salonRes.data as { fukux_url?: string | null } | null)?.fukux_url) ?? null,
    activeJobHref: jobs.length > 0 ? `/jobs/${jobs[0].id}` : null,
  });
}
