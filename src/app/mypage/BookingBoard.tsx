'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBookingBoardData,
  getBookingCountsByDay,
  createManualBooking,
  moveBooking,
  updateBookingStatus,
  deleteBooking,
  type BookingBoardData,
  type BoardBooking,
  type BoardTherapist,
} from '@/app/actions/booking';
import { callbackPrefLabel } from '@/app/lib/booking/callbackPref';
import { useToast } from '@/app/components/useToast';

// /mypage「予約ボード」タブ本体（2026-08-14 新設）。
// 1日タイムライン：縦＝セラピスト（行）・横＝時間（同日中に縦横を反転。当初は縦＝時間だった）。
// 当日（営業日・朝6時切替）を初期表示し前後に日付送り。
// できること：予約ブロックタップ→詳細パネル（確定/キャンセル/新規に戻す/削除/時間・担当の変更）、
//             出勤帯の空き部分タップ→電話予約の手入力（status='confirmed' で登録）。
// 配色は mypage 既存トーン（白カード・ピンク基調）。ステータス色は一覧と同じ
// （new=ピンク / confirmed=エメラルド / cancelled=グレー薄表示）。

// ── 寸法定数 ──
const PX_PER_MIN = 1.0; // 横方向 1分=1px（1時間 = 60px）。1.2→1.0でスマホの可視時間を約2割増（2026-08-14）
const ROW_H = 64;       // セラピスト行の高さ(px)
const NAME_W = 36;      // 左の名前列の幅(px・sticky)。内側余白0で時間表示が収まる最小幅（92→64→44→36・2026-08-14）
const AXIS_H = 22;      // 上の時間軸の高さ(px)
const STEP_MIN = 15;    // 枠の刻み（ネット予約と同じ15分）
// ボードの時間レンジ：出勤の有無に関係なく 0:00〜翌7:00 固定（2026-08-14仕様変更）。
// 翌0:00〜7:00 は翌日のボード（0:00〜7:00）にも同じ予約が表示される（7時間の重複窓）。
const BOARD_START_MIN = 0;
const BOARD_END_MIN = 31 * 60; // 翌7:00 = 1860分

// 検証フィクスチャ用の差し替え口。省略時は本物のサーバーアクションを使う。
export type BoardIO = {
  fetchBoard: typeof getBookingBoardData;
  fetchCounts: typeof getBookingCountsByDay;
  createManual: typeof createManualBooking;
  move: typeof moveBooking;
  setStatus: typeof updateBookingStatus;
  remove: typeof deleteBooking;
};
const defaultIO: BoardIO = {
  fetchBoard: getBookingBoardData,
  fetchCounts: getBookingCountsByDay,
  createManual: createManualBooking,
  move: moveBooking,
  setStatus: updateBookingStatus,
  remove: deleteBooking,
};

// ── 日付・時刻ヘルパー（すべて JST 基準） ──

