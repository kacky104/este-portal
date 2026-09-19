'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCrmSchedule, setCrmCancelBad } from '@/app/actions/crm';
import {
  CRM_CATEGORY_CLASS,
  CRM_CATEGORY_LABEL,
  type CrmScheduleBooking,
  type CrmScheduleData,
  type CrmScheduleTherapist,
} from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from './CrmShell';

// フクエスCRM「スケジュール」（第530便・2026-09-19）。★ 風俗CTIv2 の本日スケジュールにならった画面。
//
// ★ 行＝その日に出勤しているセラピスト（＋予約だけ残っている人）。上にフリー客の行（予約があるときだけ）。
// ★ 横＝時間。ピンクの帯が出勤、カードが予約。★ カードにお客様の分類・要注意・女子NG を重ねる。
// ★ カードを押すと右にお客様と予約の詳細（台帳へのリンク・悪質キャンセルの付け外し）。
// ★ 出勤と予約は予約ボード（無料）と同じデータ。★ 予約の入力・移動は今は予約ボードで行う（この画面は見る専用）。
// ★ 日付は【営業日】（朝6時区切り）。★ 表示は 6:00〜翌7:00 の中で、予定がある範囲（最低 10時〜翌5時）。

const PX_PER_MIN = 1.6;       // 1時間＝96px
const NAME_W = 150;
const ROW_H = 66;
const DAY_START_MIN = 6 * 60;  // 営業日の始まり（6:00）
const WINDOW_END_MIN = 31 * 60; // 予約ボードの窓の終わり（翌7:00）
const DEFAULT_START_MIN = 10 * 60;
const DEFAULT_END_MIN = 29 * 60; // 翌5:00
const REFRESH_MS = 60_000;

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

  // 60秒ごとに読み直す（詳細を開いている間は止める＝見ている最中に動かさない）
  useEffect(() => {
    if (picked) return;
    const t = setInterval(() => setTick((v) => v + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, [picked]);

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
    const free = visibleBookings.filter((b) => b.therapistId == null);
    if (free.length > 0) rows.push({ key: 'free', therapist: null, bookings: free });

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
        <Link href="/mypage" target="_blank" className="ml-auto text-[12px] font-bold text-pink-600 underline">
          予約の入力・変更は予約ボードで
        </Link>
      </div>

      {err && <p className="mb-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">{err}</p>}
      {!data && !err && <p className="p-6 text-center text-[14px] text-slate-400">読み込み中です…</p>}

      {view && (
        view.rows.length === 0 ? (
          <p className="border border-slate-200 bg-white p-8 text-center text-[14px] text-slate-400">この日の出勤・予約はありません</p>
        ) : (
          <Grid
            rows={view.rows}
            startMin={view.startMin}
            endMin={view.endMin}
            baseMs={baseMs}
            nowMs={isToday ? nowMs : null}
            pickedId={picked?.id ?? null}
            onPick={setPicked}
          />
        )
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
        />
      )}
    </div>
  );
}

function Grid({
  rows, startMin, endMin, baseMs, nowMs, pickedId, onPick,
}: {
  rows: Row[];
  startMin: number;
  endMin: number;
  baseMs: number;
  nowMs: number | null;
  pickedId: string | null;
  onPick: (b: CrmScheduleBooking) => void;
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

            {/* 時間の中身 */}
            <div className="relative flex-none" style={{ width }}>
              {/* 1時間ごとの線 */}
              {hours.map((h) => (
                <div key={h} className="absolute top-0 bottom-0 border-r border-slate-100" style={{ left: (h * 60 - startMin + 60) * PX_PER_MIN - 1 }} />
              ))}
              {/* 出勤の帯 */}
              {r.therapist?.schedules.map((w, i) => {
                const s = Math.round((new Date(w.startISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(w.endISO).getTime() - baseMs) / 60000);
                return (
                  <div key={i} className="absolute top-0 bottom-0 bg-pink-100/70" style={{ left: x(s), width: Math.max(0, x(e) - x(s)) }}>
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
      onClick={onPick}
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
  booking: b, therapistName, salonId, adminSalonQuery, onClose, onChanged,
}: {
  booking: CrmScheduleBooking;
  therapistName: string;
  salonId: number;
  adminSalonQuery: string;
  onClose: () => void;
  onChanged: (b: CrmScheduleBooking) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
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
          {b.status === 'cancelled' && (
            <button
              type="button"
              disabled={busy}
              onClick={toggleBad}
              className="mt-4 border border-rose-300 bg-white px-3 py-1.5 text-[13px] font-bold text-rose-600 disabled:opacity-50"
            >
              {b.cancelBad ? '悪質を外す' : '悪質キャンセルにする'}
            </button>
          )}
          {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
          <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
            時間・担当の変更やキャンセルは、今は予約ボード（マイページ）で行ってください。
          </p>
        </section>
      </aside>
    </>
  );
}
