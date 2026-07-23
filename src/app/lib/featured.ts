import type { FeaturedSalon } from '@/app/components/FeaturedSalonSlider';
import { createPublicClient } from '@/app/lib/supabase/public';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { cheapestCoursePrice } from '@/lib/coursePrice';

type PublicClient = ReturnType<typeof createPublicClient>;

// featured_salons から対象セットの行を取得する。
//   area === null  … トップ用の共通セット（area 列が NULL の行）
//   area === 値    … その地域ページ用のセット（area 列が一致する行）
// area 列が未追加（マイグレーション前）の場合、トップは後方互換として全件を共通セット扱いにする。
async function fetchFeaturedRows(supabase: PublicClient, area: string | null) {
  const base = () =>
    supabase
      .from('featured_salons')
      .select('salon_id, display_order, image_url, mobile_image_url')
      .order('display_order', { ascending: true })
      .limit(5);

  if (area === null) {
    const res = await base().is('area', null);
    if (res.error) {
      // area 列がまだ無い → 旧挙動（全件＝トップ）でフォールバック。
      const legacy = await base();
      return legacy.error ? [] : (legacy.data ?? []);
    }
    return res.data ?? [];
  }

  const res = await base().eq('area', area);
  return res.error ? [] : (res.data ?? []);
}

/**
 * ピックアップサロンを FeaturedSalon[] に組み立てて返す。
 * トップ（area=null）／各地域ページ（area=値）で共通利用。
 */
export async function getFeaturedSalons(
  supabase: PublicClient,
  area: string | null,
): Promise<FeaturedSalon[]> {
  const todayJST = getBusinessDateJST();

  const featuredRows = await fetchFeaturedRows(supabase, area);
  if (featuredRows.length === 0) return [];

  const featuredIds = featuredRows.map(r => r.salon_id as number);
  const imageUrlMap = Object.fromEntries(
    featuredRows.map(r => [r.salon_id as number, (r.image_url as string | null) ?? null])
  );
  const mobileImageUrlMap = Object.fromEntries(
    featuredRows.map(r => [r.salon_id as number, (r.mobile_image_url as string | null) ?? null])
  );

  const [{ data: featuredSalonData }, { data: therapistData }] = await Promise.all([
    supabase.from('salons').select('id, name, area, price, rating, courses').in('id', featuredIds),
    supabase.from('therapists').select('id, salon_id, profile_image_url')
      .in('salon_id', featuredIds)
      .not('profile_image_url', 'is', null),
  ]);

  // 本日出勤セット（出勤中セラピストのサムネイルを前に並べるため）。
  const therapistIds = (therapistData ?? []).map(t => t.id);
  let onDutySet = new Set<unknown>();
  if (therapistIds.length > 0) {
    const { data: schedData } = await supabase
      .from('therapist_schedules')
      .select('therapist_id')
      .in('therapist_id', therapistIds)
      .eq('schedule_date', todayJST)
      .eq('is_active', true);
    onDutySet = new Set((schedData ?? []).map(r => r.therapist_id));
  }

  const salonInfoMap = Object.fromEntries(
    (featuredSalonData ?? []).map(s => [s.id as number, s])
  );

  // display_order の順を維持（並びのランダム化は FeaturedSalonSlider 側でマウント後に行う）。
  return featuredIds
    .filter(id => salonInfoMap[id])
    .map(salonId => {
      const s = salonInfoMap[salonId];
      const therapists = (therapistData ?? []).filter(t => (t.salon_id as number) === salonId);
      const sorted = [...therapists].sort((a, b) =>
        (onDutySet.has(a.id) ? 0 : 1) - (onDutySet.has(b.id) ? 0 : 1)
      );
      return {
        salonId,
        salonName:       (s.name   as string) ?? '',
        area:            (s.area   as string) ?? '',
        // カード料金＝コースメニュー最安（salons一覧と同じ算出）。不可なら従来 price カラムにフォールバック。
        price:           cheapestCoursePrice(s.courses) || ((s.price  as string) ?? ''),
        rating:          (s.rating as number) ?? 0,
        imageUrl:        imageUrlMap[salonId] ?? undefined,
        mobileImageUrl:  mobileImageUrlMap[salonId] ?? undefined,
        therapistImages: sorted
          .map(t => t.profile_image_url as string | null)
          .filter((u): u is string => Boolean(u))
          .slice(0, 4),
      };
    });
}