// JSTの今日（暦日）。ボードの「今日」は 0:00 切替（営業日の朝6時切替ではない・2026-08-14仕様変更）。
function todayJstCalendar(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

// "YYYY-MM-DD" を days 日ずらす（UTC正午基準で月跨ぎ安全）。
function shiftDateStr(dateStr: string, days: number): string {
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

// 名前列（幅44px）の縦表示用ヘルパー。"02:00"→"2:00" と頭のゼロを落とす。
function trimHourZero(t: string): string {
  return t.replace(/^0(\d:)/, '$1');
}

// 出勤終了が日跨ぎ（＝終了側に「翌」を付ける）か。
function isOvernight(start: string, end: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  return toMin(end) <= toMin(start);
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

// セレクトの表示用：当日枠があればその時間、前日尻尾だけなら「前日〜HH:MM」。
function therapistShiftLabel(t: BoardTherapist): string {
  const today = t.schedules.find((w) => !w.fromPrevDay);
  if (today) return shiftLabel(today.start, today.end);
  const tail = t.schedules.find((w) => w.fromPrevDay);
  if (tail) return `前日〜${tail.end}`;
  return '出勤なし';
}

// 時間選択肢：ボード窓（0:00〜翌7:00）全体を15分刻みで列挙し、
// 既存予約（cancelled以外・自分以外）と重なる枠に taken を立てる。
// 2026-08-14仕様変更：出勤帯には縛られない（受付可能時間は店の判断でその都度変わるため）。
function slotTimeOptions(params: {
  therapistId: number | null | undefined;
  durationMin: number;
  bookings: BoardBooking[];
  boardDate: string;
  excludeId?: string;
}): { iso: string; label: string; taken: boolean }[] {
  const { therapistId, durationMin, bookings, boardDate, excludeId } = params;
  if (!therapistId || durationMin <= 0) return [];
  const durMs = durationMin * 60 * 1000;
  const zeroMs = anchorMsOf(boardDate);
  const out: { iso: string; label: string; taken: boolean }[] = [];
  for (let min = BOARD_START_MIN; min < BOARD_END_MIN; min += STEP_MIN) {
    const t = zeroMs + min * 60 * 1000;
    const e = t + durMs;
    const taken = bookings.some(
      (b) =>
        b.therapistId === therapistId &&
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
  const [date, setDate] = useState(() => todayJstCalendar());
  // 今日から7日間（暦日・0:00切替）。日付チップと移動フォームの日付選択肢はこの範囲だけ。
  // 0:00 になった瞬間に前日のボードは消え、新しい「今日」が先頭になる（2026-08-14仕様変更）。
  const days = Array.from({ length: 7 }, (_, i) => shiftDateStr(todayJstCalendar(), i));
  // タブを開いたまま 0:00（日付の切替）を跨いだら、選択日を新しい「今日」へ寄せる。
  useEffect(() => {
    if (!days.includes(date)) setDate(days[0]);
    // days は毎レンダー新しい配列になるため、切替検知は先頭日だけ見る。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);
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

  // 日付チップのバッジ用：営業日ごとの予約件数（cancelled除く）。null=未取得。
  const [dayCounts, setDayCounts] = useState<Record<string, number> | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setLoadError('');
    const res = await io.fetchBoard(salonId, d);
    setLoading(false);
    if (!res.ok) { setLoadError(res.error); return; }
    setData(res.data);
  }, [io, salonId]);

  // 件数バッジの取得。失敗してもボード本体は使えるので黙って据え置く。
  const loadCounts = useCallback(async () => {
    const res = await io.fetchCounts(salonId);
    if (res.ok) setDayCounts(res.counts);
  }, [io, salonId]);

  // タブがアクティブになったとき＆日付が変わったときに読み込む（非アクティブ中は読まない）。
  // バッジ件数も同時に取り直す（日付切替時も＝他の日に入った予約が反映される）。
  useEffect(() => {
    if (!active) return;
    void load(date);
    void loadCounts();
  }, [active, date, load, loadCounts]);

  const anchorMs = useMemo(() => anchorMsOf(date), [date]);
  const minOf = useCallback((iso: string) => (new Date(iso).getTime() - anchorMs) / 60000, [anchorMs]);

  // ボードの時間レンジ：0:00〜翌7:00 固定（出勤の有無で変えない・2026-08-14仕様変更）。
  const boardStart = BOARD_START_MIN;
  const boardEnd = BOARD_END_MIN;

  const boardW = (boardEnd - boardStart) * PX_PER_MIN; // タイムライン部の幅(px)
  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let m = boardStart; m <= boardEnd; m += 60) arr.push(m);
    return arr;
  }, [boardStart, boardEnd]);

  const isToday = date === days[0];
  const nowMin = (Date.now() - anchorMs) / 60000;
  const showNowLine = isToday && nowMin > boardStart && nowMin < boardEnd;

  // 初期スクロール：当日は現在時刻が画面の左1/3あたりに、
  // 未来日は最初の出勤開始の30分前（出勤なしは9:00）に合わせる（0:00始まりだと深夜が見えるだけのため）。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!data || !scrollRef.current) return;
    const el = scrollRef.current;
    if (showNowLine) {
      el.scrollLeft = Math.max(0, (nowMin - boardStart) * PX_PER_MIN - (el.clientWidth - NAME_W) / 3);
      return;
    }
    let first = Number.POSITIVE_INFINITY;
    for (const t of data.therapists) {
      for (const w of t.schedules) {
        if (!w.fromPrevDay) first = Math.min(first, minOf(w.startISO));
      }
    }
    const startMin = Number.isFinite(first) ? Math.max(0, first - 30) : 540;
    el.scrollLeft = startMin * PX_PER_MIN;
    // data（＝日付切替・再読込）のたびに位置を取り直す。nowMin は毎レンダー変わるため依存に入れない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const activeCount = (data?.bookings ?? []).filter((b) => b.status !== 'cancelled').length;
  // 手入力の担当候補＝行に出ている全員（出勤の有無を問わない・2026-08-14仕様変更）。
  const scheduled = data?.therapists ?? [];

  // ── 操作 ──

  const reload = () => { void load(date); void loadCounts(); };

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
  // 2026-08-14仕様変更：行全体（0:00〜翌7:00）どこでも受付可。出勤帯（青）には縛られない。
  const openAdd = (t: BoardTherapist, clickMin: number) => {
    let m = Math.floor(clickMin / STEP_MIN) * STEP_MIN;
    m = Math.max(boardStart, Math.min(m, boardEnd - STEP_MIN));
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

  // 手入力フォームの時間選択肢（担当・所要時間に追従）。窓全体が対象（出勤帯に縛られない）。
  const addOptions = addForm
    ? slotTimeOptions({ therapistId: addForm.therapistId, durationMin: addForm.durationMin, bookings: data?.bookings ?? [], boardDate: date })
    : [];

  // 移動フォームの選択肢（移動先日のデータから）。担当は在籍セラピスト全員から選べる。
  const moveScheduled = moveData?.therapists ?? [];
  const moveOptions = moveForm && detail
    ? slotTimeOptions({
        therapistId: moveForm.therapistId,
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

      {/* カードの左右余白は px-2（従来 p-4）＝タイムラインの可視幅を+16px稼ぐ（2026-08-14） */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-2 py-4 space-y-3">
        {/* ── 日付ナビ：今日から7日間のチップを横並び（‹›送りは廃止・2026-08-14）。
            ネット予約の受付範囲（当日〜7日先）と同じ考え方で、ボードもこの7日間だけを扱う。 ── */}
        {/* チップは角を直角・隙間0（境界線は -ml-px で1本に重ねる）。選択中は z-10 でピンク枠を前面に */}
        <div className="flex" data-testid="board-days">
          {days.map((d) => {
            const selected = d === date;
            const head = formatDateHeading(d); // "8/14(金)"
            const md = head.slice(0, head.indexOf('('));
            const wd = head.slice(head.indexOf('('));
            const count = dayCounts?.[d] ?? 0;
            return (
              <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={selected}
                className={`relative flex-1 min-w-0 border py-1.5 text-center transition-colors -ml-px first:ml-0 ${selected
                  ? 'z-10 bg-pink-50 border-pink-300 text-pink-600'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}>
                <span className="block text-[12px] font-bold leading-tight">{md}</span>
                <span className="block text-[10px] leading-tight">{d === days[0] ? '今日' : wd}</span>
                {/* その日の予約件数バッジ（cancelled除く・0件は非表示）。運営事務局タブの未読バッジと同型。
                    隙間0にしたため右へはみ出させず right-0（チップ内）に置く＝隣のチップに隠れない */}
                {count > 0 && (
                  <span data-testid={`board-day-badge-${d}`}
                    className="absolute -top-1.5 right-0 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-pink-500 text-white text-[9px] font-black leading-none pointer-events-none">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 凡例＋件数・再読み込み */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
            <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-pink-100 border border-pink-300 inline-block" />新規</span>
            <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" />確定</span>
            <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200 inline-block" />キャンセル</span>
            <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-sky-100 border border-sky-200 inline-block" />出勤時間</span>
            <span>空き部分をタップすると電話予約を追加できます（出勤時間外もOK）</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">{activeCount}件</span>
            <button type="button" onClick={reload} disabled={loading}
              className={`${btnBase} border-slate-200 text-slate-500 hover:bg-slate-50`}>再読み込み</button>
          </div>
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
                // 名前列の表示は「当日枠」を優先。前日尻尾しか無い行は「前日〜HH:MM」表示。
                const todayWin = t.schedules.find((sw) => !sw.fromPrevDay) ?? null;
                const tailWin = t.schedules.find((sw) => sw.fromPrevDay) ?? null;
                const rowBookings = data.bookings.filter((b) => b.therapistId === t.id);
                return (
                  <div key={t.id} className="flex border-t border-slate-100" data-testid={`board-col-${t.id}`}>
                    {/* 名前列（左・sticky） */}
                    {/* 出勤時間は「開始／｜／翌終了」の縦3行（2026-08-14・横幅を絞るため） */}
                    <div className="sticky left-0 z-20 bg-white flex-none px-0 flex flex-col justify-center text-center border-r border-slate-100"
                      style={{ width: NAME_W, height: ROW_H }}
                      title={`${t.name}（${therapistShiftLabel(t)}）`}>
                      <p className="text-[11px] font-bold text-slate-700 truncate leading-tight">{t.name}</p>
                      {todayWin ? (
                        <>
                          <p className="text-[9px] text-slate-400 leading-tight tracking-tight">{trimHourZero(todayWin.start)}</p>
                          <p className="text-[8px] text-slate-300 leading-none">｜</p>
                          <p className="text-[9px] text-slate-400 leading-tight tracking-tight">{isOvernight(todayWin.start, todayWin.end) ? '翌' : ''}{trimHourZero(todayWin.end)}</p>
                        </>
                      ) : tailWin ? (
                        <>
                          <p className="text-[9px] text-slate-400 leading-tight">前日</p>
                          <p className="text-[9px] text-slate-400 leading-tight tracking-tight">〜{trimHourZero(tailWin.end)}</p>
                        </>
                      ) : (
                        <p className="text-[8px] text-slate-400 leading-tight whitespace-nowrap">出勤なし</p>
                      )}
                    </div>
                    {/* タイムライン（右） */}
                    {/* 行全体が受付可能（白・タップで手入力）。出勤帯は薄青の目安表示のみ（2026-08-14仕様変更） */}
                    <div
                      className="relative bg-white flex-none cursor-pointer"
                      style={{ width: boardW, height: ROW_H }}
                      title="タップして電話予約を追加"
                      data-testid={`board-row-${t.id}`}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (rect.width <= 0) return;
                        const clickMin = ((e.clientX - rect.left) / rect.width) * (boardEnd - boardStart);
                        openAdd(t, clickMin);
                      }}
                    >
                      {/* 時間罫線（縦） */}
                      {hours.map((m) => (
                        <div key={m} className="absolute inset-y-0 border-l border-slate-100"
                          style={{ left: (m - boardStart) * PX_PER_MIN }} />
                      ))}
                      {/* 出勤帯（薄青・目安表示のみ）。前日尻尾＋当日枠の最大2本。
                          クリックは行側で拾うため pointer-events-none */}
                      {t.schedules.map((sw) => {
                        const leftMin = Math.max(boardStart, minOf(sw.startISO));
                        const rightMin = Math.min(boardEnd, minOf(sw.endISO));
                        if (rightMin <= leftMin) return null;
                        return (
                          <div
                            key={sw.startISO}
                            className="absolute inset-y-0 bg-sky-100/70 pointer-events-none"
                            data-testid={`board-band-${t.id}${sw.fromPrevDay ? '-prev' : ''}`}
                            style={{ left: (leftMin - boardStart) * PX_PER_MIN, width: (rightMin - leftMin) * PX_PER_MIN }}
                          />
                        );
                      })}
                      {/* 予約ブロック */}
                      {rowBookings.map((b) => {
                        const s = Math.max(boardStart, minOf(b.slotStart));
                        const e = Math.min(boardEnd, minOf(b.slotEnd));
                        if (e <= s) return null;
                        const w = (e - s) * PX_PER_MIN;
                        const sLabel = timeLabel(new Date(b.slotStart).getTime(), date);
                        const eLabel = timeLabel(new Date(b.slotEnd).getTime(), date);
                        // px-0：ブロック内の左右余白は0にして文字を縁いっぱいまで見せる（2026-08-14）。
                        // 角丸は rounded-md に一段落とし、角の丸みで1行目の文字が欠けないようにする。
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); setDetail(b); }}
                            data-testid={`board-booking-${b.id}`}
                            className={`absolute inset-y-0.5 rounded-md border px-0 py-0.5 text-left overflow-hidden ${blockCls(b.status)}`}
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
                {formatDateHeading(jstDateStr(new Date(detail.slotStart).getTime()))/* 暦日表記（0:00切替・ボードと同じ基準） */}
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
                {/* 移動先の日付もボードと同じ「今日から7日間」に限定（自由入力の type=date は廃止） */}
                <select value={moveForm.date} onChange={(e) => void handleMoveDateChange(e.target.value)} className={inputCls}>
                  {days.map((d) => (
                    <option key={d} value={d}>{formatDateHeading(d)}{d === days[0] ? '（今日）' : ''}</option>
                  ))}
                </select>
                <select
                  value={moveForm.therapistId}
                  onChange={(e) => setMoveForm({ ...moveForm, therapistId: Number(e.target.value), startISO: '' })}
                  className={inputCls}
                >
                  {moveScheduled.length === 0 && <option value={moveForm.therapistId}>セラピストがいません</option>}
                  {moveScheduled.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{therapistShiftLabel(t)}）</option>
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
                    // 時間候補は窓全体で共通のため、担当を変えても開始時刻はそのまま維持する。
                    setAddForm({ ...addForm, therapistId: Number(e.target.value) });
                  }}
                  className={inputCls}
                >
                  {scheduled.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}（{therapistShiftLabel(t)}）</option>
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
