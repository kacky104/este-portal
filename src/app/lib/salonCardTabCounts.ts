import type { SupabaseClient } from '@supabase/supabase-js';
import { DIARY_NEW_WINDOW_MS } from '@/lib/diaryNew';
import { buildTabCounts, todayJstOf, type SalonCardTabCounts } from '@/lib/salonCardTabs';

// 店舗カードのタブに出す数（写メ日記・クーポン）を、全店ぶんまとめて読む（第1126便）。
//   ★ TOP の作り直し（ISR・revalidate 600）のときに1回だけ。2本を同時に読む。
//   ★ 行は salon_id だけ（クーポンは期限も）。数えるのはこちら側（PostgREST は店舗ごとの集計を返せない）。
//   ★ 写メ日記は48時間以内だけ＝行数は少ない。
//   ★ 読めなかったときは空を返す（タブは 0 件＝薄く出るだけ。TOP は止めない）。
//   ★ 口コミの数は salons.review_count、新人の数はカードが読んでいるセラピストから出すので、ここでは読まない。
export async function fetchSalonCardTabCounts(supabase: SupabaseClient, nowMs: number = Date.now()): Promise<SalonCardTabCounts> {
  try {
    const since = new Date(nowMs - DIARY_NEW_WINDOW_MS).toISOString();
    const [diaryRes, couponRes] = await Promise.all([
      supabase.from('diary_posts').select('salon_id').gte('created_at', since).limit(5000),
      supabase.from('coupons').select('salon_id, valid_until').eq('is_published', true).limit(5000),
    ]);
    if (diaryRes.error) console.error('[card-tabs] 写メ日記の数を読めなかった', diaryRes.error.message);
    if (couponRes.error) console.error('[card-tabs] クーポンの数を読めなかった', couponRes.error.message);
    return buildTabCounts(diaryRes.data, couponRes.data, todayJstOf(nowMs));
  } catch (e) {
    console.error('[card-tabs] 数を読めなかった', e instanceof Error ? e.message : e);
    return {};
  }
}
