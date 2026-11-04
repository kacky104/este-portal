'use client';

// シフト管理表（2026-11-04・店舗様のご要望・カッキーさんの決定）。コネックエフ（/conecf/shift）とマイページ（/mypage/shift）で同じものを使う。
// ★ セラピスト×日付の表。セラピストが /cast で出した希望が「A 21〜02 希望」と出る → 押して確定（時間を直して確定もできる）。
// ★ 確定すると出勤の正本（週間スケジュール）に入る → サイト・駅ちか・エステ魂へは今までどおり。
// ★ 部屋数・入れ替え時間を超える確定はできない（希望のマスに「部屋オーバー」の札を先に出す）。
// ★ 却下は無い。確定しなかった希望は希望のまま残す（欠勤が出たときの声かけ用）。
// ★ 確定のあと週間スケジュールで直した日は「変更」と出す（セラピストページにも出る）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmShift, getShiftBoard, saveShiftSettings, type ShiftBoardData } from '@/app/actions/shift';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import {
  checkRooms, endOptions, minLabel, rangeLabel, rangeShort, roomErrorText, shiftDateLabel, shiftDateTone, shiftDayState, startOptions,
  SHIFT_CHANGEOVER_OPTIONS, SHIFT_PERIODS, SHIFT_ROOM_MAX, type OccupyShift, type ShiftPeriod, type ShiftRequestView,
} from '@/lib/shift';

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const BTN = 'bg-gradient-to-r from-indigo-700 to-indigo-500 text-white font-bold disabled:opacity-50';
function md(ymd: string) { const [, m, d] = ymd.split('-').map(Number); return `${m}/${d}`; }

type Open = { therapistId: number; name: string; date: string; req: ShiftRequestView; s: number; e: number };

/** 候補以外の出勤（部屋数の見張り用） */
function othersFor(data: ShiftBoardData, therapistId: number, date: string): OccupyShift[] {
  const out: OccupyShift[] = [];
  for (const [k, m] of Object.entries(data.schedules)) {
    const [tid, d] = k.split('#');
    if (Number(tid) === therapistId && d === date) continue;
    out.push({ date: d, s: m.s, e: m.e });
  }
  return out;
}

