// 公式ホームページ（/hp/[slug]）のデータ組み立て層（2026-08-08 段階2）。
//
// ここで全ブロックぶんのデータを一度に組み立て、ひな形（_templates/）には
// 「同じ形の props」を渡す。ひな形はレイアウトと装飾だけを持ち、データ取得をしない
// （＝ひな形を増やしてもこのファイルは変わらない。設計メモ6章の境界線）。
//
// - createPublicClient（anon・cookie なし）で取得するため、呼び出し元ページの ISR が効く。
// - 掲載データ（salons / therapists / therapist_schedules / coupons / announcements /
//   salon_free_pages）をそのまま流用する＝二重入力なし。
// - 写メ日記・口コミは iframe 埋め込み（/embed/salon/[id]/*）を使うためここでは取得しない
//   （重複コンテンツ回避。設計メモ4章）。

import { createPublicClient } from '@/app/lib/supabase/public';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { sanitizeBadges } from '@/lib/therapistBadges';
import {
  type HpSite,
  type HpSiteStatus,
  isHpSiteStatus,
  isHpTemplateKey,
  sanitizeHpBlocks,
  sanitizeHpBanners,
  sanitizeHpHeroImages,
} from '@/app/lib/hpSite';

export type HpCourse = { name: string; duration: string; price: string };

export type HpTherapist = {
  id:          string;
  name:        string;
  age:         number | null;
  imageUrl:    string | null;
  onDuty:      boolean;        // 本日出勤か
  todayTime:   string | null;  // 「12:00〜22:00」形式（出勤日のみ）
  catchphrase: string;         // ひとことキャッチ（therapists.catchphrase）
  bodyType:    string;         // 体型（therapists.body_type）
  badges:      string[];       // 特徴バッジ（lib/therapistBadges の sanitizeBadges 済みラベル）
};

export type HpCouponItem = { id: string; title: string; discount: string; conditions: string };
export type HpNewsItem   = { id: string; title: string; content: string; createdAt: string };
export type HpFreePage   = { id: number; title: string; body: string; images: string[] };

export type HpPageData = {
  site:   HpSite;
  salon: {
    id:          number;
    name:        string;
    catchphrase: string;
    area:        string;
    address:     string;
    access:      string;
    hours:       string;
    closedDays:  string;
    phone:       string;
    lineUrl:     string;
    jobsEnabled: boolean;
  };
  courses:    HpCourse[];
  therapists: HpTherapist[];
  coupons:    HpCouponItem[];
  news:       HpNewsItem[];
  freePages:  HpFreePage[];
  /** フクエスワークの求人ID（求人リンクブロック用。無ければ null） */
  jobId:      number | null;
  /** 本日の営業日（JST・午前6時切替）の表示ラベル（例「8/9 (土)」）。出勤ブロックの日付表示用 */
  todayLabel: string;
};

function mapSiteRow(row: Record<string, unknown>): HpSite {
  const status = row.status;
  const template = row.template_key;
  return {
    salon_id:          Number(row.salon_id),
    slug:              (row.slug as string) ?? '',
    domain:            (row.domain as string | null) ?? null,
    status:            (isHpSiteStatus(status) ? status : 'draft') as HpSiteStatus,
    template_key:      isHpTemplateKey(template) ? template : 'a',
    theme_key:         (row.theme_key as string) ?? '',
    hero_images:       sanitizeHpHeroImages(row.hero_images),
    hero_catch:        (row.hero_catch as string) ?? '',
    concept_title:     (row.concept_title as string) ?? '',
    concept_text:      (row.concept_text as string) ?? '',
    concept_image_url: (row.concept_image_url as string | null) ?? null,
    blocks:            sanitizeHpBlocks(row.blocks),
    banners:           sanitizeHpBanners(row.banners),
    updated_at:        (row.updated_at as string) ?? '',
  };
}

/** HH:MM:SS → HH:MM（therapist_schedules の time 列表示用） */
function hm(v: unknown): string {
  const s = String(v ?? '');
  return /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5) : s;
}

/**
 * slug から公開ページ用データ一式を取得する。サイト行が無ければ null。
 * status のゲート（live 以外は準備中ページ）は呼び出し側（page.tsx）で行う。
 */
