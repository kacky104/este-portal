'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST } from '@/lib/dutyStatus';
// トップページの「出勤中」ブロックと同じカード・同じ判定ロジックを流用（改変しない）
import { Card, getScheduleStatus, type TherapistItem } from '@/app/components/TherapistScroller';
import { sanitizeBadges } from '@/lib/therapistBadges';

export function WorkingTherapists() {
  const [list, setList] = useState<TherapistItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();

      // ── トップページの出勤中ブロックと同じデータ取得（同じスコープ：全サロン対象） ──
      const { data: therapistData } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment, salon_id, profile_image_url, age, is_available_now, available_until, is_new_face, new_face_since, feature_badges');

      const salonIds = [...new Set(
        (therapistData ?? []).map(t => t.salon_id as number).filter(Boolean)
      )];

      let salonMap: Record<number, string> = {};
      if (salonIds.length > 0) {
        const { data: salonData } = await supabase
          .from('salons')
          .select('id, name')
          .in('id', salonIds);
        salonMap = Object.fromEntries(
          (salonData ?? []).map(s => [s.id as number, (s.name as string) ?? ''])
        );
      }

      const rawIds = (therapistData ?? []).map(t => t.id);
      const today  = getBusinessDateJST();

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
      schedRows.forEach(row => {
        schedMap[row.therapist_id as number] = {
          is_active:  Boolean(row.is_active),
          start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
          end_time:   row.end_time   ? String(row.end_time).slice(0, 5)   : null,
        };
      });

      const mapped: TherapistItem[] = (therapistData ?? []).map(t => ({
        id:              String(t.id),
        name:            (t.name              as string) ?? '',
        salonId:         t.salon_id           as number,
        salonName:       salonMap[t.salon_id  as number] ?? '',
        workHours:       (t.work_hours        as string) ?? '',
        area:            (t.area              as string) ?? '',
        comment:         (t.comment           as string) ?? '',
        age:             (t.age               as string) ?? '',
        profileImageUrl: (t.profile_image_url as string | null) ?? null,
        today:           schedMap[t.id as number] ?? { is_active: false, start_time: null, end_time: null },
        isAvailableNow:  Boolean(t.is_available_now),
        availableUntil:  (t.available_until   as string | null) ?? null,
        isNewFace:       Boolean(t.is_new_face),
        newFaceSince:    (t.new_face_since     as string | null) ?? null,
        featureBadges:   sanitizeBadges(t.feature_badges),
      }));

      const isAvailableNowActive = (t: TherapistItem) =>
        t.isAvailableNow && t.availableUntil != null && new Date(t.availableUntil) > new Date();

      // ── 表示対象：今すぐ・出勤中のみ（出勤予定・受付終了・お休みは非表示。優先順：今すぐ > 出勤中） ──
      // 今日の出勤開始時刻（"HH:MM"）を分に変換。未設定は末尾扱い。
      const startMinutes = (t: TherapistItem): number => {
        const s = t.today.start_time;
        if (!s) return Number.MAX_SAFE_INTEGER;
        const [h, m] = s.split(':').map(Number);
        return h * 60 + (m || 0);
      };

      // 1. 今すぐ：残り時間が少ない順（available_until が近い順）
      const imasugu = mapped
        .filter(isAvailableNowActive)
        .sort((a, b) => new Date(a.availableUntil!).getTime() - new Date(b.availableUntil!).getTime());

      // 2. 出勤中（今すぐ該当を除く）：今日の出勤開始時刻が早い順
      const onDuty = mapped
        .filter(t => !isAvailableNowActive(t) && getScheduleStatus(t.today).status === 'onDuty')
        .sort((a, b) => startMinutes(a) - startMinutes(b));

      setList([...imasugu, ...onDuty]);
      setLoaded(true);
    })();
  }, []);

  if (loaded && list.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/20">
        現在、出勤中のセラピストはおりません ✿
      </div>
    );
  }

  // スマホ（<640px）のみ：gap を詰め、カードをセル幅いっぱい（元の比率）にして少し大きく表示。
  // デスクトップ（sm以上）は上書きせず従来どおり。カードコンポーネント自体は変更しない。
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-3 justify-items-center max-sm:[&>a]:!w-full max-sm:[&>a]:!h-auto max-sm:[&>a]:!aspect-[105/153]">
      {list.map((t, i) => <Card key={t.id} therapist={t} index={i} showAge />)}
    </div>
  );
}
