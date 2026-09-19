'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  closeCrmDay,
  confirmCrmPay,
  getCrmDaySummary,
  getCrmSchedule,
  lookupCrmCustomerByPhone,
  reopenCrmDay,
  saveCrmTherapistMemo,
  setCrmBookingPricing,
  setCrmCancelBad,
  setCrmPlayStatus,
  setCrmWorkEnd,
  saveCrmWorkDay,
  unconfirmCrmPay,
} from '@/app/actions/crm';
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
  CRM_PAYMENT_METHODS,
  CRM_PRICE_KINDS,
  CRM_PRICE_KIND_LABEL,
  CRM_PRICE_SINGLE,
  CRM_PLAY_LABEL,
  CRM_END_LABEL,
  type CrmEndType,
  CRM_ATTENDANCE,
  CRM_ATTENDANCE_LABEL,
  CRM_EMPTY_WORK_DAY,
  roomColor,
  type CrmAttendance,
  type CrmWorkDay,
  inBusinessDay,
  nominationBadge,
  type CrmPlayStatus,
  sumCrmItems,
  yen,
  type CrmDaySummary,
  type CrmPayConfirm,
  type CrmBookingItem,
  type CrmPriceItem,
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
const MEMO_W = 180;             // 女子メモの列（2026-09-19）
const ROW_H = 66;
const DAY_START_MIN = 6 * 60;  // 営業日の始まり（6:00）
const WINDOW_END_MIN = 31 * 60; // 予約ボードの窓の終わり（翌7:00）
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

// ★ スマホ（md 未満）かどうか（第541便）。★ サーバーでは false（PC の形）。
function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia('(max-width: 767px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false,
  );
}

type Row = { key: string; therapist: CrmScheduleTherapist | null; bookings: CrmScheduleBooking[]; done?: boolean };

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
  // 女子メモの編集（null＝閉じている）
  const [memoEdit, setMemoEdit] = useState<CrmScheduleTherapist | null>(null);
  // 報酬確定・締め（第538便）
  const [confirmFor, setConfirmFor] = useState<CrmScheduleTherapist | null>(null);
  const [closing, setClosing] = useState(false);
  // 出勤情報（名前を押す・第550便）
  const [workFor, setWorkFor] = useState<CrmScheduleTherapist | null>(null);
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
    if (picked || form || memoEdit || confirmFor || closing || workFor) return;
    const t = setInterval(() => setTick((v) => v + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, [picked, form, memoEdit, confirmFor, closing, workFor]);

  const reload = useCallback(() => setTick((v) => v + 1), []);

  const baseMs = useMemo(() => new Date(`${date}T00:00:00+09:00`).getTime(), [date]);

  // 行と表示範囲
  const view = useMemo(() => {
    if (!data) return null;
    const inWindow = (s: number, e: number) => e > DAY_START_MIN && s < WINDOW_END_MIN;
    // ★ 時間軸の始まりと終わりは「設定」タブの値（第548便）。予約がその外にあるときだけ広げる。
    let minStart = data.settings.dayStartMin;
    let maxEnd = data.settings.dayEndMin;
    const noteBooking = (s: number, e: number) => {
      if (!inWindow(s, e)) return;
      minStart = Math.min(minStart, Math.max(DAY_START_MIN, s));
      maxEnd = Math.max(maxEnd, Math.min(WINDOW_END_MIN, e));
    };
    const visibleBookings = data.bookings.filter((b) => {
      const s = minOfDay(b.slotStartISO, baseMs);
      const e = minOfDay(b.slotEndISO, baseMs);
      return inWindow(s, e);
    });
    visibleBookings.forEach((b) => noteBooking(minOfDay(b.slotStartISO, baseMs), minOfDay(b.slotEndISO, baseMs)));

    const rows: Row[] = [];
    // ★ フリー（担当未定）の行はいつも出す（ここに受付できるように）。
    const free = visibleBookings.filter((b) => b.therapistId == null);
    rows.push({ key: 'free', therapist: null, bookings: free });

    const therapistRows: Row[] = [];
    for (const t of data.therapists) {
      const scheds = t.schedules.filter((w) => inWindow(minOfDay(w.startISO, baseMs), minOfDay(w.endISO, baseMs)));
      const bs = visibleBookings.filter((b) => b.therapistId === t.id);
      if (scheds.length === 0 && bs.length === 0) continue;
      therapistRows.push({ key: `t${t.id}`, therapist: { ...t, schedules: scheds }, bookings: bs, done: data.confirms.some((c) => c.therapistId === t.id) });
    }
    // 出勤の早い順（出勤なし・予約だけの人は後ろ）
    const firstStart = (r: Row) => r.therapist?.schedules[0] ? minOfDay(r.therapist.schedules[0].startISO, baseMs) : 99999;
    // ★ 報酬を確定した人は灰色にして下へ（風俗CTIv2 と同じ・第543便）。取り消すと元の位置に戻る。
    therapistRows.sort((a, b) => Number(!!a.done) - Number(!!b.done) || firstStart(a) - firstStart(b));
    rows.push(...therapistRows);

    const startMin = Math.floor(minStart / 60) * 60;
    const endMin = Math.ceil(maxEnd / 60) * 60;
    const activeCount = visibleBookings.filter((b) => b.status !== 'cancelled').length;
    const sales = visibleBookings.filter((b) => b.status !== 'cancelled').reduce((a, b) => a + (b.priceTotal ?? 0), 0);
    // ★ 報酬は確定のときの手当・交通費も足す（日報の女子報酬とそろえる・第539便）
    const payAll = visibleBookings.filter((b) => b.status !== 'cancelled').reduce((a, b) => a + (b.payTotal ?? 0), 0)
      + data.confirms.reduce((a, c) => a + c.allowance, 0);
    const workingCount = therapistRows.filter((r) => (r.therapist?.schedules.length ?? 0) > 0).length;
    return { rows, startMin, endMin, activeCount, workingCount, sales, payAll };
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
            {' '}／ 売上 <span className="text-[#3f51b5]">{yen(view.sales)}</span> ／ 報酬 <span className="text-[#3f51b5]">{yen(view.payAll)}</span>
            {' '}（報酬確定済 <span className="text-emerald-600">{data?.confirms.length ?? 0}</span>人）
          </span>
        )}
        {data && (
          data.report ? (
            <button type="button" onClick={() => setClosing(true)} className="bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white">
              ✓ 締め済み（日報）
            </button>
          ) : (
            <button type="button" onClick={() => setClosing(true)} className="border-2 border-[#3f51b5] bg-white px-3 py-1 text-[13px] font-bold text-[#3f51b5]">
              締め作業（日報を作る）
            </button>
          )
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
          onMemo={setMemoEdit}
          confirms={data?.confirms ?? []}
          onConfirm={setConfirmFor}
          workDayOf={(tid) => data?.workDays[tid] ?? null}
          roomColorOf={(room) => data?.settings.roomColors[room]}
          onWork={setWorkFor}
          endTypeOf={(tid) => data?.workEnds[tid] ?? data?.settings.defaultEndType ?? 'finish'}
          onToggleEnd={async (tid, next) => {
            const r = await setCrmWorkEnd(salonId, tid, date, next);
            if (!r.ok) { setErr(r.error); return; }
            reload();
          }}
          onEmpty={(therapistId, min) => {
            // ★ 休憩の時間は受付しない（第551便）
            const wd = therapistId != null ? data?.workDays[therapistId] : undefined;
            if (wd && wd.breakStartMin != null && wd.breakEndMin != null && min >= wd.breakStartMin && min < wd.breakEndMin) {
              setErr('休憩の時間には予約を入れられません');
              return;
            }
            setErr('');
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
              selIds: [],
              keepItems: [],
              priceAdjust: '',
              payAdjust: '',
              paymentMethod: '',
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
              ...splitItems(b.items, data?.priceItems ?? []),
              priceAdjust: b.priceAdjust ? String(b.priceAdjust) : '',
              payAdjust: b.payAdjust ? String(b.payAdjust) : '',
              paymentMethod: b.paymentMethod,
            });
            setPicked(null);
          }}
        />
      )}

      {workFor && data && (
        <WorkDayDialog
          key={workFor.id}
          therapist={workFor}
          salonId={salonId}
          date={date}
          rooms={data.settings.rooms}
          endType={data.workEnds[workFor.id] ?? data.settings.defaultEndType}
          initial={data.workDays[workFor.id] ?? CRM_EMPTY_WORK_DAY}
          onClose={() => setWorkFor(null)}
          onSaved={() => { setWorkFor(null); reload(); }}
          onConfirm={() => { const t = workFor; setWorkFor(null); setConfirmFor(t); }}
        />
      )}

      {confirmFor && data && (
        <ConfirmDialog
          key={confirmFor.id}
          transport={data.workDays[confirmFor.id]?.transport ?? 0}
          therapist={confirmFor}
          salonId={salonId}
          date={date}
          baseMs={baseMs}
          bookings={data.bookings.filter((b) => b.therapistId === confirmFor.id)}
          confirm={data.confirms.find((c) => c.therapistId === confirmFor.id) ?? null}
          onClose={() => setConfirmFor(null)}
          onDone={() => { setConfirmFor(null); reload(); }}
        />
      )}

      {closing && (
        <CloseDialog
          salonId={salonId}
          date={date}
          onClose={() => setClosing(false)}
          onDone={() => { setClosing(false); reload(); }}
        />
      )}

      {memoEdit && (
        <MemoDialog
          key={memoEdit.id}
          therapist={memoEdit}
          salonId={salonId}
          onClose={() => setMemoEdit(null)}
          onSaved={() => { setMemoEdit(null); reload(); }}
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
          priceItems={data.priceItems}
          dayBookings={data.bookings}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
        />
      )}
    </div>
  );
}

