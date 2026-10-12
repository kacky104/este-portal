import type { createPublicClient } from '@/app/lib/supabase/public';
import type { DailyShiftCard } from '@/app/salon/[id]/DailyShiftNews';
import { getBusinessDateJST, addBusinessDays, toBusinessElapsed } from '@/lib/dutyStatus';
import { pickDailyShift, dailyShiftTitle, DAILY_PICK_BADGE } from '@/lib/dailyShiftNews';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { formatBodySizes } from '@/lib/bodyType';
import { shiftRangeText } from '@/lib/scheduleFormat';

// セラピストNEWS（第1419便・2026-10-13・カッキーさん）。★ サーバー専用（公開の読み取りだけ）。
//
// ★ お知らせとは別のカテゴリー。その日の出勤から「本日の出勤速報」を1日1本作る（エステ魂の出勤速報ニュースと同じ形）。
// ★ DB には何も書かない。ページを作るたびに、出勤（therapist_schedules）と在籍のセラピストから作る。
// ★ 始まりは 2026-10-13（カッキーさん「過去の分はいらない・今日から」）。新しい順・最大30日。出勤0人の日は無い。
// ★ ピックアップの決まりは lib/dailyShiftNews.ts（イチオシ＝「店長おすすめ」タグから75%・お店×日で決まる）。
// ★ 過去の日の分も、その日の出勤から作り直す（いまの在籍・プロフィールで）。退店した方はその日の分から消える。

type PublicClient = ReturnType<typeof createPublicClient>;

export const THERAPIST_NEWS_START = '2026-10-13';
export const THERAPIST_NEWS_MAX_DAYS = 30;

export type TherapistNewsEntry = { date: string; title: string; featured: DailyShiftCard[]; others: DailyShiftCard[] };

/** 新しい順のセラピストNEWS。limit で本数を絞る（店舗トップは数本だけ） */
export async function loadTherapistNews(supabase: PublicClient, salonId: number, limit = THERAPIST_NEWS_MAX_DAYS): Promise<TherapistNewsEntry[]> {
  const today = getBusinessDateJST();
  const dates: string[] = [];
  for (let k = 0; k < THERAPIST_NEWS_MAX_DAYS; k++) {
    const d = addBusinessDays(today, -k);
    if (d < THERAPIST_NEWS_START) break;
    dates.push(d);
  }
  if (dates.length === 0) return [];

  const { data: ths } = await supabase
    .from('therapists')
    .select('id, name, age, body_type, profile_image_url, feature_badges, catchphrase')
    .eq('salon_id', salonId)
    .eq('is_active', true);
  const byId = new Map((ths ?? []).map((t) => [Number(t.id), t]));
  if (byId.size === 0) return [];
  const { data: sch } = await supabase
    .from('therapist_schedules')
    .select('therapist_id, schedule_date, start_time, end_time')
    .in('therapist_id', [...byId.keys()])
    .in('schedule_date', dates)
    .eq('is_active', true);

  const byDate = new Map<string, Array<DailyShiftCard & { startKey: number; isPick: boolean }>>();
  for (const r of sch ?? []) {
    if (!r.start_time || !r.end_time) continue;
    const t = byId.get(Number(r.therapist_id));
    if (!t) continue;
    const start = String(r.start_time).slice(0, 5);
    const end = String(r.end_time).slice(0, 5);
    const [h, mi] = start.split(':').map(Number);
    const list = byDate.get(String(r.schedule_date)) ?? [];
    list.push({
      id: Number(t.id),
      name: String(t.name ?? ''),
      age: typeof t.age === 'number' ? t.age : (Number(t.age) || null),
      hours: shiftRangeText(start, end),
      sizes: formatBodySizes((t.body_type as string | null) ?? null),
      catchphrase: String(t.catchphrase ?? '').trim(),
      imageUrl: (t.profile_image_url as string | null) ?? null,
      startKey: toBusinessElapsed(h * 60 + (mi || 0)),
      isPick: sanitizeBadges(t.feature_badges).includes(DAILY_PICK_BADGE),
    });
    byDate.set(String(r.schedule_date), list);
  }

  const out: TherapistNewsEntry[] = [];
  for (const d of dates) {
    const people = byDate.get(d);
    if (!people || people.length === 0) continue;
    const { featured, others } = pickDailyShift(people, salonId, d);
    out.push({ date: d, title: dailyShiftTitle(d, featured.map((p) => p.name)), featured, others });
    if (out.length >= limit) break;
  }
  return out;
}
