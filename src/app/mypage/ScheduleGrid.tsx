'use client';

// マイページ「出勤」の週間スケジュール（第649便・2026-09-22・カッキーさんの指示）。
// ★ コネックエフの週間スケジュール（src/app/conecf/schedule/page.tsx）と同じ形：セラピスト×7日のマス。
//   ★ マスを押すと、その日の出勤を選ぶ小窓が開く。★ 変えたマスは色が付き、下の「保存する」でまとめて保存。
//   ★ 時刻は30分刻みの選択だけ（コネックエフと同じ選択肢・src/lib/conecfSchedule.ts）。
// ★ 色はマイページのピンク。★ 保存の中身（30分に寄せる・upsert・再検証）は page.tsx の saveSchedules に1つだけ。
// ★ 表示だけの部品。★ 通信もDBも触らない（保存は onSave に任せる）。

import { useEffect, useMemo, useState } from 'react';
import { startTimeOptions, endTimeOptions, shiftLabel } from '@/lib/conecfSchedule';

export type GridDay = { is_active: boolean; start_time: string | null; end_time: string | null };
export type GridTherapist = { id: string; name: string | null; imageUrl: string | null; isActive: boolean; isNew: boolean };

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const CARD = 'bg-white border border-slate-100 shadow-sm';

function dateHead(d: string, i: number): { top: string; sub: string; tone: string } {
  const [y, m, dd] = d.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return { top: `${m}/${dd}`, sub: i === 0 ? `今日(${WD[w]})` : WD[w], tone: w === 0 ? 'text-rose-500' : w === 6 ? 'text-sky-600' : 'text-slate-600' };
}

const EMPTY: GridDay = { is_active: false, start_time: null, end_time: null };

