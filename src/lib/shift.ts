// シフト提出・シフト管理表の決めごと（2026-11-04・店舗様のご要望・カッキーさんの決定）。★ 純粋関数だけ（サーバー・画面の両方で使う）。
//
// ★ 時刻は「その日 0:00 からの分」（crm_work_days と同じ）。翌2:00 は 1560。
//   ・開始は 06:00〜翌05:30（360〜1770）。日付の区切りは朝6時（lib/dutyStatus.ts と同じ）。
//   ・終了は 開始の30分後〜開始の24時間後、ただし 翌07:00（1860）まで。
// ★ 出勤の正本 therapist_schedules は "HH:MM"。開始が朝6時より前なら開始も終了も「翌」、終了が開始以前なら終了だけ「翌」
//   （lib/scheduleFormat.ts shiftNextDayMarks と同じ読み方）。
// ★ 部屋数チェック: 終わりに入れ替え時間を足した時間まで部屋が埋まっているとして、同じ時刻の人数を数える。
//   A 12:00〜18:00 と B 18:00〜24:00 は、入れ替え時間 0 なら同時に1人（18:00 ちょうどは A が終わって B が始まる）。

export type ShiftPeriod = '1w' | '2w' | '1m';
export const SHIFT_PERIODS: ReadonlyArray<{ value: ShiftPeriod; label: string }> = [
  { value: '1w', label: '1週間（来週の月〜日）' },
  { value: '2w', label: '2週間（来週の月〜再来週の日）' },
  { value: '1m', label: '1か月（翌月の1日〜末日）' },
];
export const SHIFT_CHANGEOVER_OPTIONS = [0, 10, 15, 20, 30, 45, 60, 90, 120] as const;
export const SHIFT_ROOM_MAX = 50;
export const SHIFT_START_MIN = 360;
export const SHIFT_START_MAX = 1770;
export const SHIFT_END_MAX = 1860;

export function isShiftPeriod(v: unknown): v is ShiftPeriod {
  return v === '1w' || v === '2w' || v === '1m';
}

