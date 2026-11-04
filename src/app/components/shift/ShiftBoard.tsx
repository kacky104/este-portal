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

// ★ 第1731便（カッキーさん）: 名前の列を細く（120→88px）。長い名前は1行で…
const NAME_W = 88;
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

/** その日の出勤の正本で、同時にいちばん多い人数と時間帯（入れ替え時間は入れない・前日の深夜までも数える） */
function peakOnDate(data: ShiftBoardData, date: string): { count: number; from: number; to: number } {
  const prev = (() => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10); })();
  const iv: Array<[number, number]> = [];
  for (const [k, m] of Object.entries(data.schedules)) {
    const d = k.split('#')[1];
    if (d === date) iv.push([m.s, m.e]);
    else if (d === prev && m.e > 1440 + 360) iv.push([m.s - 1440, m.e - 1440]);
  }
  const pts = [...new Set(iv.flat())].sort((a, b) => a - b);
  let best = { count: 0, from: 0, to: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = iv.filter(([x, y]) => x < b && y > a).length;
    if (n > best.count) best = { count: n, from: a, to: b };
    else if (n === best.count && n > 0 && best.to === a) best.to = b;
  }
  return best;
}

export function ShiftBoard({ onToast }: { onToast: (m: string) => void }) {
  const [which, setWhich] = useState<'next' | 'current'>('next');
  const [data, setData] = useState<ShiftBoardData | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Open | null>(null);
  // ★ 第1731便: 日付のバッジを押したときの一覧（その日に希望を出したセラピスト）
  const [dayList, setDayList] = useState<string | null>(null);
  const openConfirm = (therapistId: number, name: string, date: string, req: ShiftRequestView) => {
    setModalError('');
    setOpen({ therapistId, name, date, req,
      s: req.status === 'confirmed' && req.confS != null ? req.confS : req.reqS,
      e: req.status === 'confirmed' && req.confE != null ? req.confE : req.reqE });
  };
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

  // ★★ 第1732便（カッキーさん）: セラピストが希望を出した・書き直したマスに「NEW」。
  //   ・「見た」の印はこのブラウザごと（localStorage・店ごと）。画面を開いた時点より前に見たとき以降に出た希望が NEW。
  //   ・開いたら「見た」を今に進める。★ NEW の札は、この画面を開いているあいだは残す（確定して読み直しても消さない）。
  //   ・初めて開くブラウザ（印が無い）では NEW を付けない（全部 NEW になるだけなので）。
  const seenAtRef = useRef<string | null | undefined>(undefined);
  const [newKeys, setNewKeys] = useState<Set<string>>(() => new Set());
  const load = useCallback(async (w: 'next' | 'current') => {
    const r = await getShiftBoard({ which: w }).catch(() => null);
    if (!r) { setError('読み込めませんでした。しばらくしてから開き直してください。'); return; }
    if (!r.ok) { setError(r.error); return; }
    setError('');
    const storeKey = `fukues:shift-board-seen:${r.data.salonId}`;
    if (seenAtRef.current === undefined) {
      try { seenAtRef.current = window.localStorage.getItem(storeKey); } catch { seenAtRef.current = null; }
    }
    const seenAt = seenAtRef.current;
    if (seenAt) {
      const fresh = Object.entries(r.data.requests)
        .filter(([, v]) => v.status === 'requested' && v.submittedAt && v.submittedAt > seenAt).map(([k]) => k);
      if (fresh.length) setNewKeys((p) => new Set([...p, ...fresh]));
    }
    try { window.localStorage.setItem(storeKey, new Date().toISOString()); } catch { /* 印が書けなくても画面は止めない */ }
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

  // ★ 第1732便: 日付ごとに NEW があるか
  const newPerDate = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const k of newKeys) if (data?.requests[k]?.status === 'requested') m[k.split('#')[1]] = true;
    return m;
  }, [newKeys, data]);
  // ★ 第1732便: 提出期間に希望を1日も出していない人（公開の方だけ・提出のお願い用）
  const unsubmitted = useMemo(() => {
    if (!data || data.which !== 'next') return [] as ShiftBoardData['rows'];
    const has = new Set(Object.keys(data.requests).map((k) => Number(k.split('#')[0])));
    return data.rows.filter((t) => t.isActive && !has.has(t.id));
  }, [data]);
  const [showUnsubmitted, setShowUnsubmitted] = useState(false);
  const unsubmittedIds = useMemo(() => new Set(unsubmitted.map((t) => t.id)), [unsubmitted]);

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
        {/* ★ 第1732便: まだ希望を出していない人（提出期間だけ） */}
        {data.which === 'next' && (
          <button type="button" onClick={() => setShowUnsubmitted(true)} disabled={unsubmitted.length === 0}
            className={`px-2.5 py-1 text-[13px] font-bold border ${unsubmitted.length > 0 ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-slate-200 bg-white text-slate-400'}`}>
            {unsubmitted.length > 0 ? `未提出 ${unsubmitted.length}名 ›` : '全員提出済み'}
          </button>
        )}
      </div>

      {/* ── 表 ── ★ 第1727便: 上の横スクロールバー（表が横にはみ出すときだけ） */}
      {scrollW > clientW + 1 && (
        <div ref={topBarRef} onScroll={() => syncScroll('top')} className="sticky top-0 z-20 overflow-x-auto overflow-y-hidden border border-slate-200 bg-white" aria-hidden>
          <div style={{ width: scrollW, height: 1 }} />
        </div>
      )}
      <div ref={tableBoxRef} onScroll={() => syncScroll('box')} className={`${CARD} overflow-x-auto`}>
        {/* ★ 第1730便（カッキーさん）: マスの大きさを中身で変えない。table-fixed＋列の幅を固定・マスの高さも固定（1行目 時間／2行目 状態／3行目 ひとこと等・はみ出しは…） */}
        <table className="table-fixed border-collapse text-[13px]" style={{ width: NAME_W + data.dates.length * 124, minWidth: '100%' }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 text-left font-bold text-slate-600" style={{ width: NAME_W }}>セラピスト</th>
              {data.dates.map((d) => (
                <th key={d} className={`bg-slate-50 border-b border-r border-slate-200 px-1 py-2 font-bold whitespace-nowrap w-[124px] ${shiftDateTone(d)}`}>
                  {shiftDateLabel(d)}
                  {/* ★ 第1729便: 希望を出した人数のバッジ（0人は薄く） */}
                  {/* ★ 第1731便: 押すと、その日に希望を出したセラピストの一覧 */}
                  <button type="button" onClick={() => setDayList(d)} disabled={(reqPerDate[d] ?? 0) === 0}
                    className={`mt-0.5 mx-auto flex w-fit min-w-[20px] items-center justify-center px-1.5 text-[11px] font-black leading-[18px] tabular-nums ${
                    (reqPerDate[d] ?? 0) > 0 ? 'bg-amber-500 text-white hover:bg-amber-600 cursor-pointer' : 'bg-slate-200 text-slate-400 cursor-default'}`} title="希望を出した人数（押すと一覧）">
                    {reqPerDate[d] ?? 0}名{(reqPerDate[d] ?? 0) > 0 && ' ›'}
                  </button>
                  {newPerDate[d] && <span className="mt-0.5 mx-auto flex w-fit px-1 text-[10px] font-black leading-[15px] bg-rose-500 text-white">NEW</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((t) => (
              <tr key={t.id} className={t.isActive ? '' : 'opacity-50'}>
                <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2 py-2 font-bold text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis" title={t.name}>
                  {t.name}
                  {!t.isActive && <span className="block text-[10px] font-normal text-slate-400">非公開</span>}
                  {unsubmittedIds.has(t.id) && <span className="block text-[10px] font-black text-rose-600">未提出</span>}
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
                        onClick={() => { if (req) openConfirm(t.id, t.name, d, req); }}
                        className={`w-full h-[60px] overflow-hidden px-1.5 py-1 text-left leading-[17px] ${
                          st.kind === 'requested' ? 'bg-amber-50 border border-amber-300 hover:bg-amber-100'
                          : st.kind === 'confirmed' ? 'bg-emerald-50 border border-emerald-300 hover:bg-emerald-100'
                          : st.kind === 'changed' || st.kind === 'off' ? 'bg-orange-50 border border-orange-300 hover:bg-orange-100'
                          : st.kind === 'direct' ? 'bg-slate-50 border border-slate-200 cursor-default'
                          : 'cursor-default'}`}>
                        {st.kind === 'requested' && req && (<>
                          <span className="block truncate font-bold text-amber-800 tabular-nums">
                            {newKeys.has(key) && <span className="mr-1 px-0.5 text-[9px] font-black leading-[13px] align-[1px] bg-rose-500 text-white">NEW</span>}
                            {rangeShort(req.reqS, req.reqE)}
                          </span>
                          <span className={`block truncate text-[11px] font-bold ${warn ? 'text-rose-600' : 'text-amber-700'}`}>{warn ? '希望・部屋オーバー' : '希望'}</span>
                          <span className="block truncate text-[11px] text-amber-700" title={req.note}>{req.note}</span>
                        </>)}
                        {st.kind === 'confirmed' && req && req.confS != null && req.confE != null && (<>
                          <span className="block truncate font-bold text-emerald-800 tabular-nums">{rangeShort(req.confS, req.confE)}</span>
                          <span className="block truncate text-[11px] font-bold text-emerald-700">確定</span>
                          <span className="block truncate text-[11px] text-slate-500 tabular-nums">{st.changedFromReq ? `希望 ${rangeShort(req.reqS, req.reqE)}` : ''}</span>
                        </>)}
                        {st.kind === 'changed' && sched && (<>
                          <span className="block truncate font-bold text-orange-700 tabular-nums">{rangeShort(sched.s, sched.e)}</span>
                          <span className="block truncate text-[11px] font-bold text-orange-700">変更</span>
                          <span className="block truncate text-[11px] text-slate-500">週間スケジュールで</span>
                        </>)}
                        {st.kind === 'off' && (<>
                          <span className="block truncate font-bold text-orange-700">お休み</span>
                          <span className="block truncate text-[11px] font-bold text-orange-700">変更</span>
                          <span className="block truncate text-[11px] text-slate-500">週間スケジュールで</span>
                        </>)}
                        {st.kind === 'direct' && sched && (<>
                          <span className="block truncate text-slate-500 tabular-nums">{rangeShort(sched.s, sched.e)}</span>
                          <span className="block truncate text-[11px] text-slate-400">出勤</span>
                        </>)}
                        {st.kind === 'none' && <span className="block text-slate-300 text-center leading-[50px]">—</span>}
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

      {/* ── 未提出の一覧（第1732便）── */}
      {showUnsubmitted && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowUnsubmitted(false)}>
          <div className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[17px] font-black text-slate-800">まだ希望を出していない方（{unsubmitted.length}名）</p>
                <p className="text-[12px] text-slate-500">{md(data.from)}〜{md(data.to)} に1日も希望を出していない、公開中の方です。</p>
              </div>
              <button type="button" onClick={() => setShowUnsubmitted(false)} className="shrink-0 px-3 py-1.5 border border-slate-300 text-[13px] font-bold text-slate-600">閉じる</button>
            </div>
            <ul className="divide-y divide-slate-100 border-y border-slate-100">
              {unsubmitted.map((t) => <li key={t.id} className="py-2 text-[15px] font-bold text-slate-800 truncate">{t.name}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ── 日付の一覧（第1731便）── */}
      {dayList && (() => {
        const d = dayList;
        const items = data.rows
          .map((t) => ({ t, req: data.requests[`${t.id}#${d}`] ?? null, sched: data.schedules[`${t.id}#${d}`] ?? null }))
          .filter((x) => x.req)
          .map((x) => ({ ...x, st: shiftDayState(x.req, x.sched), warn: x.req!.status === 'requested' ? precheck(x.t.id, d, x.req!.reqS, x.req!.reqE) : null }))
          .sort((a, b) => (a.req!.status === b.req!.status ? 0 : a.req!.status === 'requested' ? -1 : 1) || a.req!.reqS - b.req!.reqS);
        const direct = data.rows.filter((t) => !data.requests[`${t.id}#${d}`] && data.schedules[`${t.id}#${d}`]);
        const nReq = items.filter((x) => x.req!.status === 'requested').length;
        const peak = peakOnDate(data, d);
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setDayList(null)}>
            <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[17px] font-black ${shiftDateTone(d)}`}>{shiftDateLabel(d)} の希望</p>
                  <p className="text-[13px] text-slate-500">希望 {nReq}名・確定 {items.length - nReq}名{direct.length > 0 && `・週間スケジュールで直接 ${direct.length}名`}</p>
                  {data.settings.roomCount > 0 && (
                    <p className={`text-[13px] font-bold ${peak.count > data.settings.roomCount ? 'text-rose-600' : 'text-slate-600'}`}>
                      {/* ★ 第1733便（カッキーさん「意味がわかりません」）: 言い方を「部屋の空き」に。数えるのは出勤が入っている人（確定＋週間スケジュール） */}
                      {peak.count === 0
                        ? `部屋の空き：まだ出勤が入っていません（${data.settings.roomCount}部屋すべて空き）`
                        : peak.count > data.settings.roomCount
                          ? `部屋の空き：いちばん混む ${rangeLabel(peak.from, peak.to)} に ${peak.count}人／${data.settings.roomCount}部屋（${peak.count - data.settings.roomCount}人オーバー）`
                          : `部屋の空き：いちばん混む ${rangeLabel(peak.from, peak.to)} でも ${peak.count}人／${data.settings.roomCount}部屋（あと${data.settings.roomCount - peak.count}部屋空き）`}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setDayList(null)} className="shrink-0 px-3 py-1.5 border border-slate-300 text-[13px] font-bold text-slate-600">閉じる</button>
              </div>
              <ul className="divide-y divide-slate-100 border-y border-slate-100">
                {items.map(({ t, req, st, warn }) => (
                  <li key={t.id}>
                    <button type="button" disabled={!t.isActive} onClick={() => { setDayList(null); openConfirm(t.id, t.name, d, req!); }}
                      className="w-full text-left py-2.5 px-1 flex items-start gap-3 hover:bg-slate-50 disabled:opacity-50">
                      <span className={`shrink-0 mt-0.5 px-1.5 text-[11px] font-black leading-[18px] ${
                        st.kind === 'requested' ? 'bg-amber-100 text-amber-800' : st.kind === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-700'}`}>
                        {st.kind === 'requested' ? '希望' : st.kind === 'confirmed' ? '確定' : st.kind === 'off' ? 'お休みに変更' : '変更'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-slate-800 truncate">
                          {newKeys.has(`${t.id}#${d}`) && req!.status === 'requested' && <span className="mr-1.5 px-1 text-[10px] font-black leading-[15px] align-[2px] bg-rose-500 text-white">NEW</span>}
                          {t.name}
                        </span>
                        <span className="block text-[14px] tabular-nums text-slate-700">
                          {st.kind === 'confirmed' ? st.conf : st.kind === 'changed' ? st.now : st.kind === 'off' ? 'お休み' : rangeLabel(req!.reqS, req!.reqE)}
                          {st.kind === 'confirmed' && st.changedFromReq && <span className="ml-2 text-[12px] text-slate-500">希望 {st.changedFromReq}</span>}
                          {(st.kind === 'changed' || st.kind === 'off') && <span className="ml-2 text-[12px] text-slate-500">確定 {st.conf}</span>}
                        </span>
                        {req!.note && <span className="block text-[13px] text-amber-700 break-words">「{req!.note}」</span>}
                        {warn && <span className="block text-[12px] font-bold text-rose-600">{warn}</span>}
                      </span>
                      {t.isActive && <span className="shrink-0 self-center text-slate-400">›</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {direct.length > 0 && (
                <div>
                  <p className="text-[12px] font-bold text-slate-500 mb-1">週間スケジュールで直接入っている出勤</p>
                  <ul className="text-[14px] text-slate-600 space-y-0.5">
                    {direct.map((t) => { const m = data.schedules[`${t.id}#${d}`]; return <li key={t.id} className="flex gap-3"><span className="font-bold truncate">{t.name}</span><span className="tabular-nums">{rangeLabel(m.s, m.e)}</span></li>; })}
                  </ul>
                </div>
              )}
              <p className="text-[12px] text-slate-400">名前を押すと確定の画面が開きます。</p>
            </div>
          </div>
        );
      })()}

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
