'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBookingBoardData,
  createManualBooking,
  moveBooking,
  updateBookingStatus,
  deleteBooking,
  type BookingBoardData,
  type BoardBooking,
  type BoardTherapist,
} from '@/app/actions/booking';
import { callbackPrefLabel } from '@/app/lib/booking/callbackPref';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { useToast } from '@/app/components/useToast';

// /mypage「予約ボード」タブ本体（2026-08-14 新設）。
// 1日タイムライン：縦＝セラピスト（行）・横＝時間（同日中に縦横を反転。当初は縦＝時間だった）。
// 当日（営業日・朝6時切替）を初期表示し前後に日付送り。
// できること：予約ブロックタップ→詳細パネル（確定/キャンセル/新規に戻す/削除/時間・担当の変更）、
//             出勤帯の空き部分タップ→電話予約の手入力（status='confirmed' で登録）。
// 配色は mypage 既存トーン（白カード・ピンク基調）。ステータス色は一覧と同じ
// （new=ピンク / confirmed=エメラルド / cancelled=グレー薄表示）。

// ── 寸法定数 ──
const PX_PER_MIN = 1.2; // 横方向 1分=1.2px（1時間 = 72px）
const ROW_H = 64;       // セラピスト行の高さ(px)
const NAME_W = 92;      // 左の名前列の幅(px・sticky)
const AXIS_H = 22;      // 上の時間軸の高さ(px)
const STEP_MIN = 15;    // 枠の刻み（ネット予約と同じ15分）

// 検証フィクスチャ用の差し替え口。省略時は本物のサーバーアクションを使う。
export type BoardIO = {
  fetchBoard: typeof getBookingBoardData;
  createManual: typeof createManualBooking;
  move: typeof moveBooking;
  setStatus: typeof updateBookingStatus;
  remove: typeof deleteBooking;
};
const defaultIO: BoardIO = {
  fetchBoard: getBookingBoardData,
  createManual: createManualBooking,
  move: moveBooking,
  setStatus: updateBookingStatus,
  remove: deleteBooking,
};

// ── 日付・時刻ヘルパー（すべて JST 基準） ──

// "YYYY-MM-DD" を days 日ずらす（UTC正午基準で月跨ぎ安全）。
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}

