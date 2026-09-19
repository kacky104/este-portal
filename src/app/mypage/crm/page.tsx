'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCrmSchedule, lookupCrmCustomerByPhone, setCrmCancelBad } from '@/app/actions/crm';
import {
  createManualBooking,
  deleteBooking,
  moveBooking,
  updateBookingDetails,
  updateBookingStatus,
} from '@/app/actions/booking';
import {
  CRM_CATEGORY_CLASS,
  CRM_CATEGORY_LABEL,
  type CrmScheduleBooking,
  type CrmScheduleCustomer,
  type CrmScheduleData,
  type CrmScheduleTherapist,
} from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from './CrmShell';

// フクエスCRM「スケジュール」（第530便・2026-09-19）。★ 風俗CTIv2 の本日スケジュールにならった画面。
//
// ★ 行＝その日に出勤しているセラピスト（＋予約だけ残っている人）。上にフリー客の行（予約があるときだけ）。
// ★ 横＝時間。ピンクの帯が出勤、カードが予約。★ カードにお客様の分類・要注意・女子NG を重ねる。
// ★ カードを押すと右にお客様と予約の詳細（台帳へのリンク・悪質キャンセルの付け外し）。
// ★ 出勤と予約は予約ボード（無料）と同じデータ・同じサーバー処理（actions/booking.ts）。
// ★ 第531便：この画面で予約の受付・変更（担当・時間・内容）・確定・キャンセル・削除ができる。
//   空いているところを押す＝受付／カードを押す＝詳細（そこから変更・キャンセル）。
//   受付フォームで電話番号を入れると台帳を引き、分類・要注意・女子NG を出す（名前が空なら入れる）。
// ★ 日付は【営業日】（朝6時区切り）。★ 表示は 6:00〜翌7:00 の中で、予定がある範囲（最低 10時〜翌5時）。

const PX_PER_MIN = 1.6;       // 1時間＝96px
const NAME_W = 150;
const ROW_H = 66;
const DAY_START_MIN = 6 * 60;  // 営業日の始まり（6:00）
const WINDOW_END_MIN = 31 * 60; // 予約ボードの窓の終わり（翌7:00）
const DEFAULT_START_MIN = 10 * 60;
const DEFAULT_END_MIN = 29 * 60; // 翌5:00
const REFRESH_MS = 60_000;
const CLICK_STEP_MIN = 15;   // 空きを押したときの開始時刻の刻み
const FORM_STEP_MIN = 5;     // フォームで選べる開始時刻の刻み（CTIv2 と同じ5分）
const INTERVAL_OPTIONS = [0, 15, 30, 45, 60] as const;

const JST_HM = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });

