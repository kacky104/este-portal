'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { isImasuguLiveCamel, imasuguUntilCamel } from '@/lib/imasugu';
import type { Salon } from '@/app/lib/salons';
import { IMASUGU_COLUMNS } from '@/lib/therapistColumns';

export type TherapistThumb = {
  id:             string;
  name:           string;
  age:            string;
  imageUrl:       string | null;
  workHours:      string;
  onDuty:         boolean;
  isAvailableNow: boolean;
  availableUntil: string | null;
  isAvailableNowCast: boolean;
  availableUntilCast: string | null;
  isAvailableNowImport: boolean;
  availableUntilImport: string | null;
  isNewFace:      boolean;
  newFaceSince:   string | null;
};

// サロンごとのセラピストサムネイルをクライアントで取得する共有フック。
// トップ／一覧（ShuffledSalons）と保存ページで同じデータ形を共有し、
// SalonCard の見た目を揃える。
export function useSalonTherapists(
  salons: Salon[]
): Record<number, TherapistThumb[]> {
  const [salonTherapists, setSalonTherapists] = useState<Record<number, TherapistThumb[]>>({});

  useEffect(() => {
    if (salons.length === 0) {
      setSalonTherapists({});
      return;
    }
    (async () => {
      const supabase = createClient();
      const salonIds = salons.map(s => s.id);

      const { data: therapistRowsWithAvail, error: tErr } = await supabase
        .from('therapists')
        .select(`id, name, age, salon_id, profile_image_url, work_hours, ${IMASUGU_COLUMNS}, is_new_face, new_face_since`)
        .in('salon_id', salonIds);

      let therapistRows = therapistRowsWithAvail;
      if (tErr) {
        const { data: fb } = await supabase
          .from('therapists')
          .select('id, name, age, salon_id, profile_image_url, work_hours')
          .in('salon_id', salonIds);
        // ★ 列が無い環境へのフォールバック。3枠すべてを明示的に埋めること（枠を増やしたらここも増やす）。
        therapistRows = (fb ?? []).map(t => ({ ...t, is_available_now: false, available_until: null, is_available_now_cast: false, available_until_cast: null, is_available_now_import: false, available_until_import: null, is_new_face: false, new_face_since: null }));
      }

      if (!therapistRows || therapistRows.length === 0) {
        setSalonTherapists({});
        return;
      }

      const today        = getBusinessDateJST();
      const therapistIds = therapistRows.map(t => t.id);

      const { data: schedRowsRaw } = await supabase
        .from('therapist_schedules')
        .select('therapist_id, start_time, end_time, is_active')
        .in('therapist_id', therapistIds)
        .eq('schedule_date', today);

      // is_active をクライアント側でフィルター（DB型の不一致を回避）
      const schedRows = (schedRowsRaw ?? []).filter(r => Boolean(r.is_active));

      const onDutySet = new Set(schedRows.map(r => String(r.therapist_id)));

      // スケジュールの実際の時間を "HH:MM〜HH:MM" 形式でマップ化
      const schedHoursMap: Record<string, string> = {};
      for (const row of schedRows ?? []) {
        const start = row.start_time ? String(row.start_time).slice(0, 5) : null;
        const end   = row.end_time   ? String(row.end_time).slice(0, 5)   : null;
        if (start && end) {
          schedHoursMap[String(row.therapist_id)] = `${start}〜${end}`;
        }
      }

      const bySalon: Record<number, TherapistThumb[]> = {};
      for (const t of therapistRows) {
        const sid = t.salon_id as number;
        const tid = String(t.id);
        if (!bySalon[sid]) bySalon[sid] = [];
        bySalon[sid].push({
          id:             tid,
          name:           (t.name as string) ?? '',
          age:            (t.age as string) ?? '',
          imageUrl:       (t.profile_image_url as string | null) ?? null,
          workHours:      schedHoursMap[tid] ?? (t.work_hours as string) ?? '',
          onDuty:         onDutySet.has(tid),
          isAvailableNow: Boolean((t as { is_available_now?: unknown }).is_available_now),
          availableUntil: ((t as { available_until?: unknown }).available_until as string | null) ?? null,
          isAvailableNowCast: Boolean((t as { is_available_now_cast?: unknown }).is_available_now_cast),
          availableUntilCast: ((t as { available_until_cast?: unknown }).available_until_cast as string | null) ?? null,
          isAvailableNowImport: Boolean((t as { is_available_now_import?: unknown }).is_available_now_import),
          availableUntilImport: ((t as { available_until_import?: unknown }).available_until_import as string | null) ?? null,
          isNewFace:      Boolean((t as { is_new_face?: unknown }).is_new_face),
          newFaceSince:   ((t as { new_face_since?: unknown }).new_face_since as string | null) ?? null,
        });
      }

      const isAvailableNowActive = (t: TherapistThumb) => isImasuguLiveCamel(t);

      const result: Record<number, TherapistThumb[]> = {};
      for (const [sid, items] of Object.entries(bySalon)) {
        // 「今すぐ」フラグを最優先 → 今すぐ同士は残り時間少ない順（有効期限昇順）→ 次に出勤中を優先
        // → 最後に写真ありを優先（写真なしのイニシャル代替サムネが店舗カードの先頭に
        //    並ぶと見栄えが悪いため・2026-08-22 オーナー指摘）。
        const photo = (t: TherapistThumb) => (t.imageUrl ? 0 : 1);
        result[Number(sid)] = items.sort((a, b) => {
          const la = isAvailableNowActive(a), lb = isAvailableNowActive(b);
          if (la !== lb) return Number(lb) - Number(la);
          if (la && lb) {
            const d = photo(a) - photo(b);
            if (d !== 0) return d;
            return imasuguUntilCamel(a) - imasuguUntilCamel(b);
          }
          if (a.onDuty !== b.onDuty) return Number(b.onDuty) - Number(a.onDuty);
          return photo(a) - photo(b);
        });
      }

      setSalonTherapists(result);
    })();
  }, [salons]);

  return salonTherapists;
}