function Grid({
  rows, startMin, endMin, baseMs, nowMs, pickedId, onPick, onMemo, confirms, onConfirm, workDayOf, roomColorOf, onWork, endTypeOf, onToggleEnd, onEmpty,
}: {
  /** その日の出勤情報（休憩・待機場所・遅刻当欠・交通費） */
  workDayOf: (therapistId: number) => CrmWorkDay | null;
  /** 部屋の色の名前 */
  roomColorOf: (room: string) => string | undefined;
  /** 名前を押した */
  onWork: (t: CrmScheduleTherapist) => void;
  /** そのセラピストのその日の「受まで／上がり」 */
  endTypeOf: (therapistId: number) => CrmEndType;
  onToggleEnd: (therapistId: number, next: CrmEndType) => void;
  rows: Row[];
  startMin: number;
  endMin: number;
  baseMs: number;
  nowMs: number | null;
  pickedId: string | null;
  onPick: (b: CrmScheduleBooking) => void;
  /** 女子メモを押した */
  onMemo: (t: CrmScheduleTherapist) => void;
  confirms: CrmPayConfirm[];
  /** 報酬確定を押した */
  onConfirm: (t: CrmScheduleTherapist) => void;
  /** 空いているところを押した（therapistId: null＝フリー・min: その日0:00からの分） */
  onEmpty: (therapistId: number | null, min: number) => void;
}) {
  // ★ スマホは名前の列を細く・女子メモの列を出さない（名前の下の「メモ」から開く）・時間軸を詰める（第541便）
  const narrow = useNarrow();
  const nameW = narrow ? 108 : NAME_W;
  const memoW = narrow ? 0 : MEMO_W;
  const leftW = nameW + memoW;
  const ppm = narrow ? 1.2 : PX_PER_MIN;
  const width = (endMin - startMin) * ppm;
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m / 60);
  const x = (min: number) => (Math.min(Math.max(min, startMin), endMin) - startMin) * ppm;
  const nowMin = nowMs != null ? Math.round((nowMs - baseMs) / 60000) : null;
  const showNow = nowMin != null && nowMin >= startMin && nowMin <= endMin;

  return (
    <div className="max-h-[calc(100vh-170px)] overflow-auto border border-slate-300 bg-white">
      <div className="relative" style={{ width: leftW + width }}>
        {/* 時間の見出し（上に固定） */}
        <div className="sticky top-0 z-30 flex border-b border-slate-300 bg-slate-50" style={{ height: 30 }}>
          <div className="sticky left-0 z-10 flex flex-none border-r border-slate-300 bg-slate-100 text-[12px] font-bold leading-[30px] text-slate-500" style={{ width: leftW }}>
            <span className="px-2" style={{ width: nameW }}>セラピスト</span>
            {!narrow && <span className="border-l border-slate-300 px-2" style={{ width: memoW }}>女子メモ</span>}
          </div>
          {hours.map((h) => (
            <div key={h} className="flex-none border-r border-slate-200 pl-1.5 text-[13px] font-bold leading-[30px] text-slate-600" style={{ width: 60 * ppm }}>
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {rows.map((r) => (
          <div key={r.key} className={`relative flex border-b ${r.done ? 'border-slate-300' : 'border-slate-200'}`} style={{ height: ROW_H }}>
            {/* 名前と女子メモ（左に固定） */}
            <div className={`sticky left-0 z-20 flex flex-none border-r border-slate-300 ${r.done ? 'bg-slate-300' : 'bg-white'}`} style={{ width: leftW }}>
            <div className="flex-none px-2 py-1.5" style={{ width: nameW }}>
              {r.therapist ? (
                <>
                  <p className="flex items-center gap-1">
                    {/* ★ 名前を押すと「出勤情報」（第550便） */}
                    <button type="button" onClick={() => onWork(r.therapist!)} className="truncate text-left text-[15px] font-black text-[#3f51b5] underline decoration-dotted underline-offset-2 hover:text-indigo-800">
                      {r.therapist.name}
                    </button>
                    {narrow && (
                      <button
                        type="button"
                        onClick={() => onMemo(r.therapist!)}
                        className={`flex-none px-1 text-[10px] font-bold ${r.therapist.memo ? 'bg-amber-400 text-white' : 'border border-dashed border-amber-400 text-amber-700'}`}
                      >
                        メモ
                      </button>
                    )}
                  </p>
                  <p className="flex items-center gap-1 truncate text-[12px] font-bold text-slate-600">
                    <span className="truncate">
                      {r.therapist.schedules.length > 0
                        ? r.therapist.schedules.map((w) => `${w.start}-${w.end}`).join(' / ')
                        : '出勤なし'}
                    </span>
                    {(() => {
                      const wd = workDayOf(r.therapist!.id);
                      if (!wd) return null;
                      return (
                        <>
                          {wd.attendance && (
                            <span className={`flex-none px-1 text-[10px] font-bold text-white ${wd.attendance === 'late' ? 'bg-amber-500' : 'bg-rose-600'}`}>
                              {CRM_ATTENDANCE_LABEL[wd.attendance]}
                            </span>
                          )}
                          {wd.room && (() => {
                            const c = roomColor(roomColorOf(wd.room));
                            return <span className="flex-none px-1 text-[10px] font-bold" style={{ background: c.bg, color: c.fg }}>{wd.room}</span>;
                          })()}
                        </>
                      );
                    })()}
                  </p>
                  {(() => {
                    // ★ 報酬と確定は【営業日（6:00〜翌6:00に始まる予約）】で数える（サーバーの確定と同じ決まり）
                    const mine = r.bookings.filter((b) => b.status !== 'cancelled' && inBusinessDay(Math.round((new Date(b.slotStartISO).getTime() - baseMs) / 60000)));
                    const pay = mine.reduce((a, b) => a + (b.payTotal ?? 0), 0);
                    const cf = confirms.find((c) => c.therapistId === r.therapist!.id);
                    const changed = cf && (cf.payTotal !== pay || cf.bookingCount !== mine.length);
                    return (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                        <span>{mine.length}本</span>
                        {cf ? (
                          <button
                            type="button"
                            onClick={() => onConfirm(r.therapist!)}
                            title={changed ? '確定のあとに予約が変わっています（押して確定し直し）' : '報酬確定済み（押すと内容・取り消し）'}
                            className={`px-1 font-bold text-white ${changed ? 'bg-amber-500' : 'bg-emerald-600'}`}
                          >
                            {changed ? '⚠変更あり' : '✓確定'} {yen(cf.payTotal + cf.allowance)}
                          </button>
                        ) : (
                          <>
                            <span className="bg-cyan-50 px-1 font-bold text-slate-700">報酬 {yen(pay)}</span>
                            <button type="button" onClick={() => onConfirm(r.therapist!)} className="bg-[#3f51b5] px-1 font-bold text-white">確定</button>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <p className="text-[15px] font-black text-amber-600">フリー</p>
                  <p className="text-[11px] text-slate-400">担当未定の予約</p>
                </>
              )}
            </div>
            {/* 女子メモ（押すと書ける・お店の内部メモ） */}
            {narrow ? null : r.therapist ? (
              <button
                type="button"
                onClick={() => onMemo(r.therapist!)}
                title={r.therapist.memo || '女子メモを書く'}
                className="flex-none overflow-hidden border-l border-slate-200 bg-amber-50/40 px-2 py-1 text-left hover:bg-amber-100"
                style={{ width: memoW }}
              >
                {r.therapist.memo ? (
                  <p className="line-clamp-4 whitespace-pre-line text-[12px] leading-[1.3] text-slate-700">{r.therapist.memo}</p>
                ) : (
                  // ★ 薄すぎて見つけられなかった（2026-09-19）→ 枠つきのボタンに見える形に
                  <span className="inline-block border border-dashed border-amber-400 bg-amber-50 px-2 py-1 text-[12px] font-bold text-amber-700">✎ メモを書く</span>
                )}
              </button>
            ) : (
              <div className="flex-none border-l border-slate-200 bg-slate-50" style={{ width: memoW }} />
            )}
            </div>

            {/* 時間の中身（空いているところを押すと受付） */}
            <div
              className={`relative flex-none cursor-copy ${r.done ? 'bg-slate-300/70' : ''}`}
              style={{ width }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const min = startMin + (e.clientX - rect.left) / ppm;
                const snapped = Math.floor(min / CLICK_STEP_MIN) * CLICK_STEP_MIN;
                onEmpty(r.therapist ? r.therapist.id : null, Math.max(DAY_START_MIN, Math.min(snapped, WINDOW_END_MIN - CLICK_STEP_MIN)));
              }}
            >
              {/* 1時間ごとの線 */}
              {hours.map((h) => (
                <div key={h} className="pointer-events-none absolute top-0 bottom-0 border-r border-slate-100" style={{ left: (h * 60 - startMin + 60) * ppm - 1 }} />
              ))}
              {/* 出勤の帯 */}
              {r.therapist?.schedules.map((w, i) => {
                const s = Math.round((new Date(w.startISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(w.endISO).getTime() - baseMs) / 60000);
                return (
                  <div key={i} className="pointer-events-none absolute top-0 bottom-0 bg-pink-100/70" style={{ left: x(s), width: Math.max(0, x(e) - x(s)) }}>
                    {/* ★ 終わりの時刻に「受まで／上がり」（押すとその日だけ切り替え・第548便） */}
                    {(() => {
                      const tid = r.therapist!.id;
                      const et = endTypeOf(tid);
                      return (
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); onToggleEnd(tid, et === 'accept' ? 'finish' : 'accept'); }}
                          title="押すと「受まで」と「上がり」を切り替えます"
                          className={`pointer-events-auto absolute right-0.5 top-0.5 z-[12] flex items-center gap-0.5 border px-1 text-[10px] font-bold leading-[14px] ${
                            et === 'accept' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-pink-400 bg-white text-pink-600'
                          }`}
                        >
                          {CRM_END_LABEL[et]} {w.end <= w.start ? `翌${Number(w.end.slice(0, 2))}:${w.end.slice(3, 5)}` : w.end}
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
              {/* 休憩（白い帯・第550便） */}
              {r.therapist && (() => {
                const wd = workDayOf(r.therapist.id);
                if (!wd || wd.breakStartMin == null || wd.breakEndMin == null) return null;
                const fmt = (m: number) => `${m >= 1440 ? '翌' : ''}${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
                return (
                  <div
                    className="pointer-events-none absolute top-1 bottom-1 z-[6] overflow-hidden border border-slate-300 bg-white/95 px-1 text-[11px] leading-tight text-slate-600"
                    style={{ left: x(wd.breakStartMin), width: Math.max(0, x(wd.breakEndMin) - x(wd.breakStartMin)) }}
                  >
                    <p className="truncate font-bold">休憩({fmt(wd.breakStartMin)}-{fmt(wd.breakEndMin)})</p>
                    {wd.breakMemo && <p className="truncate">{wd.breakMemo}</p>}
                  </div>
                );
              })()}
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
            style={{ left: leftW + (nowMin! - startMin) * ppm, top: 30 }}
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
        {!cancelled && b.playStatus === 'address_sent' && <span className="bg-blue-600 px-1 text-[10px] font-bold text-white">住所送済</span>}
        {!cancelled && b.playStatus === 'entered' && <span className="bg-yellow-300 px-1 text-[10px] font-bold text-slate-900">入室済</span>}
        {(() => {
          const nb = nominationBadge(b.items);
          if (!nb) return null;
          return nb === '本'
            ? <span className="bg-pink-200 px-1 text-[10px] font-bold text-pink-800">本</span>
            : <span className="bg-slate-200 px-1 text-[10px] font-bold text-slate-700">ﾌﾘｰ</span>;
        })()}
        {/* ★ 「一般」は出さない（枠の場所をとるため・2026-09-19 カッキーさんの指示）。会員・常連・VIP・NG だけ */}
        {c && c.category !== 'general' && <span className={`border px-1 text-[10px] font-bold leading-none ${CRM_CATEGORY_CLASS[c.category]}`}>{CRM_CATEGORY_LABEL[c.category]}</span>}
        <span className="truncate font-bold">{c?.name || b.customerName || '(名前なし)'}</span>
      </p>
      <p className="flex items-center gap-1 truncate text-[11px]">
        {ng && !cancelled && <span className="bg-rose-600 px-1 font-bold text-white">女子NG</span>}
        {c?.cautionMemo && <span className="bg-rose-100 px-1 font-bold text-rose-700">要注意</span>}
        {b.priceTotal != null && <span className="font-bold text-slate-700">{yen(b.priceTotal)}</span>}
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
      {/* ★ 詳細も中央に出す（2026-09-19・カッキーさんの指示・受付フォームとそろえる） */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
      <aside className="pointer-events-auto max-h-[92vh] w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl">
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
            <dt className="font-bold text-slate-400">料金</dt>
            <dd className="font-bold text-slate-800">
              {yen(b.priceTotal)}{b.paymentMethod ? <span className="ml-1 text-[12px] font-normal text-slate-500">（{b.paymentMethod}）</span> : null}
            </dd>
            <dt className="font-bold text-slate-400">女子報酬</dt>
            <dd className="font-bold text-slate-800">{yen(b.payTotal)}</dd>
            {b.items.length > 0 && (
              <>
                <dt className="font-bold text-slate-400">内訳</dt>
                <dd className="text-[12px] text-slate-600">
                  {b.items.map((it, i) => (
                    <span key={i} className="mr-2 inline-block">
                      {it.name}{it.kind === 'discount' ? `（-${it.price.toLocaleString()}）` : `（${it.price.toLocaleString()}）`}
                    </span>
                  ))}
                  {b.priceAdjust !== 0 && <span className="mr-2 inline-block">料金補正 {b.priceAdjust > 0 ? '+' : ''}{b.priceAdjust.toLocaleString()}</span>}
                  {b.payAdjust !== 0 && <span className="mr-2 inline-block">報酬補正 {b.payAdjust > 0 ? '+' : ''}{b.payAdjust.toLocaleString()}</span>}
                </dd>
              </>
            )}
            <dt className="font-bold text-slate-400">電話</dt>
            <dd className="text-slate-800">{b.customerTel || '—'}</dd>
            <dt className="font-bold text-slate-400">状態</dt>
            <dd className="text-slate-800">
              {b.status === 'cancelled' ? (b.cancelBad ? '悪質キャンセル' : 'キャンセル') : b.status === 'new' ? '未確定（ネット予約）' : '確定'}
            </dd>
            {b.status !== 'cancelled' && (
              <>
                <dt className="font-bold text-slate-400">状況</dt>
                <dd>
                  <div className="flex flex-wrap gap-1">
                    {(['', 'address_sent', 'entered'] as CrmPlayStatus[]).map((ps) => {
                      const on = (b.playStatus || '') === ps;
                      const onCls = ps === 'entered' ? 'bg-yellow-300 text-slate-900 border-yellow-400' : ps === 'address_sent' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-600 text-white border-slate-600';
                      return (
                        <button
                          key={ps || 'none'}
                          type="button"
                          disabled={busy || on}
                          onClick={async () => {
                            setBusy(true); setErr('');
                            const r = await setCrmPlayStatus(salonId, b.id, ps);
                            setBusy(false);
                            if (!r.ok) { setErr(r.error); return; }
                            onChanged({ ...b, playStatus: ps });
                          }}
                          className={`border px-2 py-0.5 text-[12px] font-bold ${on ? onCls : 'border-slate-300 bg-white text-slate-600'}`}
                        >
                          {CRM_PLAY_LABEL[ps]}
                        </button>
                      );
                    })}
                  </div>
                </dd>
              </>
            )}
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
      </div>
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
  // 料金と報酬（第536便）
  selIds: number[];               // 料金表から選んだ項目
  keepItems: CrmBookingItem[];    // 料金表にもう無いが、この予約に残っている項目
  priceAdjust: string;
  payAdjust: string;
  paymentMethod: string;
};

/** 予約の項目 → 今の料金表と同じもの（選択）と、表に無いもの（残す）に分ける */
function splitItems(items: CrmBookingItem[], priceItems: CrmPriceItem[]): { selIds: number[]; keepItems: CrmBookingItem[] } {
  const selIds: number[] = [];
  const keepItems: CrmBookingItem[] = [];
  for (const it of items) {
    const p = priceItems.find((x) => x.id === it.priceItemId && x.kind === it.kind && x.name === it.name && x.minutes === it.minutes && x.price === it.price && x.pay === it.pay);
    if (p && !selIds.includes(p.id)) selIds.push(p.id);
    else keepItems.push(it);
  }
  return { selIds, keepItems };
}

const fieldCls = 'w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';
const labCls = 'mb-1 block text-[12px] font-bold text-slate-500';

function BookingForm({
  initial, salonId, baseMs, therapists, courses, priceItems, dayBookings, onClose, onSaved,
}: {
  initial: BookingFormState;
  salonId: number;
  baseMs: number;
  therapists: CrmScheduleTherapist[];
  courses: CrmScheduleData['courses'];
  priceItems: CrmPriceItem[];
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

  // ── 料金と報酬 ──
  const selItems: CrmBookingItem[] = f.selIds
    .map((id) => priceItems.find((p) => p.id === id))
    .filter((p): p is CrmPriceItem => !!p)
    .map((p) => ({ kind: p.kind, name: p.name, minutes: p.minutes, price: p.price, pay: p.pay, priceItemId: p.id }));
  const allItems = [...selItems, ...f.keepItems];
  const sums = sumCrmItems(allItems);
  const priceAdj = Math.round(Number(f.priceAdjust) || 0);
  const payAdj = Math.round(Number(f.payAdjust) || 0);
  const hasPricing = allItems.length > 0 || priceAdj !== 0 || payAdj !== 0;

  /** 項目を押した：コース・指名は入れ替え、他は付け外し。コース・延長を選んだら時間とコース名も合わせる */
  const togglePrice = (p: CrmPriceItem) => {
    setF((prev) => {
      let ids = prev.selIds;
      let keep = prev.keepItems;
      if (CRM_PRICE_SINGLE[p.kind]) {
        const others = priceItems.filter((x) => x.kind === p.kind).map((x) => x.id);
        const on = ids.includes(p.id);
        ids = ids.filter((id) => !others.includes(id));
        keep = keep.filter((k) => k.kind !== p.kind);
        if (!on) ids = [...ids, p.id];
      } else {
        ids = ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id];
      }
      const next = { ...prev, selIds: ids, keepItems: keep };
      const course = priceItems.find((x) => x.kind === 'course' && ids.includes(x.id));
      if (course) {
        const ext = priceItems.filter((x) => x.kind === 'extension' && ids.includes(x.id)).reduce((a, x) => a + x.minutes, 0)
          + keep.filter((k) => k.kind === 'extension').reduce((a, k) => a + k.minutes, 0);
        if (course.minutes > 0) next.courseMin = course.minutes + ext;
        next.courseName = course.name;
      }
      return next;
    });
  };

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

  const savePricing = (bookingId: string) =>
    setCrmBookingPricing({
      salonId,
      bookingId,
      priceItemIds: f.selIds,
      keepItems: f.keepItems,
      priceAdjust: priceAdj,
      payAdjust: payAdj,
      paymentMethod: f.paymentMethod,
    });

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
      if (!res.ok) { setBusy(false); setErr(res.error ?? '保存できませんでした'); return; }
      if (hasPricing || f.paymentMethod) {
        if (!res.bookingId) { setBusy(false); setErr('予約は入りましたが、料金を保存できませんでした（カードを押して「変更する」から入れてください）'); return; }
        const pr = await savePricing(res.bookingId);
        if (!pr.ok) { setBusy(false); setErr(`予約は入りましたが、料金を保存できませんでした：${pr.error}`); return; }
      }
      setBusy(false);
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
    if (!up.ok) { setBusy(false); setErr(up.error ?? '保存できませんでした'); return; }
    const pr = await savePricing(f.bookingId!);
    setBusy(false);
    if (!pr.ok) { setErr(`料金を保存できませんでした：${pr.error}`); return; }
    onSaved();
  };

  return (
    <>
      {/* ★ 受付フォームは画面の中央に出す（2026-09-19・カッキーさんの指示）。詳細パネルは右のまま。 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
      <aside className="pointer-events-auto flex max-h-[92vh] w-full max-w-[560px] flex-col bg-white shadow-2xl">
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

          {/* 料金と報酬（料金表から選ぶ） */}
          {priceItems.length > 0 ? (
            <div className="border border-indigo-200 bg-indigo-50/40 p-3">
              <p className="mb-2 text-[13px] font-black text-slate-700">料金（押して選ぶ）</p>
              {CRM_PRICE_KINDS.map((kind) => {
                const list = priceItems.filter((p) => p.kind === kind);
                const kept = f.keepItems.filter((k) => k.kind === kind);
                if (list.length === 0 && kept.length === 0) return null;
                return (
                  <div key={kind} className="mb-2">
                    <p className="mb-1 text-[11px] font-bold text-slate-500">{CRM_PRICE_KIND_LABEL[kind]}{CRM_PRICE_SINGLE[kind] ? '（1つ）' : ''}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((p) => {
                        const on = f.selIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePrice(p)}
                            className={`border px-2 py-1 text-[12px] font-bold ${on ? 'border-[#3f51b5] bg-[#3f51b5] text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                          >
                            {p.name}{p.minutes && kind !== 'discount' ? ` ${p.minutes}分` : ''}
                            <span className={on ? 'text-indigo-100' : 'text-slate-400'}> {kind === 'discount' ? '-' : ''}{p.price.toLocaleString()}</span>
                          </button>
                        );
                      })}
                      {kept.map((k, i) => (
                        <button
                          key={`keep-${i}`}
                          type="button"
                          title="料金表にもう無い項目です（押すと外します）"
                          onClick={() => setF((prev) => ({ ...prev, keepItems: prev.keepItems.filter((x) => x !== k) }))}
                          className="border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] font-bold text-amber-800"
                        >
                          {k.name} {k.kind === 'discount' ? '-' : ''}{k.price.toLocaleString()} ×
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className={labCls}>料金補正（±円）</label>
                  <input className={fieldCls} inputMode="numeric" value={f.priceAdjust} onChange={(e) => set('priceAdjust', e.target.value.replace(/[^0-9-]/g, ''))} placeholder="0" />
                </div>
                <div>
                  <label className={labCls}>報酬補正（±円）</label>
                  <input className={fieldCls} inputMode="numeric" value={f.payAdjust} onChange={(e) => set('payAdjust', e.target.value.replace(/[^0-9-]/g, ''))} placeholder="0" />
                </div>
                <div>
                  <label className={labCls}>支払い</label>
                  <select className={fieldCls} value={f.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                    <option value="">—</option>
                    {CRM_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-4 border-t border-indigo-200 pt-2 text-[15px] font-black">
                <span className="text-slate-800">料金 {hasPricing ? yen(sums.price + priceAdj) : '—'}</span>
                <span className="text-[#3f51b5]">女子報酬 {hasPricing ? yen(sums.pay + payAdj) : '—'}</span>
              </div>
            </div>
          ) : (
            <p className="border border-dashed border-slate-300 px-3 py-2 text-[12px] text-slate-500">
              料金表がまだありません。上の「料金設定」で作ると、ここで料金と女子報酬を選べるようになります。
            </p>
          )}

          {/* コース */}
          <div>
            <label className={labCls}>コース</label>
            {courses.length > 0 && !priceItems.some((p) => p.kind === 'course') && (
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
      </div>
    </>
  );
}

// ── 女子メモの編集 ─────────────────────────────────────
function MemoDialog({
  therapist, salonId, onClose, onSaved,
}: {
  therapist: CrmScheduleTherapist;
  salonId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(therapist.memo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    setErr('');
    const res = await saveCrmTherapistMemo(salonId, therapist.id, text);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="pointer-events-auto w-full max-w-[460px] bg-white shadow-2xl">
          <div className="flex items-center bg-amber-500 px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">女子メモ：{therapist.name}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          <div className="p-4">
            <p className="mb-2 text-[12px] leading-relaxed text-slate-500">
              お店の中だけのメモです（お客様・セラピスト本人には見えません）。日付に関係なく、この人にずっと残ります。
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              autoFocus
              placeholder={'例）交通費1000\n送迎（姪浜）\nLルームNG'}
              className="min-h-[160px] w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-amber-400 focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-slate-400">{text.length}/500</p>
            {err && <p className="mt-1 text-[13px] font-bold text-rose-600">{err}</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={save} className="flex-1 bg-amber-500 py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
                {busy ? '保存中…' : '保存する'}
              </button>
              <button type="button" disabled={busy} onClick={onClose} className="border border-slate-300 bg-white px-4 text-[14px] font-bold text-slate-600">
                やめる
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 報酬確定 ───────────────────────────────────────
function ConfirmDialog({
  therapist, salonId, date, baseMs, bookings, confirm, transport, onClose, onDone,
}: {
  /** 出勤情報の交通費（まだ確定していないときの手当の初期値・第550便） */
  transport: number;
  therapist: CrmScheduleTherapist;
  salonId: number;
  date: string;
  baseMs: number;
  bookings: CrmScheduleBooking[];
  confirm: CrmPayConfirm | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [allowance, setAllowance] = useState(confirm ? String(confirm.allowance || '') : transport ? String(transport) : '');
  const [note, setNote] = useState(confirm?.note ?? (transport ? `交通費${transport}` : ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mine = bookings
    .filter((b) => b.status !== 'cancelled' && inBusinessDay(Math.round((new Date(b.slotStartISO).getTime() - baseMs) / 60000)))
    .sort((a, b) => a.slotStartISO.localeCompare(b.slotStartISO));
  const pay = mine.reduce((a, b) => a + (b.payTotal ?? 0), 0);
  const al = Math.round(Number(allowance) || 0);
  const noPrice = mine.filter((b) => b.payTotal == null).length;

  const doConfirm = async () => {
    setBusy(true); setErr('');
    const r = await confirmCrmPay(salonId, therapist.id, date, al, note);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };
  const doUndo = async () => {
    setBusy(true); setErr('');
    const r = await unconfirmCrmPay(salonId, therapist.id, date);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="pointer-events-auto max-h-[92vh] w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl">
          <div className="flex items-center bg-emerald-600 px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">報酬確定：{therapist.name}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          <div className="space-y-3 p-4">
            {confirm && (
              <p className="bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-800">
                確定済み：{confirm.bookingCount}本・報酬 {yen(confirm.payTotal)}{confirm.allowance ? `＋手当 ${yen(confirm.allowance)}` : ''} ＝ {yen(confirm.payTotal + confirm.allowance)}
              </p>
            )}
            <div>
              <p className="mb-1 text-[12px] font-bold text-slate-500">この日の予約（{mine.length}本）</p>
              {mine.length === 0 ? (
                <p className="text-[13px] text-slate-400">予約はありません</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 text-[13px]">
                  {mine.map((b) => (
                    <li key={b.id} className="flex gap-2 px-2 py-1.5">
                      <span className="font-bold">{hm(b.slotStartISO)}</span>
                      <span className="truncate">{b.customer?.name || b.customerName}</span>
                      <span className="truncate text-slate-500">{b.courseName}</span>
                      <span className={`ml-auto font-bold ${b.payTotal == null ? 'text-amber-600' : ''}`}>{b.payTotal == null ? '料金未入力' : yen(b.payTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {noPrice > 0 && <p className="mt-1 text-[12px] font-bold text-amber-700">料金・報酬がまだ入っていない予約が {noPrice} 本あります（0円で数えます）</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labCls}>手当・交通費など（±円）</label>
                <input className={fieldCls} inputMode="numeric" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^0-9-]/g, ''))} placeholder="0" />
              </div>
              <div>
                <label className={labCls}>一言</label>
                <input className={fieldCls} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="例）交通費1000" />
              </div>
            </div>
            <p className="border-t border-slate-200 pt-2 text-[17px] font-black text-slate-800">
              お渡しする報酬 {yen(pay + al)}
              <span className="ml-2 text-[12px] font-bold text-slate-500">（予約の報酬 {yen(pay)}{al ? ` ＋ 手当 ${yen(al)}` : ''}）</span>
            </p>
            {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={doConfirm} className="flex-1 bg-emerald-600 py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
                {confirm ? 'いまの内容で確定し直す' : 'この内容で確定する'}
              </button>
              {confirm && (
                sure ? (
                  <button type="button" disabled={busy} onClick={doUndo} className="bg-rose-600 px-3 text-[13px] font-bold text-white">本当に取り消す</button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setSure(true)} className="border border-slate-300 bg-white px-3 text-[13px] font-bold text-slate-600">確定を取り消す</button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 締め作業（日報） ─────────────────────────────────
function CloseDialog({
  salonId, date, onClose, onDone,
}: {
  salonId: number;
  date: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [sum, setSum] = useState<CrmDaySummary | null>(null);
  const [expense, setExpense] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => {
    let alive = true;
    getCrmDaySummary(salonId, date).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setSum(r.summary);
      if (r.summary.report) {
        setExpense(r.summary.report.expense ? String(r.summary.report.expense) : '');
        setMemo(r.summary.report.memo);
      }
    });
    return () => { alive = false; };
  }, [salonId, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ex = Math.max(0, Math.round(Number(expense) || 0));
  const doClose = async () => {
    setBusy(true); setErr('');
    const r = await closeCrmDay(salonId, date, ex, memo);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };
  const doReopen = async () => {
    setBusy(true); setErr('');
    const r = await reopenCrmDay(salonId, date);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };

  const rep = sum?.report ?? null;
  const changed = rep && sum && (rep.sales !== sum.sales || rep.pay !== sum.pay || rep.bookingCount !== sum.bookingCount);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="pointer-events-auto max-h-[92vh] w-full max-w-[560px] overflow-y-auto bg-white shadow-2xl">
          <div className="flex items-center bg-[#1e2a5a] px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">締め作業（日報）：{dateLabel(date)}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          {!sum ? (
            <p className="p-6 text-center text-[14px] text-slate-400">{err || '集計しています…'}</p>
          ) : (
            <div className="space-y-3 p-4">
              {rep && (
                <p className={`px-3 py-2 text-[13px] font-bold ${changed ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                  {changed ? '⚠ 締めたあとに予約・報酬が変わっています。下の「締め直す」で今の数字に直せます。' : '✓ この日は締め済みです。'}
                </p>
              )}
              {sum.unconfirmed.length > 0 && (
                <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
                  報酬をまだ確定していない人：{sum.unconfirmed.join('・')}
                </p>
              )}
              {sum.freeUnassigned > 0 && (
                <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
                  担当が決まっていない予約が {sum.freeUnassigned} 本あります
                </p>
              )}
              <div className="grid grid-cols-3 gap-px bg-slate-200 text-center">
                {[
                  ['本数', `${sum.bookingCount}本`],
                  ['キャンセル', `${sum.cancelCount}本`],
                  ['出勤', `${sum.workingCount}人`],
                  ['売上', yen(sum.sales)],
                  ['うち現金', yen(sum.cashSales)],
                  ['女子報酬', yen(sum.pay)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white py-2">
                    <p className="text-[11px] font-bold text-slate-400">{k}</p>
                    <p className="text-[16px] font-black text-slate-800">{v}</p>
                  </div>
                ))}
              </div>
              {sum.allowance !== 0 && <p className="text-[12px] text-slate-500">女子報酬には、確定のときの手当 {yen(sum.allowance)} を含みます</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labCls}>経費（円）</label>
                  <input className={fieldCls} inputMode="numeric" value={expense} onChange={(e) => setExpense(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-[12px] font-bold text-slate-500">利益（売上 − 報酬 − 経費）</p>
                  <p className={`text-[20px] font-black ${sum.sales - sum.pay - ex < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{yen(sum.sales - sum.pay - ex)}</p>
                </div>
              </div>
              <div>
                <label className={labCls}>メモ</label>
                <textarea className={`${fieldCls} min-h-[64px]`} maxLength={1000} value={memo} onChange={(e) => setMemo(e.target.value)} />
              </div>
              {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={doClose} className="flex-1 bg-[#1e2a5a] py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
                  {rep ? 'いまの数字で締め直す' : 'この内容で締める'}
                </button>
                {rep && (
                  sure ? (
                    <button type="button" disabled={busy} onClick={doReopen} className="bg-rose-600 px-3 text-[13px] font-bold text-white">本当に取り消す</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => setSure(true)} className="border border-slate-300 bg-white px-3 text-[13px] font-bold text-slate-600">締めを取り消す</button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── 出勤情報（名前を押す・第550便）────────────────────
function WorkDayDialog({
  therapist, salonId, date, rooms, endType, initial, onClose, onSaved, onConfirm,
}: {
  therapist: CrmScheduleTherapist;
  salonId: number;
  date: string;
  rooms: string[];
  endType: CrmEndType;
  initial: CrmWorkDay;
  onClose: () => void;
  onSaved: () => void;
  onConfirm: () => void;
}) {
  const [wd, setWd] = useState<CrmWorkDay>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof CrmWorkDay>(k: K, v: CrmWorkDay[K]) => setWd((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true); setErr('');
    const r = await saveCrmWorkDay(salonId, therapist.id, date, wd);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved();
  };

  const roomOptions = wd.room && !rooms.includes(wd.room) ? [...rooms, wd.room] : rooms;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="pointer-events-auto flex max-h-[92vh] w-full max-w-[640px] flex-col bg-white shadow-2xl">
          <div className="flex items-center bg-[#3f51b5] px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">出勤情報：{therapist.name}</span>
            <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
              <span className="font-bold text-slate-500">{dateLabel(date)}</span>
              <span className="font-bold text-slate-800">
                出勤 {therapist.schedules.length > 0 ? therapist.schedules.map((w) => `${w.start}-${w.end}`).join(' / ') : 'なし'}
              </span>
              <span className={`border px-1.5 text-[12px] font-bold ${endType === 'accept' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-pink-400 bg-white text-pink-600'}`}>
                {CRM_END_LABEL[endType]}
              </span>
            </div>
            <p className="-mt-2 text-[12px] text-slate-400">出勤の時刻は、マイページの「出勤」で変えてください（サイトと媒体に出る出勤と同じものです）。</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labCls}>休憩開始</label>
                <TimePick value={wd.breakStartMin} onChange={(v) => set('breakStartMin', v)} />
              </div>
              <div>
                <label className={labCls}>休憩終了</label>
                <TimePick value={wd.breakEndMin} onChange={(v) => set('breakEndMin', v)} />
              </div>
            </div>
            <div>
              <label className={labCls}>休憩メモ</label>
              <input className={fieldCls} value={wd.breakMemo} maxLength={100} onChange={(e) => set('breakMemo', e.target.value)} placeholder="例）親と電話" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labCls}>待機場所</label>
                <select className={fieldCls} value={wd.room} onChange={(e) => set('room', e.target.value)}>
                  <option value="">--</option>
                  {roomOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                {rooms.length === 0 && <p className="mt-1 text-[11px] text-slate-400">部屋の一覧は「設定」タブで作れます</p>}
              </div>
              <div>
                <label className={labCls}>遅刻・当欠・休ませた</label>
                <select className={fieldCls} value={wd.attendance} onChange={(e) => set('attendance', e.target.value as CrmAttendance)}>
                  {CRM_ATTENDANCE.map((a) => <option key={a || 'none'} value={a}>{CRM_ATTENDANCE_LABEL[a]}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labCls}>交通費（円）</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${fieldCls} max-w-[160px]`}
                  inputMode="numeric"
                  value={wd.transport ? String(wd.transport) : ''}
                  onChange={(e) => set('transport', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                  placeholder="0"
                />
                {[1000, 2000].map((v) => (
                  <button key={v} type="button" onClick={() => set('transport', v)} className="border border-slate-300 bg-white px-2 py-1 text-[12px] font-bold text-slate-600">
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">報酬確定のときの「手当・交通費」に、はじめから入ります。</p>
            </div>
            {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
            <button type="button" disabled={busy} onClick={onConfirm} className="text-[13px] font-bold text-emerald-700 underline">
              報酬確定を行う
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="ml-auto border border-slate-300 bg-white px-4 py-2 text-[14px] font-bold text-slate-600">
              閉じる
            </button>
            <button type="button" disabled={busy} onClick={save} className="bg-emerald-600 px-5 py-2 text-[14px] font-bold text-white disabled:opacity-50">
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// 休憩の時・分（'' ＝ なし）
const TP_HOURS: number[] = Array.from({ length: 25 }, (_, i) => i + 6);
const TP_MINS: number[] = Array.from({ length: 12 }, (_, i) => i * 5);
function TimePick({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1">
      <select
        className={fieldCls}
        value={value == null ? '' : Math.floor(value / 60)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value) * 60 + (value == null ? 0 : value % 60))}
      >
        <option value="">--</option>
        {TP_HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </select>
      <select
        className={fieldCls}
        disabled={value == null}
        value={value == null ? 0 : value % 60}
        onChange={(e) => onChange(Math.floor((value ?? 0) / 60) * 60 + Number(e.target.value))}
      >
        {TP_MINS.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>)}
      </select>
    </div>
  );
}