/** 営業日（朝6時区切り）の YYYY-MM-DD */
function businessTodayJST(): string {
  const d = new Date(Date.now() + 9 * 3600_000 - 6 * 3600_000);
  return d.toISOString().slice(0, 10);
}
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function dateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${date.slice(0, 4)}年${date.slice(5, 7)}月${date.slice(8, 10)}日（${w}）`;
}
/** その日 0:00 からの分（翌日なら 24*60 以上） */
function minOfDay(iso: string, baseMs: number): number {
  return Math.round((new Date(iso).getTime() - baseMs) / 60000);
}
function hourLabel(h: number): string {
  return h >= 24 ? `翌${h - 24}時` : `${h}時`;
}
function hm(iso: string): string {
  return JST_HM.format(new Date(iso));
}

type Row = { key: string; therapist: CrmScheduleTherapist | null; bookings: CrmScheduleBooking[] };

export default function CrmSchedulePage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="schedule">
      {(a) => <ScheduleBody salonId={a.salonId} adminSalonQuery={adminSalonQuery} />}
    </CrmShell>
  );
}

function ScheduleBody({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const [date, setDate] = useState<string>(() => businessTodayJST());
  const [data, setData] = useState<CrmScheduleData | null>(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<CrmScheduleBooking | null>(null);
  // 受付・変更フォーム（null＝閉じている）
  const [form, setForm] = useState<BookingFormState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tick, setTick] = useState(0);

  // 読み込み（日付が変わったとき・自動更新のとき）
  useEffect(() => {
    let alive = true;
    getCrmSchedule(salonId, date).then((res) => {
      if (!alive) return;
      if (!res.ok) { setErr(res.error); setData(null); return; }
      setErr('');
      setData(res.data);
      setNowMs(Date.now());
    });
    return () => { alive = false; };
  }, [salonId, date, tick]);

  // 60秒ごとに読み直す（詳細・フォームを開いている間は止める＝見ている最中に動かさない）
  useEffect(() => {
    if (picked || form) return;
    const t = setInterval(() => setTick((v) => v + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, [picked, form]);

  const reload = useCallback(() => setTick((v) => v + 1), []);

  const baseMs = useMemo(() => new Date(`${date}T00:00:00+09:00`).getTime(), [date]);

  // 行と表示範囲
  const view = useMemo(() => {
    if (!data) return null;
    const inWindow = (s: number, e: number) => e > DAY_START_MIN && s < WINDOW_END_MIN;
    let minStart = DEFAULT_START_MIN;
    let maxEnd = DEFAULT_END_MIN;
    const note = (s: number, e: number) => {
      if (!inWindow(s, e)) return;
      minStart = Math.min(minStart, Math.max(DAY_START_MIN, s));
      maxEnd = Math.max(maxEnd, Math.min(WINDOW_END_MIN, e));
    };
    const visibleBookings = data.bookings.filter((b) => {
      const s = minOfDay(b.slotStartISO, baseMs);
      const e = minOfDay(b.slotEndISO, baseMs);
      return inWindow(s, e);
    });
    visibleBookings.forEach((b) => note(minOfDay(b.slotStartISO, baseMs), minOfDay(b.slotEndISO, baseMs)));

    const rows: Row[] = [];
    // ★ フリー（担当未定）の行はいつも出す（ここに受付できるように）。
    const free = visibleBookings.filter((b) => b.therapistId == null);
    rows.push({ key: 'free', therapist: null, bookings: free });

    const therapistRows: Row[] = [];
    for (const t of data.therapists) {
      const scheds = t.schedules.filter((w) => inWindow(minOfDay(w.startISO, baseMs), minOfDay(w.endISO, baseMs)));
      const bs = visibleBookings.filter((b) => b.therapistId === t.id);
      if (scheds.length === 0 && bs.length === 0) continue;
      scheds.forEach((w) => note(minOfDay(w.startISO, baseMs), minOfDay(w.endISO, baseMs)));
      therapistRows.push({ key: `t${t.id}`, therapist: { ...t, schedules: scheds }, bookings: bs });
    }
    // 出勤の早い順（出勤なし・予約だけの人は後ろ）
    const firstStart = (r: Row) => r.therapist?.schedules[0] ? minOfDay(r.therapist.schedules[0].startISO, baseMs) : 99999;
    therapistRows.sort((a, b) => firstStart(a) - firstStart(b));
    rows.push(...therapistRows);

    const startMin = Math.floor(minStart / 60) * 60;
    const endMin = Math.ceil(maxEnd / 60) * 60;
    const activeCount = visibleBookings.filter((b) => b.status !== 'cancelled').length;
    const workingCount = therapistRows.filter((r) => (r.therapist?.schedules.length ?? 0) > 0).length;
    return { rows, startMin, endMin, activeCount, workingCount };
  }, [data, baseMs]);

  const isToday = date === businessTodayJST();

  return (
    <div className="px-2 py-3 md:px-4">
      {/* 日付と件数 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[18px] font-black text-slate-800 md:text-[20px]">{dateLabel(date)}</span>
        <div className="flex">
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">◀ 前日</button>
          <button type="button" onClick={() => setDate(businessTodayJST())} className={`px-3 py-1.5 text-[13px] font-bold text-white ${isToday ? 'bg-pink-400' : 'bg-[#3f51b5]'}`}>今日</button>
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">次日 ▶</button>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="min-w-0 max-w-full appearance-none border border-slate-300 bg-white px-2 py-1 text-[13px]"
        />
        {view && (
          <span className="text-[14px] font-bold text-slate-700 md:ml-2">
            予約数 <span className="text-[#3f51b5]">{view.activeCount}</span>本 ／ 出勤数 <span className="text-[#3f51b5]">{view.workingCount}</span>人
          </span>
        )}
        <span className="ml-auto text-[12px] text-slate-500">空いているところを押すと受付できます</span>
      </div>

      {err && <p className="mb-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">{err}</p>}
      {!data && !err && <p className="p-6 text-center text-[14px] text-slate-400">読み込み中です…</p>}

      {view && (
        <Grid
          rows={view.rows}
          startMin={view.startMin}
          endMin={view.endMin}
          baseMs={baseMs}
          nowMs={isToday ? nowMs : null}
          pickedId={picked?.id ?? null}
          onPick={setPicked}
          onEmpty={(therapistId, min) => {
            setPicked(null);
            const first = data?.courses[0];
            setForm({
              mode: 'new',
              therapistKey: therapistId == null ? 'free' : String(therapistId),
              startMin: min,
              courseName: first?.name ?? '',
              courseMin: first?.durationMin ?? 60,
              intervalMin: (INTERVAL_OPTIONS as readonly number[]).includes(data?.defaultIntervalMin ?? 0) ? (data?.defaultIntervalMin ?? 0) : 0,
              customerName: '',
              customerTel: '',
              note: '',
            });
          }}
        />
      )}

      {picked && (
        <DetailPanel
          booking={picked}
          therapistName={
            picked.therapistId == null
              ? 'フリー（担当未定）'
              : data?.therapists.find((t) => t.id === picked.therapistId)?.name ?? '(不明)'
          }
          salonId={salonId}
          adminSalonQuery={adminSalonQuery}
          onClose={() => setPicked(null)}
          onChanged={(b) => { setPicked(b); reload(); }}
          onDone={() => { setPicked(null); reload(); }}
          onEdit={() => {
            const b = picked;
            const span = Math.round((new Date(b.slotEndISO).getTime() - new Date(b.slotStartISO).getTime()) / 60000);
            setForm({
              mode: 'edit',
              bookingId: b.id,
              origTherapistKey: b.therapistId == null ? 'free' : String(b.therapistId),
              origStartMin: minOfDay(b.slotStartISO, baseMs),
              therapistKey: b.therapistId == null ? 'free' : String(b.therapistId),
              startMin: minOfDay(b.slotStartISO, baseMs),
              courseName: b.courseName,
              courseMin: b.courseMin || span,
              intervalMin: Math.max(0, span - (b.courseMin || span)),
              customerName: b.customerName,
              customerTel: b.customerTel,
              note: b.note,
            });
            setPicked(null);
          }}
        />
      )}

      {form && data && (
        <BookingForm
          key={form.bookingId ?? `new-${form.therapistKey}-${form.startMin}`}
          initial={form}
          salonId={salonId}
          baseMs={baseMs}
          therapists={data.therapists}
          courses={data.courses}
          dayBookings={data.bookings}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
        />
      )}
    </div>
  );
}

function Grid({
  rows, startMin, endMin, baseMs, nowMs, pickedId, onPick, onEmpty,
}: {
  rows: Row[];
  startMin: number;
  endMin: number;
  baseMs: number;
  nowMs: number | null;
  pickedId: string | null;
  onPick: (b: CrmScheduleBooking) => void;
  /** 空いているところを押した（therapistId: null＝フリー・min: その日0:00からの分） */
  onEmpty: (therapistId: number | null, min: number) => void;
}) {
  const width = (endMin - startMin) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m / 60);
  const x = (min: number) => (Math.min(Math.max(min, startMin), endMin) - startMin) * PX_PER_MIN;
  const nowMin = nowMs != null ? Math.round((nowMs - baseMs) / 60000) : null;
  const showNow = nowMin != null && nowMin >= startMin && nowMin <= endMin;

  return (
    <div className="max-h-[calc(100vh-170px)] overflow-auto border border-slate-300 bg-white">
      <div className="relative" style={{ width: NAME_W + width }}>
        {/* 時間の見出し（上に固定） */}
        <div className="sticky top-0 z-30 flex border-b border-slate-300 bg-slate-50" style={{ height: 30 }}>
          <div className="sticky left-0 z-10 flex-none border-r border-slate-300 bg-slate-100 px-2 text-[12px] font-bold leading-[30px] text-slate-500" style={{ width: NAME_W }}>
            セラピスト
          </div>
          {hours.map((h) => (
            <div key={h} className="flex-none border-r border-slate-200 pl-1.5 text-[13px] font-bold leading-[30px] text-slate-600" style={{ width: 60 * PX_PER_MIN }}>
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {rows.map((r) => (
          <div key={r.key} className="relative flex border-b border-slate-200" style={{ height: ROW_H }}>
            {/* 名前（左に固定） */}
            <div className="sticky left-0 z-20 flex-none border-r border-slate-300 bg-white px-2 py-1.5" style={{ width: NAME_W }}>
              {r.therapist ? (
                <>
                  <p className="truncate text-[15px] font-black text-[#3f51b5]">{r.therapist.name}</p>
                  <p className="text-[12px] font-bold text-slate-600">
                    {r.therapist.schedules.length > 0
                      ? r.therapist.schedules.map((w) => `${w.start}-${w.end}`).join(' / ')
                      : '出勤なし'}
                  </p>
                  <p className="text-[11px] text-slate-400">{r.bookings.filter((b) => b.status !== 'cancelled').length}本</p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-black text-amber-600">フリー</p>
                  <p className="text-[11px] text-slate-400">担当未定の予約</p>
                </>
              )}
            </div>

            {/* 時間の中身（空いているところを押すと受付） */}
            <div
              className="relative flex-none cursor-copy"
              style={{ width }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const min = startMin + (e.clientX - rect.left) / PX_PER_MIN;
                const snapped = Math.floor(min / CLICK_STEP_MIN) * CLICK_STEP_MIN;
                onEmpty(r.therapist ? r.therapist.id : null, Math.max(DAY_START_MIN, Math.min(snapped, WINDOW_END_MIN - CLICK_STEP_MIN)));
              }}
            >
              {/* 1時間ごとの線 */}
              {hours.map((h) => (
                <div key={h} className="pointer-events-none absolute top-0 bottom-0 border-r border-slate-100" style={{ left: (h * 60 - startMin + 60) * PX_PER_MIN - 1 }} />
              ))}
              {/* 出勤の帯 */}
              {r.therapist?.schedules.map((w, i) => {
                const s = Math.round((new Date(w.startISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(w.endISO).getTime() - baseMs) / 60000);
                return (
                  <div key={i} className="pointer-events-none absolute top-0 bottom-0 bg-pink-100/70" style={{ left: x(s), width: Math.max(0, x(e) - x(s)) }}>
                    <span className="absolute right-1 top-0.5 text-[10px] font-bold text-pink-400">{w.end}</span>
                  </div>
                );
              })}
              {/* 予約 */}
              {r.bookings.map((b) => {
                const s = Math.round((new Date(b.slotStartISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(b.slotEndISO).getTime() - baseMs) / 60000);
                return (
                  <BookingCard
                    key={b.id}
                    b={b}
                    left={x(s)}
                    width={Math.max(24, x(e) - x(s))}
                    picked={pickedId === b.id}
                    ng={r.therapist != null && (b.customer?.ngTherapistIds.includes(r.therapist.id) ?? false)}
                    onPick={() => onPick(b)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* 今の時刻（赤い線） */}
        {showNow && (
          <div
            className="pointer-events-none absolute bottom-0 z-[15] w-0.5 bg-red-500"
            style={{ left: NAME_W + (nowMin! - startMin) * PX_PER_MIN, top: 30 }}
          />
        )}
      </div>
    </div>
  );
}

function BookingCard({
  b, left, width, picked, ng, onPick,
}: {
  b: CrmScheduleBooking;
  left: number;
  width: number;
  picked: boolean;
  ng: boolean;
  onPick: () => void;
}) {
  const cancelled = b.status === 'cancelled';
  const c = b.customer;
  const tone = cancelled
    ? 'bg-slate-100 text-slate-400 border-slate-300'
    : b.status === 'new'
      ? 'bg-pink-50 text-slate-800 border-pink-400'
      : 'bg-cyan-50 text-slate-800 border-cyan-400';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onPick(); }}
      title={`${hm(b.slotStartISO)}-${hm(b.slotEndISO)} ${c?.name || b.customerName}`}
      className={`absolute top-1 bottom-1 overflow-hidden border px-1 text-left leading-tight shadow-sm ${tone} ${
        ng && !cancelled ? '!border-2 !border-rose-600' : ''
      } ${picked ? 'ring-2 ring-[#3f51b5]' : ''} ${cancelled ? 'z-[5]' : 'z-10'}`}
      style={{ left, width }}
    >
      <p className="truncate text-[12px] font-black">
        {hm(b.slotStartISO)}-{hm(b.slotEndISO)}
        {b.courseMin ? <span className="font-bold text-slate-500">（{b.courseMin}分）</span> : null}
      </p>
      <p className="flex items-center gap-1 truncate text-[12px]">
        {cancelled && <span className={`px-1 text-[10px] font-bold text-white ${b.cancelBad ? 'bg-rose-600' : 'bg-slate-400'}`}>{b.cancelBad ? '悪質' : 'ｷｬﾝｾﾙ'}</span>}
        {!cancelled && b.status === 'new' && <span className="bg-pink-500 px-1 text-[10px] font-bold text-white">未確定</span>}
        {c && <span className={`border px-1 text-[10px] font-bold leading-none ${CRM_CATEGORY_CLASS[c.category]}`}>{CRM_CATEGORY_LABEL[c.category]}</span>}
        <span className="truncate font-bold">{c?.name || b.customerName || '(名前なし)'}</span>
      </p>
      <p className="flex items-center gap-1 truncate text-[11px]">
        {ng && !cancelled && <span className="bg-rose-600 px-1 font-bold text-white">女子NG</span>}
        {c?.cautionMemo && <span className="bg-rose-100 px-1 font-bold text-rose-700">要注意</span>}
        {c && <span className="text-slate-500">利用{c.stats.visits}</span>}
        <span className="truncate text-slate-500">{b.courseName}</span>
      </p>
    </button>
  );
}

function DetailPanel({
  booking: b, therapistName, salonId, adminSalonQuery, onClose, onChanged, onDone, onEdit,
}: {
  booking: CrmScheduleBooking;
  therapistName: string;
  salonId: number;
  adminSalonQuery: string;
  onClose: () => void;
  onChanged: (b: CrmScheduleBooking) => void;
  /** 状態を変えた・消した → 閉じて読み直す */
  onDone: () => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 取り返しのつきにくい操作は2回押し（ダイアログは出さない）
  const [confirming, setConfirming] = useState<'cancel' | 'delete' | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setErr('');
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'うまくいきませんでした'); return; }
    onDone();
  };
  const c = b.customer;
  const ng = b.therapistId != null && (c?.ngTherapistIds.includes(b.therapistId) ?? false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleBad = async () => {
    setBusy(true);
    setErr('');
    const res = await setCrmCancelBad(salonId, b.id, !b.cancelBad);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onChanged({ ...b, cancelBad: !b.cancelBad });
  };

  const ledgerHref = c
    ? `/mypage/crm/customers${adminSalonQuery ? `${adminSalonQuery}&` : '?'}customer=${c.id}`
    : '';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[400px] overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center bg-[#b3b8e6] px-4 py-2.5">
          <span className="text-[15px] font-black text-slate-800">お客様と予約</span>
          <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold text-slate-700" aria-label="閉じる">×</button>
        </div>

        {/* お客様 */}
        <section className="border-b border-slate-200 p-4">
          {c ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`border px-1.5 py-0.5 text-[11px] font-bold leading-none ${CRM_CATEGORY_CLASS[c.category]}`}>{CRM_CATEGORY_LABEL[c.category]}</span>
                <span className="text-[18px] font-black text-slate-800">{c.name || b.customerName || '(名前なし)'}</span>
              </div>
              {c.cautionMemo && (
                <p className="mt-2 whitespace-pre-line border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">要注意：{c.cautionMemo}</p>
              )}
              {ng && <p className="mt-2 bg-rose-600 px-3 py-1.5 text-[13px] font-bold text-white">担当の {therapistName} さんは、このお客様の女子NGです</p>}
              <div className="mt-2 grid grid-cols-4 gap-px bg-slate-200 text-center">
                {[
                  ['利用', c.stats.visits],
                  ['予約中', c.stats.upcoming],
                  ['ｷｬﾝｾﾙ', c.stats.cancels],
                  ['悪質', c.stats.badCancels],
                ].map(([k, v]) => (
                  <div key={String(k)} className="bg-white py-1.5">
                    <p className="text-[10px] font-bold text-slate-400">{k}</p>
                    <p className={`text-[15px] font-black ${k === '悪質' && Number(v) > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{v}</p>
                  </div>
                ))}
              </div>
              <Link href={ledgerHref} className="mt-3 inline-block bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white">
                顧客台帳で開く（編集・履歴）
              </Link>
            </>
          ) : (
            <>
              <p className="text-[18px] font-black text-slate-800">{b.customerName || '(名前なし)'}</p>
              <p className="mt-1 text-[12px] text-slate-500">電話番号が無い（または形が違う）ため、顧客台帳にはひも付いていません。</p>
            </>
          )}
        </section>

        {/* 予約 */}
        <section className="p-4">
          <dl className="grid grid-cols-[6em_1fr] gap-y-1.5 text-[14px]">
            <dt className="font-bold text-slate-400">時間</dt>
            <dd className="font-bold text-slate-800">{hm(b.slotStartISO)}〜{hm(b.slotEndISO)}</dd>
            <dt className="font-bold text-slate-400">担当</dt>
            <dd className={ng ? 'font-bold text-rose-600' : 'text-slate-800'}>{therapistName}</dd>
            <dt className="font-bold text-slate-400">コース</dt>
            <dd className="text-slate-800">{b.courseName || '—'}{b.courseMin ? `（${b.courseMin}分）` : ''}</dd>
            <dt className="font-bold text-slate-400">電話</dt>
            <dd className="text-slate-800">{b.customerTel || '—'}</dd>
            <dt className="font-bold text-slate-400">状態</dt>
            <dd className="text-slate-800">
              {b.status === 'cancelled' ? (b.cancelBad ? '悪質キャンセル' : 'キャンセル') : b.status === 'new' ? '未確定（ネット予約）' : '確定'}
            </dd>
            <dt className="font-bold text-slate-400">入り口</dt>
            <dd className="text-slate-800">{b.source === 'web' ? 'ネット予約' : '予約ボード'}</dd>
            <dt className="font-bold text-slate-400">備考</dt>
            <dd className="whitespace-pre-line text-slate-800">{b.note || '—'}</dd>
          </dl>
          {/* 操作 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {b.status !== 'cancelled' && (
              <button type="button" disabled={busy} onClick={onEdit} className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">
                変更する
              </button>
            )}
            {b.status === 'new' && (
              <button type="button" disabled={busy} onClick={() => run(() => updateBookingStatus(b.id, 'confirmed'))} className="bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">
                確定にする
              </button>
            )}
            {b.status !== 'cancelled' && (
              confirming === 'cancel' ? (
                <button type="button" disabled={busy} onClick={() => run(() => updateBookingStatus(b.id, 'cancelled'))} className="bg-rose-600 px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">
                  もう一度押すとキャンセル
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirming('cancel')} className="border border-rose-300 bg-white px-3 py-1.5 text-[13px] font-bold text-rose-600 disabled:opacity-50">
                  キャンセルにする
                </button>
              )
            )}
            {b.status === 'cancelled' && (
              <>
                <button type="button" disabled={busy} onClick={toggleBad} className="border border-rose-300 bg-white px-3 py-1.5 text-[13px] font-bold text-rose-600 disabled:opacity-50">
                  {b.cancelBad ? '悪質を外す' : '悪質キャンセルにする'}
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => updateBookingStatus(b.id, 'confirmed'))} className="border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-600 disabled:opacity-50">
                  キャンセルを取り消す
                </button>
              </>
            )}
          </div>
          <div className="mt-3">
            {confirming === 'delete' ? (
              <button type="button" disabled={busy} onClick={() => run(() => deleteBooking(b.id))} className="bg-slate-700 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                もう一度押すと削除（元に戻せません）
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirming('delete')} className="text-[12px] font-bold text-slate-400 underline">
                誤って入れた予約を削除する
              </button>
            )}
          </div>
          {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
          <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
            ふだんは削除ではなくキャンセルにしてください（キャンセルの記録がお客様の台帳に残ります）。
          </p>
        </section>
      </aside>
    </>
  );
}

// ── 受付・変更フォーム ─────────────────────────────────
type BookingFormState = {
  mode: 'new' | 'edit';
  bookingId?: string;
  origTherapistKey?: string;
  origStartMin?: number;
  therapistKey: string;   // 'free' か セラピストID
  startMin: number;       // その日 0:00 からの分
  courseName: string;
  courseMin: number;
  intervalMin: number;
  customerName: string;
  customerTel: string;
  note: string;
};

const fieldCls = 'w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';
const labCls = 'mb-1 block text-[12px] font-bold text-slate-500';

function BookingForm({
  initial, salonId, baseMs, therapists, courses, dayBookings, onClose, onSaved,
}: {
  initial: BookingFormState;
  salonId: number;
  baseMs: number;
  therapists: CrmScheduleTherapist[];
  courses: CrmScheduleData['courses'];
  /** この日の予約（同じお客様の二重受付に気づけるように） */
  dayBookings: CrmScheduleBooking[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<BookingFormState>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState<CrmScheduleCustomer | null | 'none'>(null); // null＝まだ引いていない
  const set = <K extends keyof BookingFormState>(k: K, v: BookingFormState[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 電話番号を入れたら台帳を引く（0.4秒止まったら）
  const telDigits = f.customerTel.replace(/[^0-9０-９]/g, '');
  useEffect(() => {
    if (telDigits.length < 10) return;
    let alive = true;
    const t = setTimeout(() => {
      lookupCrmCustomerByPhone(salonId, f.customerTel).then((res) => {
        if (!alive || !res.ok) return;
        setFound(res.customer ?? 'none');
        const c = res.customer;
        if (c?.name) setF((p) => (p.customerName.trim() ? p : { ...p, customerName: c.name }));
      });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telDigits, salonId]);

  const customer = found && found !== 'none' && telDigits.length >= 10 ? found : null;
  // ★ 同じお客様（台帳の人 or 同じ電話番号）が、この日すでに予約を持っていないか。
  //   第531便の確認で「変更」のつもりが新しい受付になり、同じ人の予約が2本になった（2026-09-19）。
  const telKey = telDigits.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const sameDay = dayBookings.filter((b) =>
    b.id !== f.bookingId &&
    b.status !== 'cancelled' &&
    ((customer && b.customer?.id === customer.id) ||
      (telKey.length >= 10 && b.customerTel.replace(/[^0-9]/g, '') === telKey)),
  );
  const tid = f.therapistKey === 'free' ? null : Number(f.therapistKey);
  const ng = tid != null && (customer?.ngTherapistIds.includes(tid) ?? false);

  // 開始時刻の候補（6:00〜翌6:55）
  const hourOptions: number[] = [];
  for (let h = 6; h <= 30; h++) hourOptions.push(h);
  const startH = Math.floor(f.startMin / 60);
  const startM = f.startMin % 60;
  const durationOptions: number[] = [];
  for (let m = 15; m <= 360; m += 5) durationOptions.push(m);
  if (!durationOptions.includes(f.courseMin)) durationOptions.push(f.courseMin);
  durationOptions.sort((a, b) => a - b);

  const endLabel = (() => {
    const e = f.startMin + f.courseMin;
    const h = Math.floor(e / 60);
    return `${h >= 24 ? `翌${h - 24}` : h}:${String(e % 60).padStart(2, '0')}`;
  })();

  const submit = async () => {
    setBusy(true);
    setErr('');
    const slotStartISO = new Date(baseMs + f.startMin * 60000).toISOString();
    if (f.mode === 'new') {
      const res = await createManualBooking({
        salonId,
        therapistId: tid,
        slotStartISO,
        durationMin: f.courseMin,
        intervalMin: f.intervalMin,
        courseName: f.courseName,
        customerName: f.customerName,
        customerTel: f.customerTel,
        note: f.note,
      });
      setBusy(false);
      if (!res.ok) { setErr(res.error ?? '保存できませんでした'); return; }
      onSaved();
      return;
    }
    // 変更：担当か開始時刻が変わったら先に移動、そのあと内容
    if (f.therapistKey !== f.origTherapistKey || f.startMin !== f.origStartMin) {
      const mv = await moveBooking(f.bookingId!, tid, slotStartISO);
      if (!mv.ok) { setBusy(false); setErr(mv.error ?? '移動できませんでした'); return; }
    }
    const up = await updateBookingDetails({
      bookingId: f.bookingId!,
      courseName: f.courseName,
      courseMin: f.courseMin,
      intervalMin: f.intervalMin,
      customerName: f.customerName,
      customerTel: f.customerTel,
      note: f.note,
    });
    setBusy(false);
    if (!up.ok) { setErr(up.error ?? '保存できませんでした'); return; }
    onSaved();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-[440px] flex-col bg-white shadow-xl">
        <div className="flex items-center bg-[#3f51b5] px-4 py-2.5 text-white">
          <span className="text-[15px] font-black">{f.mode === 'new' ? '予約を受け付ける' : '予約を変更する'}</span>
          <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* お客様（電話 → 台帳） */}
          <div>
            <label className={labCls}>電話番号（入れると台帳からお客様を出します）</label>
            <input className={fieldCls} value={f.customerTel} inputMode="tel" onChange={(e) => { set('customerTel', e.target.value); setFound(null); }} placeholder="090-1234-5678" />
            {telDigits.length >= 10 && found === 'none' && (
              <p className="mt-1 text-[12px] text-slate-500">台帳にない番号です（新しいお客様として台帳に入ります）</p>
            )}
            {sameDay.length > 0 && (
              <div className="mt-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
                このお客様は、この日すでに予約があります：
                {sameDay.map((b) => {
                  const t = b.therapistId == null ? 'フリー' : therapists.find((x) => x.id === b.therapistId)?.name ?? '';
                  return <span key={b.id} className="ml-1">{hm(b.slotStartISO)}〜 {t}</span>;
                })}
                {f.mode === 'new' && <p className="mt-1 text-[12px] font-normal">時間や担当を変えたいときは、その予約のカードを押して「変更する」を使ってください。</p>}
              </div>
            )}
            {customer && (
              <div className="mt-2 border border-indigo-200 bg-indigo-50 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`border px-1.5 py-0.5 text-[11px] font-bold leading-none ${CRM_CATEGORY_CLASS[customer.category]}`}>{CRM_CATEGORY_LABEL[customer.category]}</span>
                  <span className="text-[15px] font-black text-slate-800">{customer.name || '(名前なし)'}</span>
                  <span className="text-[12px] text-slate-500">
                    利用{customer.stats.visits}・予約中{customer.stats.upcoming}・ｷｬﾝｾﾙ{customer.stats.cancels}
                    {customer.stats.badCancels > 0 && <span className="font-bold text-rose-600">（悪質{customer.stats.badCancels}）</span>}
                  </span>
                </div>
                {customer.cautionMemo && <p className="mt-1.5 whitespace-pre-line text-[13px] font-bold text-rose-700">要注意：{customer.cautionMemo}</p>}
                {customer.category === 'ng' && <p className="mt-1.5 bg-rose-600 px-2 py-1 text-[13px] font-bold text-white">このお客様は分類が「NG」です</p>}
              </div>
            )}
          </div>
          <div>
            <label className={labCls}>お客様の名前 <span className="text-rose-500">必須</span></label>
            <input className={fieldCls} value={f.customerName} maxLength={40} onChange={(e) => set('customerName', e.target.value)} />
          </div>

          {/* 担当と時間 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labCls}>担当</label>
              <select className={fieldCls} value={f.therapistKey} onChange={(e) => set('therapistKey', e.target.value)}>
                <option value="free">フリー（担当未定）</option>
                {therapists.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}{customer?.ngTherapistIds.includes(t.id) ? '（女子NG）' : ''}
                  </option>
                ))}
              </select>
              {ng && <p className="mt-1 bg-rose-600 px-2 py-1 text-[13px] font-bold text-white">この担当は、このお客様の女子NGです</p>}
            </div>
            <div>
              <label className={labCls}>開始</label>
              <div className="flex gap-1">
                <select className={fieldCls} value={startH} onChange={(e) => set('startMin', Number(e.target.value) * 60 + startM)}>
                  {hourOptions.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
                <select className={fieldCls} value={startM - (startM % FORM_STEP_MIN)} onChange={(e) => set('startMin', startH * 60 + Number(e.target.value))}>
                  {Array.from({ length: 60 / FORM_STEP_MIN }, (_, i) => i * FORM_STEP_MIN).map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labCls}>時間（終わり {endLabel}）</label>
              <select className={fieldCls} value={f.courseMin} onChange={(e) => set('courseMin', Number(e.target.value))}>
                {durationOptions.map((m) => <option key={m} value={m}>{m}分</option>)}
              </select>
            </div>
          </div>

          {/* コース */}
          <div>
            <label className={labCls}>コース</label>
            {courses.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {courses.map((c) => (
                  <button
                    key={`${c.name}-${c.durationMin}`}
                    type="button"
                    onClick={() => setF((p) => ({ ...p, courseName: c.name, courseMin: c.durationMin }))}
                    className={`border px-2 py-1 text-[12px] font-bold ${
                      f.courseName === c.name && f.courseMin === c.durationMin
                        ? 'border-[#3f51b5] bg-[#3f51b5] text-white'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    {c.name}（{c.durationMin}分{c.price ? `・${c.price}` : ''}）
                  </button>
                ))}
              </div>
            )}
            <input className={fieldCls} value={f.courseName} onChange={(e) => set('courseName', e.target.value)} placeholder="空欄なら「電話予約」" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labCls}>インターバル（次の予約まで空ける）</label>
              <select className={fieldCls} value={f.intervalMin} onChange={(e) => set('intervalMin', Number(e.target.value))}>
                {INTERVAL_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? 'なし' : `${m}分`}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labCls}>備考</label>
            <textarea className={`${fieldCls} min-h-[64px]`} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>

        <div className="border-t border-slate-200 p-3">
          {err && <p className="mb-2 text-[13px] font-bold text-rose-600">{err}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !f.customerName.trim()} onClick={submit} className="flex-1 bg-[#3f51b5] py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
              {busy ? '保存中…' : f.mode === 'new' ? 'この内容で受け付ける' : '変更を保存する'}
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="border border-slate-300 bg-white px-4 text-[14px] font-bold text-slate-600">
              やめる
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
