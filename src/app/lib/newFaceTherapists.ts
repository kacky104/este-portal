import { createPublicClient } from '@/app/lib/supabase/public';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { sanitizeBadges } from '@/lib/therapistBadges';
import type { TherapistItem } from '@/app/components/TherapistScroller';

type PublicClient = ReturnType<typeof createPublicClient>;

// 新人セラピスト（NEW判定＝is_new_face=true かつ new_face_since が30日以内。src/lib/newFace.ts の既存定義を再利用）を
// new_face_since 昇順＝「NEWの残り日数が少ない（終了が近い）順」で取得し、TherapistScroller の Card がそのまま使える TherapistItem[] に組み立てる。
// - 公開ページ専用（createPublicClient＝anon）。cookie を触らないので呼び出し元の ISR（revalidate）が有効。
// - salons!inner(is_hidden=false) で非表示サロン所属は除外（TherapistScroller と同条件）。
// - 出勤状況バッジ用に本日 therapist_schedules も取得（サロンカード＝ShuffledSalons と同水準の鮮度）。
// - limit 指定時は残り日数が少ない順で上位のみ（トップの横スクロールは35件程度、一覧ページは無指定＝全件）。
export async function fetchNewFaceTherapists(
  supabase: PublicClient,
  limit?: number,
): Promise<TherapistItem[]> {
  const { data: therapistData } = await supabase
    .from('therapists')
    .select('id, name, work_hours, area, comment, salon_id, profile_image_url, age, is_available_now, available_until, is_available_now_cast, available_until_cast, is_new_face, new_face_since, feature_badges, salons!inner(is_hidden)')
    .eq('salons.is_hidden', false)
    .eq('is_new_face', true);

  // 30日ウィンドウで絞り（既存の isNewFaceActive と同一判定）、new_face_since 昇順に並べる
  // ＝ NEW付与が古い順＝「NEWマークの残り日数が少ない（終了が近い）順」。もうすぐ新人でなくなる子を先に見せる。
  const active = (therapistData ?? [])
    .filter((t) => isNewFaceActive(true, t.new_face_since as string | null))
    .sort((a, b) => {
      const ta = a.new_face_since ? new Date(a.new_face_since as string).getTime() : 0;
      const tb = b.new_face_since ? new Date(b.new_face_since as string).getTime() : 0;
      return ta - tb;
    });

  const limited = typeof limit === 'number' ? active.slice(0, limit) : active;
  if (limited.length === 0) return [];

  const salonIds = [...new Set(limited.map((t) => t.salon_id as number).filter(Boolean))];
  let salonMap: Record<number, string> = {};
  if (salonIds.length > 0) {
    const { data: salonData } = await supabase.from('salons').select('id, name').in('id', salonIds);
    salonMap = Object.fromEntries((salonData ?? []).map((s) => [s.id as number, (s.name as string) ?? '']));
  }

  const ids = limited.map((t) => t.id);
  const today = getBusinessDateJST();
  let schedRows: Array<{ therapist_id: unknown; is_active: unknown; start_time: unknown; end_time: unknown }> = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from('therapist_schedules')
      .select('therapist_id, is_active, start_time, end_time')
      .in('therapist_id', ids)
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

  return limited.map((t) => ({
    id: String(t.id),
    name: (t.name as string) ?? '',
    salonId: t.salon_id as number,
    salonName: salonMap[t.salon_id as number] ?? '',
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
}