export async function fetchHpPageData(slug: string): Promise<HpPageData | null> {
  const supabase = createPublicClient();

  const { data: siteRow } = await supabase
    .from('salon_sites')
    .select('salon_id, slug, domain, status, template_key, theme_key, hero_images, hero_catch, concept_title, concept_text, concept_image_url, blocks, banners, updated_at')
    .eq('slug', slug)
    .maybeSingle();
  if (!siteRow) return null;
  const site = mapSiteRow(siteRow as Record<string, unknown>);
  const salonId = site.salon_id;

  const { data: salonRow } = await supabase
    .from('salons')
    .select('id, name, catchphrase, area, address, access, hours, closed_days, phone, line_url, jobs_enabled, courses, is_hidden')
    .eq('id', salonId)
    .maybeSingle();
  if (!salonRow || salonRow.is_hidden) return null;

  const today = getBusinessDateJST();

  const [therapistRes, schedRes, couponRes, newsRes, freeRes, jobRes] = await Promise.all([
    supabase
      .from('therapists')
      .select('id, name, age, profile_image_url, catchphrase, body_type, feature_badges')
      .eq('salon_id', salonId),
    supabase
      .from('therapist_schedules')
      .select('therapist_id, is_active, start_time, end_time')
      .eq('schedule_date', today),
    supabase
      .from('coupons')
      .select('id, title, discount, conditions')
      .eq('salon_id', salonId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('announcements')
      .select('id, title, content, created_at')
      .eq('salon_id', salonId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('salon_free_pages')
      .select('id, title, body, images')
      .eq('salon_id', salonId)
      .order('display_order', { ascending: true })
      .limit(3),
    supabase
      .from('salon_jobs')
      .select('id')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  // 出勤マップ（本日・is_active のみ）
  const dutyMap = new Map<string, { start: string; end: string }>();
  (schedRes.data ?? []).forEach((r) => {
    if (r.is_active) dutyMap.set(String(r.therapist_id), { start: hm(r.start_time), end: hm(r.end_time) });
  });

  const therapists: HpTherapist[] = (therapistRes.data ?? []).map((t) => {
    const duty = dutyMap.get(String(t.id)) ?? null;
    return {
      id:          String(t.id),
      name:        (t.name as string) ?? '',
      age:         (t.age as number | null) ?? null,
      imageUrl:    (t.profile_image_url as string | null) ?? null,
      onDuty:      duty !== null,
      todayTime:   duty ? `${duty.start}〜${duty.end}` : null,
      catchphrase: (t.catchphrase as string | null) ?? '',
      bodyType:    (t.body_type as string | null) ?? '',
      badges:      sanitizeBadges(t.feature_badges),
    };
  });
  // 出勤中を先頭に（並びの安定のため名前で二次ソート）
  therapists.sort((x, y) => Number(y.onDuty) - Number(x.onDuty) || x.name.localeCompare(y.name, 'ja'));

  const courses: HpCourse[] = Array.isArray(salonRow.courses)
    ? (salonRow.courses as Record<string, unknown>[])
        .map((c) => ({
          name:     String(c?.name ?? ''),
          duration: String(c?.duration ?? ''),
          price:    String(c?.price ?? ''),
        }))
        .filter((c) => c.duration !== '' && c.price !== '')
    : [];

  return {
    site,
    salon: {
      id:          Number(salonRow.id),
      name:        (salonRow.name as string) ?? '',
      catchphrase: (salonRow.catchphrase as string) ?? '',
      area:        (salonRow.area as string) ?? '',
      address:     (salonRow.address as string) ?? '',
      access:      (salonRow.access as string) ?? '',
      hours:       (salonRow.hours as string) ?? '',
      closedDays:  (salonRow.closed_days as string) ?? '',
      phone:       (salonRow.phone as string) ?? '',
      lineUrl:     (salonRow.line_url as string) ?? '',
      jobsEnabled: Boolean(salonRow.jobs_enabled),
    },
    courses,
    therapists,
    coupons: (couponRes.data ?? []).map((c) => ({
      id: String(c.id), title: (c.title as string) ?? '', discount: (c.discount as string) ?? '', conditions: (c.conditions as string) ?? '',
    })),
    news: (newsRes.data ?? []).map((n) => ({
      id: String(n.id), title: (n.title as string) ?? '', content: (n.content as string) ?? '', createdAt: (n.created_at as string) ?? '',
    })),
    freePages: (freeRes.data ?? []).map((f) => ({
      id: Number(f.id), title: (f.title as string) ?? '', body: (f.body as string) ?? '',
      images: Array.isArray(f.images) ? (f.images as string[]).filter((u) => typeof u === 'string') : [],
    })),
    jobId: jobRes.data ? Number(jobRes.data.id) : null,
    todayLabel: formatTodayLabel(today),
  };
}

/** 'YYYY-MM-DD' → 「M/D (曜)」。営業日基準の日付をそのまま表示する。 */
function formatTodayLabel(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getUTCDay()];
  return `${Number(m[2])}/${Number(m[3])} (${wd})`;
}
