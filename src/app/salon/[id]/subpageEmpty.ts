import { cache } from 'react';
import { createPublicClient } from '@/app/lib/supabase/public';
import { isNewFaceActive } from '@/lib/newFace';

// ★ 第1077便（2026-10-01）: 店舗の下層ページ（口コミ・写メ日記・新人・今すぐ）が【0件】のときは noindex にする。
//   本番の実測で、/salon/N/reviews（42字）・/newface（26字）・/imasugu（35字）・/diary（40字）が
//   どれも index 可・自己 canonical で検索エンジンに拾われていた（店舗ページのタブからリンクされている）。
//   中身が無いページを index させると、サイト全体の「薄いページ」の割合が上がる。
//   ★ 1件でも入れば自動で index 可に戻る（ISR の再生成で metadata も作り直される）。
//   ★ follow は true のまま（店舗ページ・セラピストページへのリンクの評価は流す）。
//   ★ 件数だけ数える（head:true）。React cache で同じリクエスト内の重複呼び出しは1回にまとまる。

/** 店舗宛て＋その店のセラピスト宛ての承認済み口コミの件数 */
export const countSalonReviews = cache(async (salonId: number): Promise<number> => {
  if (!Number.isFinite(salonId)) return 0;
  const supabase = createPublicClient();
  const { data: ths } = await supabase.from('therapists').select('id').eq('salon_id', salonId).eq('is_active', true);
  const ids = (ths ?? []).map((t) => t.id as number);
  const [bySalon, byTherapist] = await Promise.all([
    supabase.from('therapist_reviews').select('id', { count: 'exact', head: true }).eq('salon_id', salonId).is('therapist_id', null).eq('status', 'approved'),
    ids.length > 0
      ? supabase.from('therapist_reviews').select('id', { count: 'exact', head: true }).in('therapist_id', ids).eq('status', 'approved')
      : Promise.resolve({ count: 0 }),
  ]);
  return (bySalon.count ?? 0) + (byTherapist.count ?? 0);
});

/** その店の写メ日記の件数 */
export const countSalonDiary = cache(async (salonId: number): Promise<number> => {
  if (!Number.isFinite(salonId)) return 0;
  const supabase = createPublicClient();
  const { count } = await supabase.from('diary_posts').select('id', { count: 'exact', head: true }).eq('salon_id', salonId);
  return count ?? 0;
});

/** いま新人紹介中のセラピストの人数（isNewFaceActive と同じ判定） */
export const countSalonNewFace = cache(async (salonId: number): Promise<number> => {
  if (!Number.isFinite(salonId)) return 0;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('therapists')
    .select('is_new_face, new_face_since')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .eq('is_new_face', true);
  return (data ?? []).filter((t) => isNewFaceActive(Boolean(t.is_new_face), (t.new_face_since as string | null) ?? null)).length;
});

/** セラピスト宛ての承認済み口コミの件数 */
export const countTherapistReviews = cache(async (therapistId: number): Promise<number> => {
  if (!Number.isFinite(therapistId)) return 0;
  const supabase = createPublicClient();
  const { count } = await supabase.from('therapist_reviews').select('id', { count: 'exact', head: true }).eq('therapist_id', therapistId).eq('status', 'approved');
  return count ?? 0;
});