// ── 日付（"YYYY-MM-DD" を UTC の数字で扱う＝実行環境の時間帯に左右されない）──
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}
const WD = ['日', '月', '火', '水', '木', '金', '土'];
/** "11/9(月)" */
export function shiftDateLabel(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}(${WD[weekdayOf(ymd)]})`;
}
export function shiftDateTone(ymd: string): string {
  const w = weekdayOf(ymd);
  return w === 0 ? 'text-rose-500' : w === 6 ? 'text-sky-600' : 'text-slate-700';
}

/** その日を含む週の月曜 */
function mondayOf(ymd: string): string {
  const w = weekdayOf(ymd);
  return addDays(ymd, w === 0 ? -6 : 1 - w);
}

/**
 * 提出する期間（次の期間）と、今の期間（見るだけ）。today は営業日（朝6時区切り）。
 *   1w: 来週の月〜日 ／ 今週の月〜日
 *   2w: 来週の月〜再来週の日 ／ 今週の月〜日
 *   1m: 翌月の1日〜末日 ／ 今月の1日〜末日
 */
export function shiftPeriods(period: ShiftPeriod, today: string): { next: { from: string; to: string }; current: { from: string; to: string } } {
  if (period === '1m') {
    const [y, m] = today.split('-').map(Number);
    const first = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
    const curFrom = first(y, m);
    const nextFrom = first(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
    const afterFrom = first(m >= 11 ? y + 1 : y, ((m + 1) % 12) + 1);
    return { current: { from: curFrom, to: addDays(nextFrom, -1) }, next: { from: nextFrom, to: addDays(afterFrom, -1) } };
  }
  const thisMon = mondayOf(today);
  const nextMon = addDays(thisMon, 7);
  return {
    current: { from: thisMon, to: addDays(thisMon, 6) },
    next: { from: nextMon, to: addDays(nextMon, period === '2w' ? 13 : 6) },
  };
}

// ── 時刻 ──────────────────────────────────────────────
/** 分 → "HH:MM"（24時間で折り返す） */
export function minToHM(min: number): string {
  const v = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}
/** 分 → 表示（"21:00" / "翌02:00"） */
export function minLabel(min: number): string {
  return (min >= 1440 ? '翌' : '') + minToHM(min);
}
export function rangeLabel(s: number, e: number): string {
  return `${minLabel(s)}〜${minLabel(e)}`;
}
/** "21:00〜02:00" のような短い形（管理表の「A 21〜02 希望」用） */
export function rangeShort(s: number, e: number): string {
  const f = (m: number) => { const hm = minToHM(m); return hm.endsWith(':00') ? hm.slice(0, 2) : hm; };
  return `${f(s)}〜${f(e)}`;
}
export function startOptions(): number[] {
  const out: number[] = [];
  for (let m = SHIFT_START_MIN; m <= SHIFT_START_MAX; m += 30) out.push(m);
  return out;
}
export function endOptions(start: number): number[] {
  const out: number[] = [];
  for (let m = start + 30; m <= Math.min(start + 1440, SHIFT_END_MAX); m += 30) out.push(m);
  return out;
}
/** 画面から来た時刻を確かめる（30分刻み・範囲内）。だめなら null */
export function validRange(s: unknown, e: unknown): { s: number; e: number } | null {
  const a = Math.trunc(Number(s)), b = Math.trunc(Number(e));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a % 30 !== 0 || b % 30 !== 0) return null;
  if (a < SHIFT_START_MIN || a > SHIFT_START_MAX) return null;
  if (b <= a || b > Math.min(a + 1440, SHIFT_END_MAX)) return null;
  return { s: a, e: b };
}

/** therapist_schedules の "HH:MM" 2つ → 分（読めなければ null） */
export function scheduleToMin(start: string | null | undefined, end: string | null | undefined): { s: number; e: number } | null {
  const p = (t: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  };
  const a = p(start), b = p(end);
  if (a === null || b === null) return null;
  const s = a < SHIFT_START_MIN ? a + 1440 : a;
  let e = b + (a < SHIFT_START_MIN ? 1440 : 0);
  if (e <= s) e += 1440;
  return { s, e };
}

// ── 部屋数チェック ───────────────────────────────────────
/** 期間の中の1本（date は営業日・時刻はその日 0:00 からの分） */
export type OccupyShift = { date: string; s: number; e: number; who?: string };

function absMin(base: string, date: string, min: number): number {
  const [y1, m1, d1] = base.split('-').map(Number);
  const [y2, m2, d2] = date.split('-').map(Number);
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  return days * 1440 + min;
}

/**
 * 候補 cand を確定したとき、部屋が足りるか。others は【同じ店の、候補以外の】出勤（前後の日も入れてよい）。
 * ★ roomCount 0＝部屋数未設定＝チェックしない。
 * 返すのは問題の時間帯（候補の日 0:00 からの分）と、どちらの理由か。
 *   over      … 入れ替え時間を見なくても部屋数を超える
 *   changeover … 時間は被らないが、入れ替え時間が足りない
 */
export function checkRooms(cand: OccupyShift, others: readonly OccupyShift[], roomCount: number, changeoverMin: number):
  { ok: true } | { ok: false; kind: 'over' | 'changeover'; fromMin: number; toMin: number; count: number } {
  if (!roomCount || roomCount <= 0) return { ok: true };
  const base = cand.date;
  const cs = absMin(base, cand.date, cand.s), ce = absMin(base, cand.date, cand.e);
  const run = (co: number) => {
    // 候補の時間帯（入れ替え込み）の中で、同時に何人いるかを区切りごとに数える
    const cEnd = ce + co;
    const iv = others.map((o) => [absMin(base, o.date, o.s), absMin(base, o.date, o.e) + co] as const)
      .filter(([a, b]) => b > cs && a < cEnd);
    const points = new Set<number>([cs, cEnd]);
    for (const [a, b] of iv) { if (a > cs && a < cEnd) points.add(a); if (b > cs && b < cEnd) points.add(b); }
    const sorted = [...points].sort((x, y) => x - y);
    let from: number | null = null, to = 0, peak = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const n = 1 + iv.filter(([x, y]) => x < b && y > a).length;
      if (n > roomCount) {
        if (from === null) from = a;
        to = b; peak = Math.max(peak, n);
      }
    }
    return from === null ? null : { from, to, peak };
  };
  const hard = run(0);
  if (hard) return { ok: false, kind: 'over', fromMin: hard.from, toMin: Math.min(hard.to, ce), count: hard.peak };
  if (changeoverMin > 0) {
    const soft = run(changeoverMin);
    if (soft) return { ok: false, kind: 'changeover', fromMin: soft.from, toMin: soft.to, count: soft.peak };
  }
  return { ok: true };
}

export function roomErrorText(r: { kind: 'over' | 'changeover'; fromMin: number; toMin: number; count: number }, roomCount: number, changeoverMin: number): string {
  if (r.kind === 'over') return `${rangeLabel(r.fromMin, r.toMin)} が部屋数（${roomCount}）をオーバーしています（${r.count}人）`;
  return `${rangeLabel(r.fromMin, r.toMin)} は入れ替え時間（${changeoverMin}分）が足りません`;
}

// ── 1日の表示（セラピストページと管理表で同じ言葉にする）─────────────
export type ShiftRequestView = {
  reqS: number; reqE: number; note: string;
  status: 'requested' | 'confirmed';
  confS: number | null; confE: number | null;
  /** ★ 第1732便: 最後に提出・書き直した時刻（ISO）。管理表の「NEW」に使う */
  submittedAt?: string;
};
export type ShiftDayState =
  | { kind: 'none' }
  | { kind: 'requested'; req: string }
  | { kind: 'confirmed'; conf: string; changedFromReq: string | null }
  | { kind: 'changed'; now: string; conf: string }
  | { kind: 'off'; conf: string }
  | { kind: 'direct'; now: string };

/** 希望・確定と、出勤の正本（週間スケジュール）を見比べた、その日の状態 */
export function shiftDayState(req: ShiftRequestView | null, sched: { s: number; e: number } | null): ShiftDayState {
  if (req && req.status === 'confirmed' && req.confS != null && req.confE != null) {
    const conf = rangeLabel(req.confS, req.confE);
    if (!sched) return { kind: 'off', conf };
    if (sched.s !== req.confS || sched.e !== req.confE) return { kind: 'changed', now: rangeLabel(sched.s, sched.e), conf };
    const changed = req.reqS !== req.confS || req.reqE !== req.confE;
    return { kind: 'confirmed', conf, changedFromReq: changed ? rangeLabel(req.reqS, req.reqE) : null };
  }
  if (req) return { kind: 'requested', req: rangeLabel(req.reqS, req.reqE) };
  if (sched) return { kind: 'direct', now: rangeLabel(sched.s, sched.e) };
  return { kind: 'none' };
}
