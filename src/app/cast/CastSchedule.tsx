'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getCastScheduleDay, type CastScheduleDay } from '@/app/actions/castSchedule';
import { addBusinessDays, getBusinessDateJST } from '@/lib/dutyStatus';

// /cast「スケジュール」（第599便）。★ 本人の行だけのタイムライン（CRM のスケジュールと同じ見た目の軸）。
// ★ 左の枠は置かない（第600便）。待機場所（部屋）は上の「出勤」の行にバッジで出し、そのぶんタイムラインを横いっぱいに使う。女子メモは出さない。
// ★ スマホでは枠を画面の左右いっぱいまで広げる（main の px-4 を -mx-4 で打ち消す）。
// ★ 予約は 時間・お客様の名前・コース。電話番号・料金・報酬は出さない。

const HOUR_W = 64; // 1時間の幅（px）
const ROW_H = 76;

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = ((min % 60) + 60) % 60;
  return `${h >= 24 ? `翌${h - 24}` : h}:${String(m).padStart(2, '0')}`;
}
function hourLabel(h: number): string {
  return h >= 24 ? `翌${h - 24}時` : `${h}時`;
}
function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${'日月火水木金土'[d.getUTCDay()]}）`;
}
function nowMinOf(date: string): number | null {
  const base = new Date(`${date}T00:00:00+09:00`).getTime();
  const m = Math.floor((Date.now() - base) / 60000);
  return m >= 360 && m < 1800 ? m : null;
}

export function CastSchedule() {
  const today = useMemo(() => getBusinessDateJST(), []);
  const [date, setDate] = useState(today);
  const [res, setRes] = useState<{ date: string; day: CastScheduleDay | null; err: string } | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getCastScheduleDay(date).then((r) => {
      if (!alive) return;
      setRes(r.ok ? { date, day: r.day, err: '' } : { date, day: null, err: r.error });
    });
    return () => { alive = false; };
  }, [date]);

  useEffect(() => {
    const tick = () => setNowMin(nowMinOf(date));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [date]);

  const loading = !res || res.date !== date;
  const day = res?.day ?? null;

  // 時間軸：設定の表示時間。出勤・予約がはみ出すときは広げる（見落とさないため）
  const axis = useMemo(() => {
    if (!day) return { start: 600, end: 1740 };
    let s = day.dayStartMin;
    let e = day.dayEndMin;
    for (const w of day.shifts) { s = Math.min(s, w.startMin); e = Math.max(e, w.endMin); }
    for (const b of day.bookings) { s = Math.min(s, b.startMin); e = Math.max(e, b.endMin); }
    return { start: Math.floor(s / 60) * 60, end: Math.ceil(e / 60) * 60 };
  }, [day]);

  const hours: number[] = [];
  for (let h = axis.start / 60; h < axis.end / 60; h++) hours.push(h);
  const x = (min: number) => ((min - axis.start) / 60) * HOUR_W;
  const width = hours.length * HOUR_W;

  // 開いたとき、今の時刻（今日）か出勤の始まりが左端近くに来るように横スクロールしておく（第600便）
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedDate = day?.date ?? null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !day) return;
    const target = date === today && nowMinOf(date) != null ? (nowMinOf(date) as number) - 60 : (day.shifts[0]?.startMin ?? day.bookings[0]?.startMin ?? null);
    if (target == null) { el.scrollLeft = 0; return; }
    el.scrollLeft = Math.max(0, ((target - axis.start) / 60) * HOUR_W - 8);
  }, [loadedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="-mx-4 bg-white px-2 py-4 shadow-sm ring-1 ring-black/5 sm:mx-0 sm:rounded-2xl sm:p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setDate(addBusinessDays(date, -1))} className="rounded-full border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-500">◀ 前日</button>
        <p className="flex-1 text-center text-[16px] font-black text-slate-800">{dayLabel(date)}</p>
        <button type="button" onClick={() => setDate(addBusinessDays(date, 1))} className="rounded-full border border-slate-200 px-3 py-1.5 text-[13px] font-bold text-slate-500">翌日 ▶</button>
      </div>
      {date !== today && (
        <p className="mt-2 text-center">
          <button type="button" onClick={() => setDate(today)} className="rounded-full bg-pink-50 px-3 py-1 text-[12px] font-bold text-pink-600">今日に戻る</button>
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-[14px] text-slate-400">読み込み中…</p>
      ) : res.err || !day ? (
        <p className="py-8 text-center text-[14px] text-slate-500">{res.err || '読み込めませんでした'}</p>
      ) : (
        <>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[13px] font-bold text-slate-600">
            <span className={`px-1.5 py-0.5 text-[12px] font-black ${day.room ? 'bg-[#1e2a5a] text-white' : 'border border-slate-300 text-slate-400'}`}>
              {day.room ? `部屋 ${day.room}` : '部屋 未定'}
            </span>
            <span>出勤 {day.shifts.length > 0 ? day.shifts.map((w) => `${hhmm(w.startMin)}〜${hhmm(w.endMin)}`).join(' / ') : 'なし'}
</span>
            {day.breakStartMin != null && day.breakEndMin != null && <span className="text-slate-400">休憩 {hhmm(day.breakStartMin)}〜{hhmm(day.breakEndMin)}</span>}
          </p>

          {/* タイムライン：横いっぱい・横にスクロール（第600便で左の部屋の枠を外した） */}
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div ref={scrollRef} className="overflow-x-auto">
              <div className="relative" style={{ width }}>
                <div className="flex h-8 border-b border-slate-200">
                  {hours.map((h) => (
                    <div key={h} className="flex-none border-r border-slate-100 pl-1 text-[11px] font-bold leading-8 text-slate-400" style={{ width: HOUR_W }}>{hourLabel(h)}</div>
                  ))}
                </div>
                <div className="relative" style={{ height: ROW_H }}>
                  {hours.map((h) => (
                    <div key={h} className="absolute top-0 bottom-0 border-r border-slate-100" style={{ left: x(h * 60), width: HOUR_W }} />
                  ))}
                  {day.shifts.map((w, i) => (
                    <div key={i} className="absolute top-0 bottom-0 bg-pink-50" style={{ left: x(w.startMin), width: x(w.endMin) - x(w.startMin) }} />
                  ))}
                  {day.breakStartMin != null && day.breakEndMin != null && (
                    <div className="absolute top-0 bottom-0 bg-slate-200/70" style={{ left: x(day.breakStartMin), width: x(day.breakEndMin) - x(day.breakStartMin) }} title="休憩" />
                  )}
                  {day.bookings.map((b, i) => (
                    <div
                      key={i}
                      className="absolute top-1.5 bottom-1.5 overflow-hidden rounded-md border border-sky-300 bg-sky-50 px-1.5 py-1 text-[11px] leading-tight text-slate-700"
                      style={{ left: x(b.startMin) + 1, width: Math.max(x(b.endMin) - x(b.startMin) - 2, 24) }}
                      title={`${hhmm(b.startMin)}〜${hhmm(b.endMin)} ${b.customerName}様 ${b.course}`}
                    >
                      <p className="truncate font-black">{hhmm(b.startMin)}〜{hhmm(b.endMin)}</p>
                      <p className="truncate font-bold">{b.customerName ? `${b.customerName}様` : ''}</p>
                      <p className="truncate text-slate-500">{b.course}</p>
                    </div>
                  ))}
                  {nowMin != null && nowMin >= axis.start && nowMin <= axis.end && (
                    <div className="absolute top-0 bottom-0 w-[2px] bg-rose-500" style={{ left: x(nowMin) }} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 一覧（スマホで横にスクロールしなくても読めるように） */}
          {day.bookings.length === 0 ? (
            <p className="mt-4 text-center text-[13px] text-slate-400">この日の予約はまだありません</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {day.bookings.map((b, i) => (
                <li key={i} className="flex items-baseline gap-3 py-2 text-[14px]">
                  <span className="w-[112px] flex-none font-black text-slate-800">{hhmm(b.startMin)}〜{hhmm(b.endMin)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-slate-700">{b.customerName ? `${b.customerName}様` : 'お客様'}</span>
                    <span className="ml-2 text-[13px] text-slate-500">{b.course}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">お店が入れた予約です。時間の変更やキャンセルは、お店に伝えてください。</p>
        </>
      )}
    </section>
  );
}