export function ScheduleGrid(props: {
  days: string[];
  therapists: GridTherapist[];
  saved: Record<string, Record<string, GridDay>>;
  locked: boolean;
  onSave: (edits: Record<string, Record<string, GridDay>>) => Promise<boolean>;
}) {
  const { days, therapists, saved, locked, onSave } = props;
  const [edits, setEdits] = useState<Record<string, GridDay>>({});
  const [open, setOpen] = useState<{ id: string; date: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const key = (id: string, date: string) => `${id}#${date}`;
  const savedOf = (id: string, date: string): GridDay => saved[id]?.[date] ?? EMPTY;
  const cellOf = (id: string, date: string): GridDay => edits[key(id, date)] ?? savedOf(id, date);
  const dirtyCount = Object.keys(edits).length;

  useEffect(() => {
    if (dirtyCount === 0) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [dirtyCount]);

  const setCell = (id: string, date: string, next: GridDay) => {
    const o = savedOf(id, date);
    const same = o.is_active === next.is_active && (!next.is_active || (o.start_time === next.start_time && o.end_time === next.end_time));
    setEdits((p) => {
      const n = { ...p };
      if (same) delete n[key(id, date)]; else n[key(id, date)] = next;
      return n;
    });
  };

  const save = async () => {
    const byT: Record<string, Record<string, GridDay>> = {};
    for (const [k, v] of Object.entries(edits)) {
      const [id, date] = k.split('#');
      (byT[id] ??= {})[date] = v;
    }
    setSaving(true);
    const ok = await onSave(byT);
    setSaving(false);
    if (ok) setEdits({});
  };

  // ★ 公開の方だけ数える（★ 非公開の方はサイトに出ないため・コネックエフと同じ）
  const countOf = (d: string) => therapists.filter((t) => t.isActive && cellOf(t.id, d).is_active).length;
  const openT = useMemo(() => (open ? therapists.find((t) => t.id === open.id) ?? null : null), [open, therapists]);
  const openCell = open && openT ? cellOf(openT.id, open.date) : null;

  const endLabel = (c: GridDay) => {
    const l = shiftLabel({ isActive: c.is_active, start: c.start_time, end: c.end_time });
    const i = l.indexOf('〜');
    return i >= 0 ? l.slice(i + 1) : l;
  };

  return (
    <div className="space-y-3">
      <div className={`${CARD} overflow-x-auto`}>
        {/* ★ 日付のマスはいつも同じ幅（table-fixed）。★ スマホは横にすべらせる */}
        <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="bg-pink-50/60">
              <th className="sticky left-0 z-10 bg-pink-50 text-left px-1.5 sm:px-3 py-2 border-b border-pink-100 w-[64px] sm:w-[150px] text-[12px] text-slate-400">セラピスト</th>
              {days.map((d, i) => {
                const h = dateHead(d, i);
                const n = countOf(d);
                return (
                  <th key={d} className={`px-1 py-2 border-b border-l border-pink-100 text-center ${i === 0 ? 'bg-pink-100/70' : ''}`}>
                    <div className={`text-[13px] font-black ${h.tone}`}>{h.top}</div>
                    <div className={`text-[11px] font-bold ${h.tone}`}>{h.sub}</div>
                    <div className="mt-0.5">
                      <span className={`inline-block min-w-[34px] px-1.5 py-px text-[11px] font-black tabular-nums ${n > 0 ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{n}名</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {therapists.map((t) => (
              <tr key={t.id} className={`border-t border-slate-100 ${t.isActive ? '' : 'opacity-50'}`}>
                <th className="sticky left-0 z-10 bg-white text-left px-1.5 sm:px-3 py-2 font-bold text-slate-700">
                  <span className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-2">
                    {t.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={t.imageUrl} alt="" width={40} height={54} className="w-9 h-12 sm:w-10 sm:h-[54px] object-cover border border-slate-200 bg-slate-100 shrink-0" loading="lazy" />
                      : <span className="w-9 h-12 sm:w-10 sm:h-[54px] border border-pink-100 bg-pink-50 text-pink-300 text-[13px] font-bold flex items-center justify-center shrink-0">{(t.name ?? '?').charAt(0)}</span>}
                    <span className="min-w-0 w-full sm:w-auto text-center sm:text-left">
                      <span className="block truncate text-[11px] sm:text-[13px] max-w-full sm:max-w-[92px] leading-tight">{t.name || '（名前なし）'}</span>
                      {t.isNew && <span className="inline-block mt-0.5 px-1 py-px bg-emerald-500 text-white text-[9px] font-black leading-none">NEW</span>}
                      {!t.isActive && <span className="block text-[10px] font-bold text-slate-400">非公開</span>}
                    </span>
                  </span>
                </th>
                {days.map((d, i) => {
                  const c = cellOf(t.id, d);
                  const dirty = !!edits[key(t.id, d)];
                  return (
                    <td key={d} className={`border-l border-slate-100 p-1 ${i === 0 ? 'bg-pink-50/40' : ''}`}>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setOpen({ id: t.id, date: d })}
                        className={`w-full min-h-[44px] px-1 py-1.5 text-center leading-tight border ${
                          dirty ? 'border-amber-400 bg-amber-50' : c.is_active ? 'border-pink-200 bg-pink-50' : 'border-transparent hover:border-slate-200'
                        } disabled:cursor-not-allowed`}
                      >
                        {c.is_active ? (
                          <>
                            <span className="block text-[11px] font-bold text-pink-600">出勤</span>
                            {c.start_time && c.end_time ? (
                              <>
                                <span className="block text-[12px] font-bold text-slate-700 tabular-nums leading-tight">{c.start_time}</span>
                                <span className="block text-[12px] font-bold text-slate-700 tabular-nums leading-tight">{endLabel(c)}</span>
                              </>
                            ) : <span className="block text-[12px] font-bold text-slate-500 leading-tight">時間未設定</span>}
                          </>
                        ) : <span className="text-[12px] text-slate-300">未設定</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 小窓：その日の出勤 ── */}
      {open && openT && openCell && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(null)} aria-hidden />
          <div className="relative w-full sm:w-[380px] bg-white shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[16px] font-black text-slate-800">
                {openT.name}　{dateHead(open.date, days.indexOf(open.date)).top}（{dateHead(open.date, days.indexOf(open.date)).sub}）
              </p>
              <button type="button" onClick={() => setOpen(null)} className="text-slate-400 text-[20px] leading-none" aria-label="閉じる">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => setCell(openT.id, open.date, { is_active: true, start_time: openCell.start_time ?? '12:00', end_time: openCell.end_time ?? '20:00' })}
                className={`py-2.5 text-[15px] font-bold border ${openCell.is_active ? 'bg-pink-500 text-white border-pink-500' : 'bg-white text-slate-600 border-slate-300'}`}>出勤</button>
              <button type="button"
                onClick={() => setCell(openT.id, open.date, { is_active: false, start_time: null, end_time: null })}
                className={`py-2.5 text-[15px] font-bold border ${!openCell.is_active ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-300'}`}>休み</button>
            </div>
            {openCell.is_active && (
              <div className="flex items-center gap-2">
                <select value={openCell.start_time ?? ''} className="flex-1 border border-slate-300 px-2 py-2 text-[15px]"
                  onChange={(e) => {
                    const start = e.target.value;
                    const ends = endTimeOptions(start);
                    const end = ends.some((o) => o.value === openCell.end_time) ? openCell.end_time : ends[Math.min(15, ends.length - 1)]?.value ?? null;
                    setCell(openT.id, open.date, { is_active: true, start_time: start, end_time: end });
                  }}>
                  {!openCell.start_time && <option value="">開始</option>}
                  {startTimeOptions().map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
                <span className="text-slate-400">〜</span>
                <select value={openCell.end_time ?? ''} className="flex-1 border border-slate-300 px-2 py-2 text-[15px]"
                  onChange={(e) => setCell(openT.id, open.date, { ...openCell, end_time: e.target.value })}>
                  {!openCell.end_time && <option value="">終了</option>}
                  {endTimeOptions(openCell.start_time).map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <button type="button" onClick={() => setOpen(null)} className="w-full py-2.5 bg-pink-500 hover:bg-pink-600 text-white text-[15px] font-bold">決定</button>
            <p className="text-[12px] text-slate-400">決定しただけでは保存されません。画面下の「保存する」を押してください。</p>
          </div>
        </div>
      )}

      {/* ── 保存バー（★ マイページの保存バーと同じ位置: PC はサイドバー 288px の右） ── */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[288px] z-40 bg-white/95 backdrop-blur border-t border-amber-300 px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
          <p className="text-[14px] font-bold text-amber-800">まだ保存していない変更が {dirtyCount} マスあります</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEdits({})} disabled={saving} className="px-3 py-2 border border-slate-300 text-[14px] font-bold text-slate-600">元に戻す</button>
            <button type="button" onClick={() => void save()} disabled={saving || locked}
              className="px-6 py-2 bg-pink-500 hover:bg-pink-600 text-white text-[14px] font-bold disabled:opacity-50">
              {saving ? '保存しています…' : '保存する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
