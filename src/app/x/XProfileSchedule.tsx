'use client';

// fukuX プロフィール（セラピスト）の「出勤スケジュール（7日間）」アコーディオン。
// 公開・ISRキャッシュ前提の /x/u/[handle] で日付凍結を避けるため、日付算出とスケジュール取得は
// すべてクライアントで行う（マウント時ではなく「開いたとき」に初回 fetch する遅延読み込み）。
// データは本体の therapist_schedules を流用し、整形は本体と共有の scheduleFormat を使う（二重メンテ回避）。

import { useState, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateRangeJST } from '@/lib/dutyStatus';
import { formatDate, formatTime, buildDisplayHours } from '@/lib/scheduleFormat';

const supabase = createClient();

type DaySched = { is_active: boolean; start_time: string | null; end_time: string | null };

export function XProfileSchedule({ therapistId }: { therapistId: number }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false); // 初回 fetch 済みか（開くまで取得しない）
  const [loading, setLoading] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [schedMap, setSchedMap] = useState<Record<string, DaySched>>({});

  // 初回展開時に「今日基準の7日間」をクライアントで確定し、その範囲だけ取得する。
  const load = useCallback(async () => {
    setLoading(true);
    const range = getBusinessDateRangeJST(7); // クライアントの現在時刻基準（ISRに焼かない）
    const { data } = await supabase
      .from('therapist_schedules')
      .select('schedule_date, is_active, start_time, end_time')
      .eq('therapist_id', therapistId)
      .in('schedule_date', range)
      .order('schedule_date', { ascending: true });

    const map: Record<string, DaySched> = {};
    (data ?? []).forEach((row) => {
      map[String(row.schedule_date)] = {
        is_active: Boolean(row.is_active),
        start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
        end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
      };
    });
    setDates(range);
    setSchedMap(map);
    setLoaded(true);
    setLoading(false);
  }, [therapistId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) load(); // 開いた瞬間に初回取得
  };

  return (
    <div className="x-card mt-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-black text-slate-800">出勤スケジュール（7日間）</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {loading && !loaded ? (
            <p className="text-xs text-slate-400 py-2">読み込み中...</p>
          ) : (
            <div className="space-y-2">
              {dates.map((date) => {
                const sched = schedMap[date];
                const isActive = sched?.is_active ?? false;
                const hours = isActive ? buildDisplayHours(sched.start_time, sched.end_time) : null;
                return (
                  <div
                    key={date}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm ${
                      isActive ? 'bg-pink-50 border border-pink-100' : 'bg-slate-50 border border-[color:var(--x-border)]'
                    }`}
                  >
                    <span className={`font-medium ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                      {formatDate(date)}
                    </span>
                    {isActive ? (
                      <span className="text-pink-600 font-bold text-xs">
                        🕒 {hours || `${formatTime(sched.start_time)}〜${formatTime(sched.end_time)}`}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">お休み</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
