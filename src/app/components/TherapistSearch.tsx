'use client';

// 特徴バッジ（＋エリア）でセラピストを絞り込む検索クライアント。
// - 全アクティブセラピストを取得し（非表示サロン所属・非公開は除外）、クライアントで絞り込む。
// - 特徴バッジは therapistBadges.ts の定義をそのまま利用。複数選択は AND（すべて満たす）。
// - 並びは「今すぐ → 出勤中 → その他（30分ごとシャッフル）」。カードは既存 TherapistScroller の Card を流用。
// - 条件は URL（?b=バッジA,バッジB &area=...）に同期し、共有・リロードで復元できる。

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { Card, getScheduleStatus, type TherapistItem } from '@/app/components/TherapistScroller';
import {
  sanitizeBadges,
  BADGE_CATEGORY_ORDER,
  BADGES_BY_CATEGORY,
  BADGE_CATEGORY_LABELS,
  getBadgeColors,
} from '@/lib/therapistBadges';
import { isImasuguLiveCamel, imasuguUntilCamel } from '@/lib/imasugu';
import { seededShuffle, thirtyMinSeed } from '@/lib/shuffle';
import { AREA_ORDER, ALL_AREA, salonInArea } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

type SalonAreaInfo = { area: string; area2: string; dispatchType: string };

const CHIP_ACTIVE = 'bg-pink-600 text-white shadow-md shadow-pink-500/25';
const CHIP_INACTIVE =
  'border border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:text-pink-600 shadow-sm';

export function TherapistSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [list, setList] = useState<TherapistItem[]>([]);
  const [salonAreaMap, setSalonAreaMap] = useState<Record<number, SalonAreaInfo>>({});
  const [loaded, setLoaded] = useState(false);

  // ── 全アクティブセラピスト＋所属サロン＋本日スケジュールを取得（WorkingTherapists と同じ取り方）。 ──
  useEffect(() => {
    (async () => {
      const supabase = createClient();

      const { data: therapistData } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment, salon_id, profile_image_url, age, is_available_now, available_until, is_available_now_cast, available_until_cast, is_new_face, new_face_since, feature_badges, salons!inner(is_hidden)')
        .eq('salons.is_hidden', false)
        .eq('is_active', true);

      const salonIds = [...new Set((therapistData ?? []).map((t) => t.salon_id as number).filter(Boolean))];

      const salonNameMap: Record<number, string> = {};
      const areaMap: Record<number, SalonAreaInfo> = {};
      if (salonIds.length > 0) {
        const { data: salonData } = await supabase
          .from('salons')
          .select('id, name, area, area2, dispatch_type')
          .in('id', salonIds);
        for (const s of salonData ?? []) {
          const sid = s.id as number;
          salonNameMap[sid] = (s.name as string) ?? '';
          areaMap[sid] = {
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

      const mapped: TherapistItem[] = (therapistData ?? []).map((t) => ({
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

      setSalonAreaMap(areaMap);
      setList(mapped);
      setLoaded(true);
    })();
  }, []);

  // ── URL から現在の絞り込み状態を読む。 ──
  const area = searchParams.get('area') || ALL_AREA;
  const selectedBadges = useMemo(
    () => (searchParams.get('b') || '').split(',').map((s) => s.trim()).filter(Boolean),
    [searchParams],
  );

  const pushParams = (next: URLSearchParams) => {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setArea = (a: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (a === ALL_AREA) p.delete('area');
    else p.set('area', a);
    pushParams(p);
  };
  const toggleBadge = (badge: string) => {
    const set = new Set(selectedBadges);
    if (set.has(badge)) set.delete(badge);
    else set.add(badge);
    const p = new URLSearchParams(searchParams.toString());
    if (set.size) p.set('b', Array.from(set).join(','));
    else p.delete('b');
    pushParams(p);
  };
  const resetAll = () => pushParams(new URLSearchParams());

  // ── 絞り込み＋並び替え（今すぐ → 出勤中 → その他）。 ──
  const ordered = useMemo(() => {
    const results = list.filter((t) => {
      if (selectedBadges.length && !selectedBadges.every((b) => t.featureBadges.includes(b))) return false;
      if (area !== ALL_AREA) {
        const info = salonAreaMap[t.salonId];
        if (!info || !salonInArea(info, area)) return false;
      }
      return true;
    });

    const imasugu = results
      .filter((t) => isImasuguLiveCamel(t))
      .sort((a, b) => imasuguUntilCamel(a) - imasuguUntilCamel(b));
    const onDuty = seededShuffle(
      results.filter((t) => !isImasuguLiveCamel(t) && getScheduleStatus(t.today).status === 'onDuty'),
      thirtyMinSeed(),
    );
    const usedIds = new Set([...imasugu, ...onDuty].map((t) => t.id));
    const rest = seededShuffle(results.filter((t) => !usedIds.has(t.id)), thirtyMinSeed());
    return [...imasugu, ...onDuty, ...rest];
  }, [list, salonAreaMap, selectedBadges, area]);

  const hasFilter = area !== ALL_AREA || selectedBadges.length > 0;

  return (
    <div>
      {/* ── 絞り込みパネル ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-5 mb-6">
        {/* エリア */}
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">エリア</p>
          <div className="flex flex-wrap gap-1.5">
            {AREA_ORDER.map((a) => {
              const active = area === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setArea(a)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${active ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {areaLabel(a)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 特徴バッジ（カテゴリ別・複数選択＝AND） */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">特徴バッジ（すべてを満たすセラピストを表示）</p>
          <div className="space-y-2.5">
            {BADGE_CATEGORY_ORDER.map((cat) => (
              <div key={cat}>
                <p className="text-[11px] text-slate-400 mb-1">{BADGE_CATEGORY_LABELS[cat]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {BADGES_BY_CATEGORY[cat].map((badge) => {
                    const active = selectedBadges.includes(badge);
                    const colors = getBadgeColors(badge);
                    return (
                      <button
                        key={badge}
                        type="button"
                        onClick={() => toggleBadge(badge)}
                        className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold border transition-all"
                        style={
                          active && colors
                            ? { background: colors.fill, color: colors.text, borderColor: colors.border }
                            : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' }
                        }
                      >
                        {badge}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 件数＋リセット ── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">
          該当 <span className="font-bold text-pink-600">{loaded ? ordered.length : '…'}</span> 名
        </p>
        {hasFilter && (
          <button
            type="button"
            onClick={resetAll}
            className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 border border-slate-200 bg-white hover:text-pink-600 hover:border-pink-300"
          >
            条件をクリア
          </button>
        )}
      </div>

      {/* ── 結果一覧 ── */}
      {!loaded ? (
        <div className="py-20 text-center text-slate-400 text-sm">読み込み中…</div>
      ) : ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-40">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <p className="text-sm mb-3">条件に合うセラピストが見つかりませんでした</p>
          {hasFilter && (
            <button type="button" onClick={resetAll} className="px-4 py-2 rounded-full text-sm font-medium text-pink-600 border border-pink-200 bg-white hover:bg-pink-50">
              条件をクリアして全員表示
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-3 justify-items-center max-sm:[&>a]:!w-full max-sm:[&>a]:!h-auto max-sm:[&>a]:!aspect-[105/153]">
          {ordered.map((t, i) => (
            <Card key={t.id} therapist={t} index={i} showAge />
          ))}
        </div>
      )}

      {/* トップへ戻る導線 */}
      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-slate-500 hover:text-pink-600">
          ← トップへ戻る
        </Link>
      </div>
    </div>
  );
}
