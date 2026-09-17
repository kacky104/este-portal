'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfSchedule, saveConecfSchedule, type ConecfScheduleRow } from '@/app/actions/conecfSchedule';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import { startTimeOptions, endTimeOptions, shiftLabel, type ConecfShift } from '@/lib/conecfSchedule';

// コネックエフ「週間スケジュール」（第399便・1d・2026-09-17）。
// ★ ベンリーの週間スケジュールと同じ形：女性×7日のマス。★ マスを押すと、その日の出勤を選ぶ小窓が開く。
// ★ 変えたマスは色が付き、下の「保存する」でまとめて保存（★ 保存するまでフクエスにも出ない）。
// ★ 時刻は30分刻みの選択だけ（★ 手打ちを無くした）。★ 日付は朝6時で切り替わる。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const WD = ['日', '月', '火', '水', '木', '金', '土'];

function dateHead(d: string, i: number): { top: string; sub: string; tone: string } {
  const [y, m, dd] = d.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return { top: `${m}/${dd}`, sub: i === 0 ? `今日(${WD[w]})` : WD[w], tone: w === 0 ? 'text-rose-500' : w === 6 ? 'text-sky-600' : 'text-slate-600' };
}

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [dates, setDates] = useState<string[]>([]);
  const [rows, setRows] = useState<ConecfScheduleRow[] | null>(null);
  const [salonId, setSalonId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, ConecfShift>>({});
  const [open, setOpen] = useState<{ id: number; date: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const res = await getConecfSchedule();
    if (!res.ok) { setError(res.error); return; }
    setDates(res.data.dates); setRows(res.data.rows); setSalonId(res.data.salonId); setEdits({}); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);

  const key = (id: number, date: string) => `${id}#${date}`;
  const cellOf = useCallback((r: ConecfScheduleRow, date: string): ConecfShift =>
    edits[key(r.id, date)] ?? r.days.find((d) => d.date === date) ?? { date, isActive: false, start: null, end: null }, [edits]);

  const dirtyIds = useMemo(() => [...new Set(Object.keys(edits).map((k) => Number(k.split('#')[0])))], [edits]);
  const dirtyCount = Object.keys(edits).length;

  useEffect(() => {
    if (dirtyCount === 0) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [dirtyCount]);

  const setCell = (r: ConecfScheduleRow, date: string, next: ConecfShift) => {
    const orig = r.days.find((d) => d.date === date);
    const same = orig && orig.isActive === next.isActive && (!next.isActive || (orig.start === next.start && orig.end === next.end));
    setEdits((p) => {
      const n = { ...p };
      if (same) delete n[key(r.id, date)]; else n[key(r.id, date)] = next;
      return n;
    });
  };

  const onSave = async () => {
    if (!rows) return;
    setSaving(true);
    const changes = dirtyIds.map((id) => {
      const r = rows.find((x) => x.id === id)!;
      return { therapistId: id, shifts: dates.map((d) => cellOf(r, d)) };
    });
    const res = await saveConecfSchedule({ changes });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    if (salonId != null) void revalidateSalon(salonId);
    dirtyIds.forEach((id) => void revalidateTherapist(id));
    onToast(`${res.data.therapists}人の出勤を保存しました（フクエスに反映しました）`);
    await load();
  };

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>;
  if (!rows) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;

  const shown = rows.filter((r) => q.trim() === '' || r.name.includes(q.trim()));
  const openRow = open ? rows.find((r) => r.id === open.id) ?? null : null;
  const openCell = open && openRow ? cellOf(openRow, open.date) : null;
  const todayCount = rows.filter((r) => dates[0] && cellOf(r, dates[0]).isActive).length;

  return (
    <div className="space-y-3 pb-20">
      {!enabled && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
          いまは見るだけです。出勤を保存するには、<Link href={href('/')} className="font-bold underline">ホーム</Link>で「コネックエフに切り替える」を押してください。
        </div>
      )}

      <div className={`${CARD} p-3 flex flex-wrap items-center gap-3`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="女性名で検索"
          className="flex-1 min-w-[160px] border border-slate-200 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        <span className="text-[13px] font-bold text-slate-500">今日の出勤 <b className="text-indigo-700 text-[16px] tabular-nums">{todayCount}</b>名</span>
        <Link href={href('/schedule/sync')} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">出勤をサイトへ ›</Link>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        {/* ★★ 第438便（カッキーさん）: 日付のマスは【いつも同じ幅】。★ table-fixed で中身の文字数に引っぱられない */}
        <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 border-b border-slate-200 w-[150px] text-[12px] text-slate-400">女性</th>
              {dates.map((d, i) => {
                const h = dateHead(d, i);
                return (
                  <th key={d} className={`w-[calc((100%-150px)/7)] px-1 py-2 border-b border-l border-slate-200 text-center ${i === 0 ? 'bg-indigo-50' : ''}`}>
                    <div className={`text-[13px] font-black ${h.tone}`}>{h.top}</div>
                    <div className={`text-[11px] font-bold ${h.tone}`}>{h.sub}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${r.isActive ? '' : 'opacity-50'}`}>
                <th className="sticky left-0 z-10 bg-white text-left px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                  <span className="block truncate max-w-[130px]">{r.name || '（名前なし）'}</span>
                  {!r.isActive && <span className="text-[10.5px] font-bold text-slate-400">非公開</span>}
                </th>
                {dates.map((d, i) => {
                  const c = cellOf(r, d);
                  const dirty = !!edits[key(r.id, d)];
                  const label = shiftLabel(c);
                  return (
                    <td key={d} className={`border-l border-slate-100 p-1 ${i === 0 ? 'bg-indigo-50/40' : ''}`}>
                      <button
                        type="button"
                        disabled={!r.isActive}
                        onClick={() => setOpen({ id: r.id, date: d })}
                        className={`w-full min-h-[44px] px-1 py-1.5 text-center leading-tight border ${
                          dirty ? 'border-amber-400 bg-amber-50' : c.isActive ? 'border-indigo-200 bg-indigo-50' : 'border-transparent hover:border-slate-200'
                        } disabled:cursor-not-allowed`}
                      >
                        {c.isActive
                          ? <><span className="block text-[11px] font-bold text-indigo-600">出勤</span><span className="block text-[12px] font-bold text-slate-700 tabular-nums">{label.replace('〜', '〜​')}</span></>
                          : <span className="text-[12px] text-slate-300">未設定</span>}
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
      {open && openRow && openCell && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(null)} aria-hidden />
          <div className="relative w-full sm:w-[380px] bg-white shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[16px] font-black text-slate-800">{openRow.name}　{dateHead(open.date, dates.indexOf(open.date)).top}（{dateHead(open.date, dates.indexOf(open.date)).sub}）</p>
              <button type="button" onClick={() => setOpen(null)} className="text-slate-400 text-[20px] leading-none" aria-label="閉じる">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCell(openRow, open.date, { date: open.date, isActive: true, start: openCell.start ?? '12:00', end: openCell.end ?? '20:00' })}
                className={`py-2.5 text-[15px] font-bold border ${openCell.isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}>出勤</button>
              <button type="button" onClick={() => setCell(openRow, open.date, { date: open.date, isActive: false, start: null, end: null })}
                className={`py-2.5 text-[15px] font-bold border ${!openCell.isActive ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-600 border-slate-300'}`}>休み</button>
            </div>
            {openCell.isActive && (
              <div className="flex items-center gap-2">
                <select value={openCell.start ?? ''} className="flex-1 border border-slate-300 px-2 py-2 text-[15px]"
                  onChange={(e) => {
                    const start = e.target.value;
                    const ends = endTimeOptions(start);
                    const end = ends.some((o) => o.value === openCell.end) ? openCell.end : ends[Math.min(15, ends.length - 1)]?.value ?? null;
                    setCell(openRow, open.date, { ...openCell, start, end });
                  }}>
                  {startTimeOptions().map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
                <span className="text-slate-400">〜</span>
                <select value={openCell.end ?? ''} className="flex-1 border border-slate-300 px-2 py-2 text-[15px]"
                  onChange={(e) => setCell(openRow, open.date, { ...openCell, end: e.target.value })}>
                  {endTimeOptions(openCell.start).map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <button type="button" onClick={() => setOpen(null)} className="w-full py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[15px] font-bold">決定</button>
            <p className="text-[12px] text-slate-400">決定しただけでは保存されません。画面下の「保存する」を押してください。</p>
          </div>
        </div>
      )}

      {/* ── 保存バー ── */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[288px] z-40 bg-white/95 backdrop-blur border-t border-amber-300 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[14px] font-bold text-amber-800">まだ保存していない変更が {dirtyCount} マスあります</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEdits({})} disabled={saving} className="px-3 py-2 border border-slate-300 text-[14px] font-bold text-slate-600">元に戻す</button>
            <button type="button" onClick={() => void onSave()} disabled={saving || !enabled}
              className="px-6 py-2 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[14px] font-bold disabled:opacity-50">
              {saving ? '保存しています…' : '保存する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConecfSchedulePage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="schedule" title="週間スケジュール" toast={toast} wide>
      {(a) => <Body enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
