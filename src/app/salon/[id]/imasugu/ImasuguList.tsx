'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { formatBodySizes } from '@/lib/bodyType';
import { isImasuguLiveRow, imasuguUntilRow } from '@/lib/imasugu';

// "HH:MM〜HH:MM"（日跨ぎは終了側に「翌」）。
function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const prefix = eh * 60 + (em || 0) < sh * 60 + (sm || 0) ? '翌' : '';
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}

type ImasuguTherapist = {
  id: string;
  name: string;
  age: string | null;
  workHours: string;
  bodyType: string | null;
  imageUrl: string | null;
  start: string | null;
  end: string | null;
};

// 「今すぐ」上段リスト。is_available_now=true かつ available_until が未来か、という時刻ベース判定を
// サーバー（ISRキャッシュ対象）ではなくマウント時の現在時刻で行う（焼き付き防止。トップの TherapistScroller と同方式）。
export function ImasuguList({
  salonId,
  cardBg,
  cardBorder,
  bodyColor,
}: {
  salonId: number;
  cardBg: string;
  cardBorder: string;
  bodyColor: string;
}) {
  const [list, setList] = useState<ImasuguTherapist[] | null>(null); // null=取得前

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: rows } = await supabase
          .from('therapists')
          .select('id, name, age, work_hours, body_type, profile_image_url, is_available_now, available_until, is_available_now_cast, available_until_cast')
          .eq('salon_id', salonId);

        const now = new Date();
        // 今すぐ抽出後、残り時間が少ない順（有効期限の昇順。ライブ枠の期限を見る）。
        const imasugu = (rows ?? [])
          .filter(t => isImasuguLiveRow(t, now))
          .sort((a, b) => imasuguUntilRow(a, now) - imasuguUntilRow(b, now));

        // 出勤時間表示用に当日スケジュールを取得。
        const ids = imasugu.map(t => t.id);
        const schedMap: Record<string, { start: string | null; end: string | null }> = {};
        if (ids.length > 0) {
          const today = getBusinessDateJST();
          const { data: sched } = await supabase
            .from('therapist_schedules')
            .select('therapist_id, start_time, end_time, is_active')
            .in('therapist_id', ids)
            .eq('schedule_date', today);
          (sched ?? []).forEach(r => {
            if (!r.is_active) return;
            schedMap[String(r.therapist_id)] = {
              start: r.start_time ? String(r.start_time).slice(0, 5) : null,
              end: r.end_time ? String(r.end_time).slice(0, 5) : null,
            };
          });
        }

        const built: ImasuguTherapist[] = imasugu.map(t => {
          const s = schedMap[String(t.id)];
          return {
            id: String(t.id),
            name: (t.name as string) ?? '',
            age: (t.age as string | null) ?? null,
            workHours: (t.work_hours as string) ?? '',
            bodyType: (t.body_type as string | null) ?? null,
            imageUrl: (t.profile_image_url as string | null) ?? null,
            start: s?.start ?? null,
            end: s?.end ?? null,
          };
        });
        if (active) setList(built);
      } catch {
        if (active) setList([]);
      }
    })();
    return () => { active = false; };
  }, [salonId]);

  if (list === null) return null; // 取得前は何も出さない（ちらつき防止）

  if (list.length === 0) {
    return (
      <p className="text-center text-base py-12 rounded-2xl" style={{ color: bodyColor }}>
        お店にお問い合わせください
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {list.map((t) => {
        const hours = buildDisplayHours(t.start, t.end) || t.workHours || '';
        const bodySizes = formatBodySizes(t.bodyType);
        return (
          <div
            key={t.id}
            className="imasugu-card-shine border shadow-sm overflow-hidden flex flex-col"
            style={{ backgroundColor: cardBg, borderColor: cardBorder }}
          >
            {/* 写真（大きめ）＋今すぐバッジ */}
            <div className="relative w-full aspect-[4/5] bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center overflow-hidden">
              {t.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.imageUrl} alt={t.name} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <span className="text-white/70 font-bold text-5xl">{(t.name || '?').charAt(0)}</span>
              )}
              <span
                className="absolute top-2.5 left-2.5 z-10"
                style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '13px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', whiteSpace: 'nowrap' }}
              >
                今すぐ
              </span>
              <div
                className="absolute inset-x-0 bottom-0 px-3 pt-10 pb-2 z-10 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.35) 45%, rgba(0,0,0,0))' }}
              >
                <p className="font-bold text-white truncate" style={{ fontSize: '18px', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                  {t.name || '(名前未設定)'}{t.age ? ` (${t.age})` : ''}
                </p>
              </div>
            </div>

            {/* 情報（スリーサイズ・出勤時間を1行に横並び） */}
            <div className="p-4 flex flex-col gap-2 flex-1">
              <div className="flex items-baseline gap-x-2 min-w-0 text-sm">
                {bodySizes && (
                  <span className="whitespace-nowrap flex-shrink-0" style={{ color: bodyColor }}>{bodySizes}</span>
                )}
                {hours && (
                  <span className="font-medium text-pink-600 whitespace-nowrap flex-shrink-0 ml-2">{hours}</span>
                )}
              </div>
              <Link
                href={`/therapist/${t.id}`}
                className="mt-auto inline-flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: '#ffffff', borderRadius: '9999px', padding: '10px 24px', fontWeight: 600 }}
              >
                プロフィールを見る
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
