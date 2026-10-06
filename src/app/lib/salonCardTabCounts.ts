import type { SupabaseClient } from '@supabase/supabase-js';
import { SALON_CARD_DIARY_WINDOW_MS } from '@/lib/diaryNew';
import { buildTabCounts, todayJstOf, type SalonCardTabCounts } from '@/lib/salonCardTabs';

// 店舗カードのタブに出す数（写メ日記・クーポン）を、全店ぶんまとめて読む（第1126便）。
//   ★ TOP の作り直し（ISR・revalidate 600）のときに1回だけ。2本を同時に読む。第1159便から地域ページ（/area/…・6つ）の作り直しでも同じ2本。
//   ★ クーポンの行は salon_id と期限だけ。数えるのはこちら側（PostgREST は店舗ごとの集計を返せない）。
//   ★ 第1128便: 写メ日記の行は、各店の新しい順2件を HTML に入れるために タイトル・本文・セラピスト名 も読む（本数は同じ2本のまま）。
//   ★ 写メ日記は60時間以内だけ（第1239便で 48→60）＝行数は少ない。
//   ★ 読めなかったときは空を返す（タブは 0 件＝薄く出るだけ。TOP は止めない）。
//   ★ 口コミの数は salons.review_count、新人の数はカードが読んでいるセラピストから出すので、ここでは読まない。
//   ★ 第1240便: salonIds を渡すと、その店舗の分だけ読む（お気に入り /saved 用＝ブラウザから読むので全店ぶんは読まない）。
//     渡さなければ今までどおり全店ぶん（TOP・地域ページ）。空の配列なら読まずに空を返す。
export async function fetchSalonCardTabCounts(
  supabase: SupabaseClient,
  nowMs: number = Date.now(),
  salonIds?: readonly number[],
): Promise<SalonCardTabCounts> {
  try {
    if (salonIds && salonIds.length === 0) return {};
    const since = new Date(nowMs - SALON_CARD_DIARY_WINDOW_MS).toISOString();
    // ★ 第1128便: 数える行に、行に出すもの（タイトル・本文・セラピスト名）も足して読む。新しい順（先頭2件を HTML に入れる）
    let diaryQ = supabase
      .from('diary_posts')
      .select('id, salon_id, therapist_id, title, content, created_at, therapists(name, age, profile_image_url)')
      .gte('created_at', since);
    let couponQ = supabase.from('coupons').select('salon_id, valid_until').eq('is_published', true);
    if (salonIds) {
      diaryQ = diaryQ.in('salon_id', [...salonIds]);
      couponQ = couponQ.in('salon_id', [...salonIds]);
    }
    const [diaryRes, couponRes] = await Promise.all([
      diaryQ.order('created_at', { ascending: false }).limit(5000),
      couponQ.limit(5000),
    ]);
    if (diaryRes.error) console.error('[card-tabs] 写メ日記の数を読めなかった', diaryRes.error.message);
    if (couponRes.error) console.error('[card-tabs] クーポンの数を読めなかった', couponRes.error.message);
    return buildTabCounts(diaryRes.data, couponRes.data, todayJstOf(nowMs));
  } catch (e) {
    console.error('[card-tabs] 数を読めなかった', e instanceof Error ? e.message : e);
    return {};
  }
}
