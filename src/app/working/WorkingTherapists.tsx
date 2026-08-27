'use client';

// SSR対応（2026-08-05）: page（Server）が fetchTherapistPool で取得したリストを initialList で
// 渡すと、初期HTMLに出勤中セラピストのカード（<a href="/therapist/N">）が焼き込まれる。
// 並び替え（今すぐ→出勤中）は render 側の useMemo に移し、SSR・クライアント取得の両経路で共用する。

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST } from '@/lib/dutyStatus';
// トップページの「出勤中」ブロックと同じカード・同じ判定ロジックを流用（改変しない）
import { Card, getScheduleStatus, type TherapistItem } from '@/app/components/TherapistScroller';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { isImasuguLiveCamel, imasuguUntilCamel } from '@/lib/imasugu';
import { seededShuffle, thirtyMinSeed } from '@/lib/shuffle';
import { THERAPIST_CARD_COLUMNS } from '@/lib/therapistColumns';

export function WorkingTherapists({
  filterSalonIds,
  initialList,
  initialSeed,
}: {
  filterSalonIds?: number[];
  initialList?: TherapistItem[];
  initialSeed?: number;
} = {}) {
  const hasInitial = initialList !== undefined;
  const [list, setList] = useState<TherapistItem[]>(initialList ?? []);
  const [loaded, setLoaded] = useState(hasInitial);
  // シャッフルseed（サーバーから渡されたものを固定で使い、SSRとhydrationの並びを一致させる）。
  const [seed] = useState<number>(() => initialSeed ?? thirtyMinSeed());

  useEffect(() => {
    if (hasInitial) return;
    (async () => {
      const supabase = createClient();

      // ── トップと同じデータ取得。filterSalonIds 指定時のみ そのエリアのサロン所属者に絞る（未指定=全サロン）。 ──
      // salons!inner＋is_hidden=false で、非表示サロン所属のセラピストは公開表示から除外する。
      let query = supabase
        .from('therapists')
        .select(THERAPIST_CARD_COLUMNS)
        .eq('salons.is_hidden', false);
      if (filterSalonIds) query = query.in('salon_id', filterSalonIds);
      const { data: therapistData } = await query;

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
        isAvailableNowCast: Boolean(t.is_available_now_cast),
        availableUntilCast: (t.available_until_cast as string | null) ?? null,
        isAvailableNowImport: Boolean(t.is_available_now_import),
        availableUntilImport: (t.available_until_import as string | null) ?? null,
        isNewFace:       Boolean(t.is_new_face),
        newFaceSince:    (t.new_face_since     as string | null) ?? null,
        featureBadges:   sanitizeBadges(t.feature_badges),
      }));

      setList(mapped);
      setLoaded(true);
    })();
  }, [filterSalonIds?.join(','), hasInitial]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 表示対象：今すぐ・出勤中のみ（出勤予定・受付終了・お休みは非表示。優先順：今すぐ > 出勤中） ──
  // 従来は fetch 直後に計算していたが、SSR（initialList 経由）でも同じ並びになるよう render 側へ移動。
  const ordered = useMemo(() => {
    const isAvailableNowActive = (t: TherapistItem) => isImasuguLiveCamel(t);

    // 今日の出勤開始時刻（"HH:MM"）を分に変換。未設定は末尾扱い。
    const startMinutes = (t: TherapistItem): number => {
      const s = t.today.start_time;
      if (!s) return Number.MAX_SAFE_INTEGER;
      const [h, m] = s.split(':').map(Number);
      return h * 60 + (m || 0);
    };

    // 1. 今すぐ：残り時間が少ない順（ライブ枠の有効期限の昇順。owner/cast 和集合対応）
    const imasugu = list
      .filter(isAvailableNowActive)
      .sort((a, b) => imasuguUntilCamel(a) - imasuguUntilCamel(b));

    // 2. 出勤中（今すぐ該当を除く）：開始時刻が早い順＋同時刻内は30分seedシャッフル。
    //    先にシャッフル→開始時刻で安定ソート（同時刻の相対順はシャッフル結果が残る）。
    const onDuty = seededShuffle(
      list.filter(t => !isAvailableNowActive(t) && getScheduleStatus(t.today).status === 'onDuty'),
      seed,
    ).sort((a, b) => startMinutes(a) - startMinutes(b));

    return [...imasugu, ...onDuty];
  }, [list, seed]);

  if (loaded && ordered.length === 0) {
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
      {ordered.map((t, i) => <Card key={t.id} therapist={t} index={i} showAge />)}
    </div>
  );
}
