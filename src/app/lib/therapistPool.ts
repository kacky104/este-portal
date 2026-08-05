// /therapists・/therapists/badge/[slug]・/working の初期表示リストをサーバー側で取得する（2026-08-05）。
// 従来はクライアント（TherapistSearch / WorkingTherapists の useEffect）だけで取得しており、
// 初期HTMLにセラピストへの <a> リンクが1本も出ない＝クローラから「中身なしページ」に見えていた。
// salonTherapists.ts と同じ「page（Server）が ISR で取得 → initialList で props 渡し」方式。
//
// - createPublicClient（cookie を触らない anon）を使うので ISR を壊さない。
// - 取得条件はクライアント側実装と完全に同一（activeOnly の有無だけ呼び出し元で切り替える：
//   TherapistSearch 系= is_active=true のみ／WorkingTherapists= 従来どおり絞らない）。
// - 並び替え（今すぐ→出勤中→…）は従来どおり各コンポーネント側で行う（このモジュールは取得のみ）。

import { createPublicClient } from '@/app/lib/supabase/public';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { sanitizeBadges } from '@/lib/therapistBadges';
import type { TherapistItem } from '@/app/components/TherapistScroller';

export type SalonAreaInfo = { area: string; area2: string; dispatchType: string };

const THERAPIST_SELECT =
  'id, name, work_hours, area, comment, salon_id, profile_image_url, age, is_available_now, available_until, is_available_now_cast, available_until_cast, is_new_face, new_face_since, feature_badges, salons!inner(is_hidden)';

export async function fetchTherapistPool(
  opts: { activeOnly?: boolean; filterSalonIds?: number[] } = {},
): Promise<{ list: TherapistItem[]; salonAreaMap: Record<number, SalonAreaInfo> }> {
  const supabase = createPublicClient();

  let query = supabase
    .from('therapists')
    .select(THERAPIST_SELECT)
    .eq('salons.is_hidden', false);
  if (opts.activeOnly) query = query.eq('is_active', true);
  if (opts.filterSalonIds) query = query.in('salon_id', opts.filterSalonIds);
  const { data: therapistData } = await query;

  const salonIds = [...new Set((therapistData ?? []).map((t) => t.salon_id as number).filter(Boolean))];

  const salonNameMap: Record<number, string> = {};
  const salonAreaMap: Record<number, SalonAreaInfo> = {};
  if (salonIds.length > 0) {
    const { data: salonData } = await supabase
      .from('salons')
      .select('id, name, area, area2, dispatch_type')
      .in('id', salonIds);
    for (const s of salonData ?? []) {
      const sid = s.id as number;
      salonNameMap[sid] = (s.name as string) ?? '';
      salonAreaMap[sid] = {
        area: (s.area as string) ?? '',
        area2: (s.area2 as string) ?? '',
        dispatchType: (s.dispatch_type as string) ?? 'none',
      };
    }
  }

  const rawIds = (therapistData ?? []).map((t) => t.id);
  const today = getBusinessDateJST();
  let schedRows: Array<{ therapist_id: unknown; is_active: unknown; start_time: unknown; end_time: unknown }> = [];
  if (rawIds.length > 0) {
    const { data } = await supabase
      .from('therapist_schedules')
      .select('therapist_id, is_active, start_time, end_time')
      .in('therapist_id', rawIds)
      .eq('schedule_date', today);
    schedRows = data ?? [];
  }
  const schedMap: Record<number, { is_active: boolean; start_time: string | null; end_time: string | null }> = {};
  schedRows.forEach((row) => {
    schedMap[row.therapist_id as number] = {
      is_active: Boolean(row.is_active),
      start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
      end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
    };
  });

  const list: TherapistItem[] = (therapistData ?? []).map((t) => ({
    id: String(t.id),
    name: (t.name as string) ?? '',
    salonId: t.salon_id as number,
    salonName: salonNameMap[t.salon_id as number] ?? '',
    workHours: (t.work_hours as string) ?? '',
    area: (t.area as string) ?? '',
    comment: (t.comment as string) ?? '',
    age: (t.age as string) ?? '',
    profileImageUrl: (t.profile_image_url as string | null) ?? null,
    today: schedMap[t.id as number] ?? { is_active: false, start_time: null, end_time: null },
    isAvailableNow: Boolean(t.is_available_now),
    availableUntil: (t.available_until as string | null) ?? null,
    isAvailableNowCast: Boolean(t.is_available_now_cast),
    availableUntilCast: (t.available_until_cast as string | null) ?? null,
    isNewFace: Boolean(t.is_new_face),
    newFaceSince: (t.new_face_since as string | null) ?? null,
    featureBadges: sanitizeBadges(t.feature_badges),
  }));

  return { list, salonAreaMap };
}