// ボード日の JST 0:00 を epoch ms で（縦位置計算の原点）。
function anchorMsOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00+09:00`).getTime();
}

function jstHHMM(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

function jstDateStr(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(ms));
}

// ボード日と違う日（＝深夜帯）は「翌」を付ける。
function timeLabel(ms: number, boardDate: string): string {
  const prefix = jstDateStr(ms) === boardDate ? '' : '翌';
  return `${prefix}${jstHHMM(ms)}`;
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const md = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(d);
  const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
  return `${md}(${wd})`;
}

// 出勤帯の表示（"12:00〜翌2:00"）。end<=start は翌日跨ぎ。
function shiftLabel(start: string, end: string): string {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  return `${start}〜${toMin(end) <= toMin(start) ? '翌' : ''}${end}`;
}

function hourLabel(min: number): string {
  const h = Math.floor(min / 60);
  return h >= 24 ? `翌${h - 24}時` : `${h}時`;
}

// ステータス表示（一覧と同じ色対応）。
function statusChip(status: string): { label: string; cls: string } {
  switch (status) {
    case 'new': return { label: '新規リクエスト', cls: 'bg-pink-100 text-pink-700' };
    case 'confirmed': return { label: '確定', cls: 'bg-emerald-100 text-emerald-700' };
    case 'cancelled': return { label: 'キャンセル', cls: 'bg-slate-100 text-slate-500' };
    default: return { label: status, cls: 'bg-slate-100 text-slate-500' };
  }
}

// ブロックの見た目（ボード上）。
function blockCls(status: string): string {
  switch (status) {
    case 'new': return 'bg-pink-100 border-pink-300 text-pink-800 z-10';
    case 'confirmed': return 'bg-emerald-100 border-emerald-300 text-emerald-800 z-10';
    default: return 'bg-slate-100 border-slate-200 text-slate-400 opacity-70 z-[5]'; // cancelled ほか
  }
}

// 時間選択肢：出勤帯を15分刻みで列挙し、既存予約（cancelled以外・自分以外）と重なる枠に taken を立てる。
function slotTimeOptions(params: {
  therapist: BoardTherapist | null | undefined;
  durationMin: number;
  bookings: BoardBooking[];
  boardDate: string;
  excludeId?: string;
}): { iso: string; label: string; taken: boolean }[] {
  const { therapist, durationMin, bookings, boardDate, excludeId } = params;
  if (!therapist?.schedule || durationMin <= 0) return [];
  const startMs = new Date(therapist.schedule.startISO).getTime();
  const endMs = new Date(therapist.schedule.endISO).getTime();
  const durMs = durationMin * 60 * 1000;
  const out: { iso: string; label: string; taken: boolean }[] = [];
  for (let t = startMs; t + durMs <= endMs; t += STEP_MIN * 60 * 1000) {
    const e = t + durMs;
    const taken = bookings.some(
      (b) =>
        b.therapistId === therapist.id &&
        b.status !== 'cancelled' &&
        b.id !== excludeId &&
        new Date(b.slotStart).getTime() < e &&
        new Date(b.slotEnd).getTime() > t,
    );
    out.push({ iso: new Date(t).toISOString(), label: timeLabel(t, boardDate), taken });
  }
  return out;
}

const DURATION_OPTIONS = Array.from({ length: 23 }, (_, i) => 30 + i * 15); // 30〜360分

type AddForm = {
  therapistId: number;
  startISO: string;
  durationMin: number;
  courseName: string;
  customerName: string;
  customerTel: string;
  note: string;
};

type MoveForm = { date: string; therapistId: number; startISO: string };

export function BookingBoard({ salonId, active, io = defaultIO }: {
  salonId: number;
  active: boolean;
  io?: BoardIO;
}) {
  const { toast, showToast } = useToast();
  const [date, setDate] = useState(() => getBusinessDateJST(0));
  const [data, setData] = useState<BookingBoardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  // 詳細パネル・移動フォーム・手入力フォーム
  const [detail, setDetail] = useState<BoardBooking | null>(null);
  const [moveForm, setMoveForm] = useState<MoveForm | null>(null);
  const [moveData, setMoveData] = useState<BookingBoardData | null>(null); // 移動先日のボードデータ
  const [moveLoading, setMoveLoading] = useState(false);
  const [addForm, setAddForm] = useState<AddForm | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setLoadError('');
    const res = await io.fetchBoard(salonId, d);
    setLoading(false);
    if (!res.ok) { setLoadError(res.error); return; }
    setData(res.data);
  }, [io, salonId]);

  // タブがアクティブになったとき＆日付が変わったときに読み込む（非アクティブ中は読まない）。
  useEffect(() => {
    if (active) void load(date);
  }, [active, date, load]);

  const anchorMs = useMemo(() => anchorMsOf(date), [date]);
  const minOf = useCallback((iso: string) => (new Date(iso).getTime() - anchorMs) / 60000, [anchorMs]);

  // ボードの縦レンジ（JST 0:00 からの分）。出勤枠と予約の双方を含み、時間単位に丸める。
  const { boardStart, boardEnd } = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const t of data?.therapists ?? []) {
      if (!t.schedule) continue;
      lo = Math.min(lo, minOf(t.schedule.startISO));
      hi = Math.max(hi, minOf(t.schedule.endISO));
    }
    for (const b of data?.bookings ?? []) {
      lo = Math.min(lo, minOf(b.slotStart));
      hi = Math.max(hi, minOf(b.slotEnd));
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 600; hi = 1320; } // 出勤なし：10〜22時
    lo = Math.max(0, Math.floor(lo / 60) * 60);
    hi = Math.min(1800, Math.ceil(hi / 60) * 60);
    if (hi <= lo) hi = lo + 60;
    return { boardStart: lo, boardEnd: hi };
  }, [data, minOf]);

  const boardW = (boardEnd - boardStart) * PX_PER_MIN; // タイムライン部の幅(px)
  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let m = boardStart; m <= boardEnd; m += 60) arr.push(m);
    return arr;
  }, [boardStart, boardEnd]);

  const isToday = date === getBusinessDateJST(0);
  const nowMin = (Date.now() - anchorMs) / 60000;
  const showNowLine = isToday && nowMin > boardStart && nowMin < boardEnd;

  // 当日は現在時刻が画面の左1/3あたりに来るよう初期スクロールする（横＝時間軸のため）。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!data || !scrollRef.current) return;
    if (!showNowLine) { scrollRef.current.scrollLeft = 0; return; }
    const target = (nowMin - boardStart) * PX_PER_MIN - (scrollRef.current.clientWidth - NAME_W) / 3;
    scrollRef.current.scrollLeft = Math.max(0, target);
    // data（＝日付切替・再読込）のたびに位置を取り直す。nowMin は毎レンダー変わるため依存に入れない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const activeCount = (data?.bookings ?? []).filter((b) => b.status !== 'cancelled').length;
  const scheduled = (data?.therapists ?? []).filter((t) => t.schedule);

  // ── 操作 ──

  const reload = () => void load(date);

  const handleStatus = async (bookingId: string, next: 'new' | 'confirmed' | 'cancelled') => {
    setBusy(true);
    const res = await io.setStatus(bookingId, next);
    setBusy(false);
    if (!res.ok) { showToast(res.error ?? 'ステータス変更に失敗しました'); return; }
    showToast(next === 'confirmed' ? '予約を確定にしました' : next === 'cancelled' ? '予約をキャンセルにしました' : '予約を新規に戻しました');
    setDetail(null);
    reload();
  };

  const handleDelete = async (bookingId: string) => {
    if (!window.confirm('この予約を削除しますか？\nこの操作は取り消せません。')) return;
    setBusy(true);
    const res = await io.remove(bookingId);
    setBusy(false);
    if (!res.ok) { showToast(res.error ?? '削除に失敗しました'); return; }
    showToast('予約を削除しました');
    setDetail(null);
    reload();
  };

  // 移動フォームを開く（初期値＝現在の担当・時刻・表示中の日付）。
  const openMove = (b: BoardBooking) => {
    setMoveForm({ date, therapistId: b.therapistId, startISO: b.slotStart });
    setMoveData(data);
  };

  // 移動先の日付変更→その日のボードデータを取り直して選択肢を作る。
  const handleMoveDateChange = async (d: string) => {
    if (!moveForm) return;
    setMoveForm({ ...moveForm, date: d, startISO: '' });
    if (d === date && data) { setMoveData(data); return; }
    setMoveLoading(true);
    const res = await io.fetchBoard(salonId, d);
    setMoveLoading(false);
    if (!res.ok) { showToast(res.error); setMoveData(null); return; }
    setMoveData(res.data);
  };

  const handleMoveSubmit = async () => {
    if (!detail || !moveForm || !moveForm.startISO) return;
    setBusy(true);
    const res = await io.move(detail.id, moveForm.therapistId, moveForm.startISO);
    setBusy(false);
    if (!res.ok) { showToast(res.error ?? '移動に失敗しました'); return; }
    showToast('予約を移動しました');
    setMoveForm(null);
    setDetail(null);
    reload();
  };

  // 空き部分タップ→手入力フォーム（クリック位置を15分に丸めて初期時刻に）。
  const openAdd = (t: BoardTherapist, clickMin: number) => {
    if (!t.schedule) return;
    const schedStart = minOf(t.schedule.startISO);
    const schedEnd = minOf(t.schedule.endISO);
    let m = schedStart + Math.floor((clickMin - schedStart) / STEP_MIN) * STEP_MIN;
    m = Math.max(schedStart, Math.min(m, schedEnd - STEP_MIN));
    const firstCourse = data?.courses[0];
    setAddForm({
      therapistId: t.id,
      startISO: new Date(anchorMs + m * 60000).toISOString(),
      durationMin: firstCourse?.durationMin ?? 60,
      courseName: firstCourse?.name ?? '',
      customerName: '',
      customerTel: '',
      note: '',
    });
  };

  const handleAddSubmit = async () => {
    if (!addForm) return;
    if (!addForm.customerName.trim()) { showToast('お客様名を入力してください'); return; }
    if (!addForm.startISO) { showToast('開始時刻を選択してください'); return; }
    setBusy(true);
    const res = await io.createManual({
      salonId,
      therapistId: addForm.therapistId,
      slotStartISO: addForm.startISO,
      durationMin: addForm.durationMin,
      courseName: addForm.courseName,
      customerName: addForm.customerName,
      customerTel: addForm.customerTel,
      note: addForm.note,
    });
    setBusy(false);
    if (!res.ok) { showToast(res.error ?? '登録に失敗しました'); return; }
    showToast('電話予約を追加しました');
    setAddForm(null);
    reload();
  };

  // ── 入力部品の共通クラス ──
  const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
  const btnBase = 'text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50';

  // 手入力フォームの時間選択肢（担当・所要時間に追従）。
  const addTherapist = addForm ? scheduled.find((t) => t.id === addForm.therapistId) ?? null : null;
  const addOptions = addForm
    ? slotTimeOptions({ therapist: addTherapist, durationMin: addForm.durationMin, bookings: data?.bookings ?? [], boardDate: date })
    : [];

  // 移動フォームの選択肢（移動先日のデータから）。
  const moveScheduled = (moveData?.therapists ?? []).filter((t) => t.schedule);
  const moveTherapist = moveForm ? moveScheduled.find((t) => t.id === moveForm.therapistId) ?? null : null;
  const moveOptions = moveForm && detail
    ? slotTimeOptions({
        therapist: moveTherapist,
        durationMin: detail.courseMin,
        bookings: moveData?.bookings ?? [],
        boardDate: moveForm.date,
        excludeId: detail.id,
      })
    : [];

  return (
    <div className="space-y-4" data-testid="booking-board">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3">
        {/* ── 日付ナビ ── */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="前の日"
              className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold">‹</button>
            <span className="text-sm font-black text-slate-700 min-w-[72px] text-center" data-testid="board-date">
              {formatDateHeading(date)}
            </span>
            <button type="button" onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="次の日"
              className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold">›</button>
            {!isToday && (
              <button type="button" onClick={() => setDate(getBusinessDateJST(0))}
                className={`${btnBase} border-pink-300 text-pink-600 hover:bg-pink-50 ml-1`}>今日</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">{activeCount}件</span>
            <button type="button" onClick={reload} disabled={loading}
              className={`${btnBase} border-slate-200 text-slate-500 hover:bg-slate-50`}>再読み込み</button>
          </div>
        </div>

        {/* 凡例 */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-pink-100 border border-pink-300 inline-block" />新規</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" />確定</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200 inline-block" />キャンセル</span>
          <span>空き部分をタップすると電話予約を追加できます</span>
        </div>

        {/* ── 本体 ── */}
        {loadError ? (
          <p className="text-xs text-rose-600">読み込みに失敗しました：{loadError}</p>
        ) : loading && !data ? (
          <p className="text-xs text-slate-400 py-8 text-center">読み込み中...</p>
        ) : !data || data.therapists.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">この日は出勤予定がありません。<br />出勤タブでシフトを登録するとボードに表示されます。</p>
        ) : (
          <div ref={scrollRef} className="overflow-x-auto [contain:inline-size]">
            {/* ↑ [contain:inline-size]：body が flex flex-col のため、ボードの min-content 幅
                （名前列＋時間幅）がページ全体を押し広げてしまう。inline-size 封じ込めで
                「幅の計算上は空」とみなさせ、はみ出し分はこの div の横スクロールに収める。 */}
            <div style={{ minWidth: NAME_W + boardW }}>
              {/* 時間軸（上） */}
              <div className="flex">
                <div className="sticky left-0 z-20 bg-white flex-none" style={{ width: NAME_W, height: AXIS_H }} />
                <div className="relative flex-none" style={{ width: boardW, height: AXIS_H }}>
                  {hours.map((m) => (
                    <div key={m} className="absolute bottom-0.5 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap"
                      style={{ left: (m - boardStart) * PX_PER_MIN }}>
                      {hourLabel(m)}
                    </div>
                  ))}
                </div>
              </div>

              {/* セラピスト行 */}
              {data.therapists.map((t) => {
                const sched = t.schedule;
                const leftMin = sched ? Math.max(boardStart, minOf(sched.startISO)) : 0;
                const rightMin = sched ? Math.min(boardEnd, minOf(sched.endISO)) : 0;
                const rowBookings = data.bookings.filter((b) => b.therapistId === t.id);
                return (
                  <div key={t.id} className="flex border-t border-slate-100" data-testid={`board-col-${t.id}`}>
                    {/* 名前列（左・sticky） */}
                    <div className="sticky left-0 z-20 bg-white flex-none px-1.5 flex flex-col justify-center text-center border-r border-slate-100"
                      style={{ width: NAME_W, height: ROW_H }}>
                      <p className="text-xs font-bold text-slate-700 truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{sched ? shiftLabel(sched.start, sched.end) : '出勤なし'}</p>
                    </div>
                    {/* タイムライン（右） */}
                    <div className="relative bg-slate-50/80 flex-none" style={{ width: boardW, height: ROW_H }}>
                      {/* 時間罫線（縦） */}
                      {hours.map((m) => (
                        <div key={m} className="absolute inset-y-0 border-l border-slate-100"
                          style={{ left: (m - boardStart) * PX_PER_MIN }} />
                      ))}
                      {/* 出勤帯（白地・タップで手入力） */}
                      {sched && rightMin > leftMin && (
                        <div
                          className="absolute inset-y-0 bg-white border-y border-slate-100 cursor-pointer"
                          style={{ left: (leftMin - boardStart) * PX_PER_MIN, width: (rightMin - leftMin) * PX_PER_MIN }}
                          title="タップして電話予約を追加"
                          data-testid={`board-band-${t.id}`}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickMin = leftMin + (e.clientX - rect.left) / PX_PER_MIN;
                            openAdd(t, clickMin);
                          }}
                        />
                      )}
                      {/* 予約ブロック */}
                      {rowBookings.map((b) => {
                        const s = Math.max(boardStart, minOf(b.slotStart));
                        const e = Math.min(boardEnd, minOf(b.slotEnd));
                        if (e <= s) return null;
                        const w = (e - s) * PX_PER_MIN;
                        const sLabel = timeLabel(new Date(b.slotStart).getTime(), date);
                        const eLabel = timeLabel(new Date(b.slotEnd).getTime(), date);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setDetail(b)}
                            data-testid={`board-booking-${b.id}`}
                            className={`absolute inset-y-0.5 rounded-lg border px-1.5 py-0.5 text-left overflow-hidden ${blockCls(b.status)}`}
                            style={{ left: (s - boardStart) * PX_PER_MIN, width: Math.max(w, 18) }}
                          >
                            {/* 幅が狭いブロックは開始時刻のみ表示 */}
                            <p className="text-[10px] font-bold leading-tight truncate">
                              {w >= 56 ? `${sLabel}〜${eLabel}` : sLabel}
                            </p>
                            <p className="text-[10px] leading-tight truncate">{b.customerName} 様</p>
                            <p className="text-[9px] leading-tight truncate opacity-80">{b.courseName}（{b.courseMin}分）</p>
                          </button>
                        );
                      })}
                      {/* 現在時刻ライン（当日のみ・縦）。z は名前列(z-20)より下・予約ブロック(z-10)より上。 */}
                      {showNowLine && (
                        <div className="absolute inset-y-0 z-[15] pointer-events-none" style={{ left: (nowMin - boardStart) * PX_PER_MIN }}>
                          <div className="w-px h-full bg-rose-400" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 詳細パネル ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setDetail(null); setMoveForm(null); }} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-3" data-testid="board-detail">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-700">予約の詳細</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusChip(detail.status).cls}`}>
                {statusChip(detail.status).label}
              </span>
            </div>
            <div className="space-y-1 text-xs text-slate-600">
              <p><span className="text-slate-400">日時：</span>
                {formatDateHeading(jstDateStr(new Date(detail.slotStart).getTime() - 6 * 3600 * 1000))/* 営業日表記（6時前は前日扱い） */}
                {' '}{jstHHMM(new Date(detail.slotStart).getTime())}〜{jstHHMM(new Date(detail.slotEnd).getTime())}
              </p>
              <p><span className="text-slate-400">担当：</span>{detail.therapistName}</p>
              <p><span className="text-slate-400">コース：</span>{detail.courseName}（{detail.courseMin}分）</p>
              <p><span className="text-slate-400">お客様：</span>{detail.customerName} 様</p>
              <p><span className="text-slate-400">電話：</span>
                {detail.customerTel
                  ? <a href={`tel:${detail.customerTel}`} className="text-pink-600 underline">{detail.customerTel}</a>
                  : <span className="text-slate-400">未登録</span>}
              </p>
              <p><span className="text-slate-400">折り返し希望：</span>{callbackPrefLabel(detail.callbackPref)}</p>
              {detail.note && (
                <p className="whitespace-pre-wrap break-words"><span className="text-slate-400">備考：</span>{detail.note}</p>
              )}
            </div>

            {/* 操作（一覧タブと同じ出し分け） */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              {detail.status === 'new' && (
                <button type="button" disabled={busy} onClick={() => handleStatus(detail.id, 'confirmed')}
                  className={`${btnBase} border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>確定にする</button>
              )}
              {(detail.status === 'new' || detail.status === 'confirmed') && (
                <button type="button" disabled={busy} onClick={() => handleStatus(detail.id, 'cancelled')}
                  className={`${btnBase} border-slate-300 text-slate-500 hover:bg-slate-50`}>キャンセル</button>
              )}
              {detail.status === 'cancelled' && (
                <button type="button" disabled={busy} onClick={() => handleStatus(detail.id, 'new')}
                  className={`${btnBase} border-pink-300 text-pink-600 hover:bg-pink-50`}>新規に戻す</button>
              )}
              {detail.status !== 'cancelled' && !moveForm && (
                <button type="button" disabled={busy} onClick={() => openMove(detail)}
                  className={`${btnBase} border-sky-300 text-sky-600 hover:bg-sky-50`}>時間・担当を変更</button>
              )}
              <button type="button" disabled={busy} onClick={() => handleDelete(detail.id)}
                className={`${btnBase} border-rose-200 text-rose-500 hover:bg-rose-50 ml-auto`}>削除</button>
            </div>

            {/* 移動フォーム */}
            {moveForm && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-3 space-y-2" data-testid="board-move-form">
                <p className="text-[11px] font-bold text-slate-600">時間・担当の変更（コース時間 {detail.courseMin}分 のまま移動します）</p>
                <div className="flex gap-2">
                  <input type="date" value={moveForm.date} onChange={(e) => void handleMoveDateChange(e.target.value)}
                    className={`${inputCls} flex-1`} />
                </div>
                <select
                  value={moveForm.therapistId}
                  onChange={(e) => setMoveForm({ ...moveForm, therapistId: Number(e.target.value), startISO: '' })}
                  className={inputCls}
                >
                  {moveScheduled.length === 0 && <option value={moveForm.therapistId}>出勤者がいません</option>}
                  {moveScheduled.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{t.schedule ? shiftLabel(t.schedule.start, t.schedule.end) : ''}）</option>
                  ))}
                </select>
                <select
                  value={moveForm.startISO}
                  onChange={(e) => setMoveForm({ ...moveForm, startISO: e.target.value })}
                  className={inputCls}
                  disabled={moveLoading || moveOptions.length === 0}
                >
                  <option value="">{moveLoading ? '読み込み中...' : moveOptions.length === 0 ? '選択できる時間がありません' : '開始時刻を選択'}</option>
                  {moveOptions.map((o) => (
                    <option key={o.iso} value={o.iso} disabled={o.taken}>{o.label}{o.taken ? '（埋まり）' : ''}</option>
                  ))}
                </select>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setMoveForm(null)}
                    className={`${btnBase} border-slate-200 text-slate-500 hover:bg-slate-50`}>やめる</button>
                  <button type="button" disabled={busy || !moveForm.startISO} onClick={handleMoveSubmit}
                    className={`${btnBase} border-sky-300 bg-sky-500 border-sky-500 text-white hover:bg-sky-600`}>この内容で移動</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 電話予約の手入力パネル ── */}
      {addForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddForm(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-3" data-testid="board-add-form">
            <h3 className="text-sm font-black text-slate-700">電話予約を追加</h3>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              電話などで受けた予約をボードに登録します。登録した予約は「確定」として扱われ、ネット予約の空き枠からも除外されます。
            </p>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">担当セラピスト</label>
                <select
                  value={addForm.therapistId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const th = scheduled.find((t) => t.id === id);
                    // 担当を変えたら開始時刻はその人の出勤開始に合わせ直す。
                    setAddForm({ ...addForm, therapistId: id, startISO: th?.schedule?.startISO ?? '' });
                  }}
                  className={inputCls}
                >
                  {scheduled.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{t.schedule ? shiftLabel(t.schedule.start, t.schedule.end) : ''}）</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">開始時刻</label>
                  <select value={addForm.startISO} onChange={(e) => setAddForm({ ...addForm, startISO: e.target.value })} className={inputCls}>
                    <option value="">選択してください</option>
                    {addOptions.map((o) => (
                      <option key={o.iso} value={o.iso} disabled={o.taken}>{o.label}{o.taken ? '（埋まり）' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28 flex-none">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">所要時間</label>
                  <select value={addForm.durationMin} onChange={(e) => setAddForm({ ...addForm, durationMin: Number(e.target.value) })} className={inputCls}>
                    {DURATION_OPTIONS.map((m) => <option key={m} value={m}>{m}分</option>)}
                  </select>
                </div>
              </div>

              {(data?.courses.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data!.courses.map((c) => (
                    <button key={`${c.name}-${c.durationMin}`} type="button"
                      onClick={() => setAddForm({ ...addForm, courseName: c.name, durationMin: c.durationMin })}
                      className={`${btnBase} ${addForm.courseName === c.name && addForm.durationMin === c.durationMin
                        ? 'border-pink-300 bg-pink-50 text-pink-600'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      {c.name}（{c.durationMin}分）
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">コース名</label>
                <input type="text" value={addForm.courseName} onChange={(e) => setAddForm({ ...addForm, courseName: e.target.value })}
                  placeholder="例）スタンダードアロマ（空欄なら「電話予約」）" className={inputCls} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">お客様名 <span className="text-pink-500">必須</span></label>
                  <input type="text" value={addForm.customerName} onChange={(e) => setAddForm({ ...addForm, customerName: e.target.value })}
                    placeholder="例）山田" className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">電話番号（任意）</label>
                  <input type="tel" value={addForm.customerTel} onChange={(e) => setAddForm({ ...addForm, customerTel: e.target.value })}
                    placeholder="09012345678" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">備考（任意）</label>
                <textarea value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  rows={2} className={inputCls} placeholder="指名の経緯・オプションなど" />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setAddForm(null)}
                className={`${btnBase} border-slate-200 text-slate-500 hover:bg-slate-50`}>やめる</button>
              <button type="button" disabled={busy} onClick={handleAddSubmit}
                className={`${btnBase} bg-pink-500 border-pink-500 text-white hover:bg-pink-600`}>予約を追加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