export function ShiftBoard({ onToast }: { onToast: (m: string) => void }) {
  const [which, setWhich] = useState<'next' | 'current'>('next');
  const [data, setData] = useState<ShiftBoardData | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  // 設定（画面で直している途中の値）
  const [period, setPeriod] = useState<ShiftPeriod>('1w');
  const [rooms, setRooms] = useState('0');
  const [changeover, setChangeover] = useState(0);
  const [savingSettings, setSavingSettings] = useState(false);
  // ★ 第1727便（カッキーさん）: 横のスクロールバーを表の上にも（週間スケジュール 第1473便と同じ）。上下のバーは同じ位置に動く
  const topBarRef = useRef<HTMLDivElement>(null);
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = useState(0);
  const [clientW, setClientW] = useState(0);
  useEffect(() => {
    const box = tableBoxRef.current;
    if (!box) return;
    const measure = () => { setScrollW(box.scrollWidth); setClientW(box.clientWidth); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    if (box.firstElementChild) ro.observe(box.firstElementChild);
    return () => ro.disconnect();
  }, [data]);
  const syncScroll = (from: 'top' | 'box') => {
    const top = topBarRef.current, box = tableBoxRef.current;
    if (!top || !box) return;
    const [src, dst] = from === 'top' ? [top, box] : [box, top];
    if (Math.abs(dst.scrollLeft - src.scrollLeft) > 0.5) dst.scrollLeft = src.scrollLeft;
  };

  const load = useCallback(async (w: 'next' | 'current') => {
    const r = await getShiftBoard({ which: w }).catch(() => null);
    if (!r) { setError('読み込めませんでした。しばらくしてから開き直してください。'); return; }
    if (!r.ok) { setError(r.error); return; }
    setError('');
    setData(r.data);
    setPeriod(r.data.settings.period);
    setRooms(String(r.data.settings.roomCount));
    setChangeover(r.data.settings.changeoverMin);
  }, []);
  useEffect(() => { void load(which); }, [load, which]);

  const settingsDirty = !!data && (period !== data.settings.period || Number(rooms) !== data.settings.roomCount || changeover !== data.settings.changeoverMin);
  const onSaveSettings = async () => {
    setSavingSettings(true);
    const r = await saveShiftSettings({ period, roomCount: Number(rooms), changeoverMin: changeover }).catch(() => null);
    setSavingSettings(false);
    if (!r || !r.ok) { onToast(r && !r.ok ? r.error : '保存できませんでした'); return; }
    onToast('設定を保存しました');
    await load(which);
  };

  // 希望の数・確定の数（見出し用）
  const counts = useMemo(() => {
    if (!data) return { req: 0, conf: 0 };
    let req = 0, conf = 0;
    for (const v of Object.values(data.requests)) { if (v.status === 'confirmed') conf++; else req++; }
    return { req, conf };
  }, [data]);

  // ★ 第1729便（カッキーさん）: 日付ごとの「希望を出した人数」（確定済みも入れる＝その日に提出した人の数）
  const reqPerDate = useMemo(() => {
    const m: Record<string, number> = {};
    if (!data) return m;
    for (const k of Object.keys(data.requests)) { const d = k.split('#')[1]; m[d] = (m[d] ?? 0) + 1; }
    return m;
  }, [data]);

  const precheck = (therapistId: number, date: string, s: number, e: number) => {
    if (!data || data.settings.roomCount <= 0) return null;
    const r = checkRooms({ date, s, e }, othersFor(data, therapistId, date), data.settings.roomCount, data.settings.changeoverMin);
    return r.ok ? null : roomErrorText(r, data.settings.roomCount, data.settings.changeoverMin);
  };

  const onConfirm = async () => {
    if (!open || !data) return;
    setBusy(true); setModalError('');
    const r = await confirmShift({ therapistId: open.therapistId, date: open.date, s: open.s, e: open.e }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) { setModalError(r && !r.ok ? r.error : '確定できませんでした。もう一度お試しください。'); return; }
    void revalidateSalon(data.salonId);
    void revalidateTherapist(open.therapistId);
    onToast(`${open.name} さん ${shiftDateLabel(open.date)} ${rangeLabel(open.s, open.e)} を確定しました`);
    setOpen(null);
    await load(which);
  };

  if (error) return <div className={`${CARD} p-6`}><p className="text-[15px] text-slate-500 text-center">{error}</p></div>;
  if (!data) return <div className={`${CARD} p-6`}><p className="text-[15px] text-slate-400 text-center">読み込み中...</p></div>;

  const modalCheck = open ? precheck(open.therapistId, open.date, open.s, open.e) : null;

  return (
    <div className="space-y-4">
      {/* ── 設定 ── */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="block text-[12px] font-bold text-slate-500 mb-1">提出してもらう期間</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value as ShiftPeriod)} className="border border-slate-300 px-2 py-2 text-[14px]">
              {SHIFT_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-bold text-slate-500 mb-1">部屋数</span>
            <input type="number" min={0} max={SHIFT_ROOM_MAX} value={rooms} onChange={(e) => setRooms(e.target.value)}
              className="w-24 border border-slate-300 px-2 py-2 text-[14px] tabular-nums" />
          </label>
          <label className="block">
            <span className="block text-[12px] font-bold text-slate-500 mb-1">入れ替え時間</span>
            <select value={changeover} onChange={(e) => setChangeover(Number(e.target.value))} className="border border-slate-300 px-2 py-2 text-[14px]">
              {SHIFT_CHANGEOVER_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? 'なし' : `${m}分`}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void onSaveSettings()} disabled={!settingsDirty || savingSettings} className={`px-5 py-2 text-[14px] ${BTN}`}>
            {savingSettings ? '保存しています…' : '設定を保存'}
          </button>
        </div>
        <p className="text-[12px] text-slate-500 leading-relaxed">
          部屋数を入れると、同じ時間帯に部屋数より多い確定はできなくなります（0 はチェックしません）。
          入れ替え時間は、前の方が終わってから次の方が入れるまでの時間です。週間スケジュールで直接入れた出勤も数えます。
        </p>
      </div>

      {/* ── 期間の切り替え ── */}
      <div className="flex flex-wrap items-center gap-2">
        {(['next', 'current'] as const).map((w) => (
          <button key={w} type="button" onClick={() => setWhich(w)}
            className={`px-4 py-2 text-[14px] font-bold border ${which === w ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-white text-slate-500 border-slate-200'}`}>
            {w === 'next' ? '提出期間' : '今の期間'}
          </button>
        ))}
        <span className="text-[14px] font-bold text-slate-700 ml-1">{md(data.from)}〜{md(data.to)}</span>
        <span className="text-[13px] text-slate-500">希望 {counts.req}件・確定 {counts.conf}件</span>
      </div>

      {/* ── 表 ── ★ 第1727便: 上の横スクロールバー（表が横にはみ出すときだけ） */}
      {scrollW > clientW + 1 && (
        <div ref={topBarRef} onScroll={() => syncScroll('top')} className="sticky top-0 z-20 overflow-x-auto overflow-y-hidden border border-slate-200 bg-white" aria-hidden>
          <div style={{ width: scrollW, height: 1 }} />
        </div>
      )}
      <div ref={tableBoxRef} onScroll={() => syncScroll('box')} className={`${CARD} overflow-x-auto`}>
        <table className="border-collapse text-[13px] min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left font-bold text-slate-600 min-w-[120px]">セラピスト</th>
              {data.dates.map((d) => (
                <th key={d} className={`bg-slate-50 border-b border-r border-slate-200 px-2 py-2 font-bold whitespace-nowrap min-w-[112px] ${shiftDateTone(d)}`}>
                  {shiftDateLabel(d)}
                  {/* ★ 第1729便: 希望を出した人数のバッジ（0人は薄く） */}
                  <span className={`ml-1.5 inline-flex min-w-[20px] items-center justify-center px-1.5 text-[11px] font-black leading-[18px] tabular-nums align-middle ${
                    (reqPerDate[d] ?? 0) > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-400'}`} title="希望を出した人数">
                    {reqPerDate[d] ?? 0}名
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((t) => (
              <tr key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                  {t.name}{!t.isActive && <span className="ml-1 text-[11px] font-normal text-slate-400">非公開</span>}
                </td>
                {data.dates.map((d) => {
                  const key = `${t.id}#${d}`;
                  const req = data.requests[key] ?? null;
                  const sched = data.schedules[key] ?? null;
                  const st = shiftDayState(req, sched);
                  const canOpen = !!req && t.isActive;
                  const warn = req && req.status === 'requested' ? precheck(t.id, d, req.reqS, req.reqE) : null;
                  return (
                    <td key={d} className="border-b border-r border-slate-200 p-1 align-top">
                      <button type="button" disabled={!canOpen}
                        onClick={() => { if (!req) return; setModalError(''); setOpen({ therapistId: t.id, name: t.name, date: d, req, s: req.status === 'confirmed' && req.confS != null ? req.confS : req.reqS, e: req.status === 'confirmed' && req.confE != null ? req.confE : req.reqE }); }}
                        className={`w-full min-h-[44px] px-1.5 py-1 text-left leading-tight ${
                          st.kind === 'requested' ? 'bg-amber-50 border border-amber-300 hover:bg-amber-100'
                          : st.kind === 'confirmed' ? 'bg-emerald-50 border border-emerald-300 hover:bg-emerald-100'
                          : st.kind === 'changed' || st.kind === 'off' ? 'bg-orange-50 border border-orange-300 hover:bg-orange-100'
                          : st.kind === 'direct' ? 'bg-slate-50 border border-slate-200 cursor-default'
                          : 'cursor-default'}`}>
                        {st.kind === 'requested' && req && (<>
                          <span className="block font-bold text-amber-800 tabular-nums">{rangeShort(req.reqS, req.reqE)} 希望</span>
                          {req.note && <span className="block text-[11px] text-amber-700 truncate" title={req.note}>{req.note}</span>}
                          {warn && <span className="block text-[11px] font-bold text-rose-600">部屋オーバー</span>}
                        </>)}
                        {st.kind === 'confirmed' && req && req.confS != null && req.confE != null && (<>
                          <span className="block font-bold text-emerald-800 tabular-nums">{rangeShort(req.confS, req.confE)} 確定</span>
                          {st.changedFromReq && <span className="block text-[11px] text-slate-500 tabular-nums">希望 {rangeShort(req.reqS, req.reqE)}</span>}
                        </>)}
                        {st.kind === 'changed' && sched && (<>
                          <span className="block font-bold text-orange-700 tabular-nums">{rangeShort(sched.s, sched.e)} 変更</span>
                          <span className="block text-[11px] text-slate-500">週間スケジュールで変更</span>
                        </>)}
                        {st.kind === 'off' && (<>
                          <span className="block font-bold text-orange-700">お休みに変更</span>
                          <span className="block text-[11px] text-slate-500">週間スケジュールで変更</span>
                        </>)}
                        {st.kind === 'direct' && sched && <span className="block text-slate-500 tabular-nums">{rangeShort(sched.s, sched.e)} 出勤</span>}
                        {st.kind === 'none' && <span className="block text-slate-300 text-center">—</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-slate-500 leading-relaxed">
        黄色＝希望（未確定）／緑＝確定／橙＝確定のあと週間スケジュールで変更／灰色＝週間スケジュールで直接入れた出勤。
        希望のマスを押すと確定できます（時間を直して確定もできます）。確定しなかった希望はそのまま残ります。
      </p>

      {/* ── 確定の小窓 ── */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !busy && setOpen(null)}>
          <div className="w-full sm:max-w-md bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-[16px] font-black text-slate-800">{open.name} さん・{shiftDateLabel(open.date)}</p>
            <p className="text-[14px] text-slate-600">希望 <span className="font-bold tabular-nums">{rangeLabel(open.req.reqS, open.req.reqE)}</span></p>
            {open.req.note && <p className="text-[13px] text-slate-500">ひとこと：{open.req.note}</p>}
            <div className="flex items-center gap-2">
              <select value={open.s} onChange={(e) => {
                const s = Number(e.target.value); const opts = endOptions(s);
                setOpen({ ...open, s, e: opts.includes(open.e) ? open.e : opts[opts.length - 1] });
              }} className="flex-1 border border-slate-300 px-2 py-2 text-[15px] tabular-nums">
                {startOptions().map((m) => <option key={m} value={m}>{minLabel(m)}</option>)}
              </select>
              <span className="text-slate-400">〜</span>
              <select value={open.e} onChange={(e) => setOpen({ ...open, e: Number(e.target.value) })} className="flex-1 border border-slate-300 px-2 py-2 text-[15px] tabular-nums">
                {endOptions(open.s).map((m) => <option key={m} value={m}>{minLabel(m)}</option>)}
              </select>
            </div>
            {(open.s !== open.req.reqS || open.e !== open.req.reqE) && (
              <p className="text-[13px] text-indigo-700">希望から時間を変えて確定します。セラピストページに「希望 {rangeLabel(open.req.reqS, open.req.reqE)} から変更」と出ます。</p>
            )}
            {modalCheck && <p className="text-[13px] font-bold text-rose-600">{modalCheck}</p>}
            {modalError && <p className="text-[13px] font-bold text-rose-600">{modalError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setOpen(null)} disabled={busy} className="flex-1 py-2.5 border border-slate-300 text-[15px] font-bold text-slate-600">やめる</button>
              <button type="button" onClick={() => void onConfirm()} disabled={busy || !!modalCheck} className={`flex-1 py-2.5 text-[15px] ${BTN}`}>
                {busy ? '確定しています…' : '確定する'}
              </button>
            </div>
            <p className="text-[12px] text-slate-400">確定すると週間スケジュールに入り、サイトに出ます（駅ちか・エステ魂へは自動更新で30分以内）。</p>
          </div>
        </div>
      )}
    </div>
  );
}
