'use client';

// 週間スケジュールの日付の「希望していた人」バッジ（第1732便・2026-11-04・カッキーさん）。
// ★ 出勤数のバッジの右横に、その日に希望を出したまま確定していない人の数（0人は出さない）。押すと名前・希望時間・ひとこと。
// ★ 見るだけ。ここから出勤には変えない（店舗様がセラピストと直接やり取りする）。
// ★ コネックエフの週間スケジュールとマイページの出勤（ScheduleGrid）で同じものを使う。

import { useEffect, useState } from 'react';
import { getShiftWishes, type ShiftWish } from '@/app/actions/shift';
import { rangeLabel, shiftDateLabel, shiftDateTone } from '@/lib/shift';

/** 表に出ている日付の範囲の「希望していた人」を読む（読めなければ空） */
/** refreshKey が変わったら読み直す（出勤を保存したあと＝出勤が入った人を一覧から外すため） */
export function useShiftWishes(dates: readonly string[], refreshKey?: unknown): Record<string, ShiftWish[]> {
  const [wishes, setWishes] = useState<Record<string, ShiftWish[]>>({});
  const from = dates[0] ?? '', to = dates[dates.length - 1] ?? '';
  useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    getShiftWishes({ from, to }).then((w) => { if (alive) setWishes(w); }).catch(() => {});
    return () => { alive = false; };
  }, [from, to, refreshKey]);
  return wishes;
}

export function ShiftWishBadge({ date, wishes }: { date: string; wishes: ShiftWish[] | undefined }) {
  const [open, setOpen] = useState(false);
  const n = wishes?.length ?? 0;
  if (n === 0) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} title="希望を出していた人（押すと一覧）"
        className="ml-1 inline-block px-1.5 py-px text-[11px] font-black tabular-nums bg-amber-500 text-white hover:bg-amber-600">
        希望{n}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 text-left font-normal" onClick={() => setOpen(false)}>
          <div className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[17px] font-black ${shiftDateTone(date)}`}>{shiftDateLabel(date)} に希望を出していた人</p>
                <p className="text-[12px] text-slate-500">シフト提出で希望を出したまま、出勤が入っていない方です。出勤のお願いはセラピストと直接やり取りしてください。</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="shrink-0 px-3 py-1.5 border border-slate-300 text-[13px] font-bold text-slate-600">閉じる</button>
            </div>
            <ul className="divide-y divide-slate-100 border-y border-slate-100">
              {wishes!.map((w) => (
                <li key={w.therapistId} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-bold text-slate-800 truncate">{w.name}</span>
                    <span className="shrink-0 text-[14px] tabular-nums text-slate-700">{rangeLabel(w.s, w.e)}</span>
                  </div>
                  {w.note && <p className="text-[13px] text-amber-700 break-words">「{w.note}」</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
