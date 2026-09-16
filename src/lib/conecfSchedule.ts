// コネックエフの週間スケジュールの決めごと（第399便・1d・2026-09-17）。★ 純粋関数だけ。
//
// ★★ 保存先はフクエスの therapist_schedules（therapist_id × schedule_date）。★ 形は /mypage と同じ:
//   is_active / start_time "HH:MM" / end_time "HH:MM"。★ 終了が開始より前なら「翌」（日をまたぐ）。
// ★ 時刻は30分刻み（連携先4サイトとも30分刻み・lib/timeSnap.ts 第75便）。★ 画面は選ぶだけにして、手打ちを無くした。
// ★ 日付の区切りは朝6時（lib/dutyStatus.ts の DAY_START_HOUR・カッキーさんの決定 6:00）。

export const CONECF_SCHEDULE_DAYS = 7;

/** 開始の選択肢（06:00〜翌05:30） */
export function startTimeOptions(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (let m = 6 * 60; m < 30 * 60; m += 30) out.push(opt(m));
  return out;
}

/** 終了の選択肢（開始の30分後〜開始の24時間後まで。★ 表示は「翌」付き） */
export function endTimeOptions(start: string | null): Array<{ value: string; label: string }> {
  const s = parseHM(start);
  const base = s === null ? 6 * 60 : (s < 6 * 60 ? s + 1440 : s);
  const out: Array<{ value: string; label: string }> = [];
  for (let m = base + 30; m <= base + 24 * 60 && m <= 30 * 60 + 6 * 60; m += 30) out.push(opt(m));
  return out;
}

function opt(total: number): { value: string; label: string } {
  const v = ((total % 1440) + 1440) % 1440;
  const hm = String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  return { value: hm, label: (total >= 1440 ? '翌' : '') + hm };
}

export function parseHM(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** 「20:00〜翌02:00」。★ 出勤でない・時刻が無いときは空文字 */
export function shiftLabel(d: { isActive: boolean; start: string | null; end: string | null }): string {
  if (!d.isActive) return '';
  const s = parseHM(d.start), e = parseHM(d.end);
  if (s === null || e === null) return '時間未設定';
  return `${d.start}〜${e <= s ? '翌' : ''}${d.end}`;
}

export type ConecfShiftInput = { date: unknown; isActive: unknown; start: unknown; end: unknown };
export type ConecfShift = { date: string; isActive: boolean; start: string | null; end: string | null };

/**
 * ★ 画面から来た1人ぶんの7日を確かめる。
 * ★ 送ってよい日付は allowedDates（今日から7日）だけ。★ 出勤なのに時刻が無い・30分刻みでない・開始と終了が同じは断る。
 */
export function normalizeShifts(input: readonly ConecfShiftInput[], allowedDates: readonly string[]):
  { ok: true; shifts: ConecfShift[] } | { ok: false; error: string } {
  const allowed = new Set(allowedDates);
  const seen = new Set<string>();
  const out: ConecfShift[] = [];
  for (const x of Array.isArray(input) ? input : []) {
    const date = typeof x.date === 'string' ? x.date : '';
    if (!allowed.has(date)) return { ok: false, error: `この日付は保存できません（${date || '空'}）` };
    if (seen.has(date)) return { ok: false, error: `同じ日付が2つあります（${date}）` };
    seen.add(date);
    const isActive = x.isActive === true;
    if (!isActive) { out.push({ date, isActive: false, start: null, end: null }); continue; }
    const s = parseHM(typeof x.start === 'string' ? x.start : null);
    const e = parseHM(typeof x.end === 'string' ? x.end : null);
    if (s === null || e === null) return { ok: false, error: `${date} の出勤時間を選んでください` };
    if (s % 30 !== 0 || e % 30 !== 0) return { ok: false, error: `${date} の時刻は30分単位で選んでください` };
    if (s === e) return { ok: false, error: `${date} の開始と終了が同じです` };
    out.push({ date, isActive: true, start: x.start as string, end: x.end as string });
  }
  return { ok: true, shifts: out };
}
