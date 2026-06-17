// 1日（営業日）の始まりを午前5時とする。深夜営業のサロンに対応するため、
// 午前0:00〜4:59 は「前日」のスケジュールを参照する。
export const DAY_START_HOUR = 5;

/**
 * 現在の日本時間を基準に、「営業日」を YYYY-MM-DD 形式で返す。
 * JST が午前5時より前の場合は前日扱いとする。
 * @param offsetDays 営業日からのオフセット日数（0=当日, 1=翌営業日 ...）
 */
export function getBusinessDateJST(offsetDays = 0): string {
  const now = new Date();
  const jstHour = Number(
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(now)
  );
  // 現在のJST日付（YYYY-MM-DD）
  const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
  const [y, m, d] = todayStr.split('-').map(Number);

  // 午前5時より前なら1日戻す。月またぎを正しく扱うため UTC 正午基準で加減算。
  const shift = jstHour < DAY_START_HOUR ? -1 : 0;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + shift + offsetDays);

  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** 営業日基準で連続する days 日分の日付配列を返す（[当日, 翌日, ...]）。 */
export function getBusinessDateRangeJST(days: number): string[] {
  return Array.from({ length: days }, (_, i) => getBusinessDateJST(i));
}

/** 現在の日本時間を「0時からの経過分」で返す（0〜1439）。 */
export function getNowJSTMinutes(): number {
  const now = new Date();
  const h = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(now));
  const m = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', minute: '2-digit' }).format(now));
  return h * 60 + m;
}

/** 0時起点の分を「営業日（午前5時始まり）の経過分」に変換する（0 = 05:00）。 */
function toBusinessElapsed(minutes: number): number {
  return (minutes - DAY_START_HOUR * 60 + 1440) % 1440;
}

export type ScheduleWindowStatus = 'off' | 'onDuty' | 'before' | 'after';

/**
 * 出勤の開始・終了時刻（"HH:MM"）と現在時刻から、営業日内での前後を判定する。
 * 5時始まりの経過分で比較するため、深夜0〜5時に前日の昼帯シフトが
 * 「終了済み（after）」と正しく判定される。終了 <= 開始の場合は深夜またぎとして扱う。
 */
export function getScheduleWindowStatus(
  startTime: string | null,
  endTime: string | null
): ScheduleWindowStatus {
  if (!startTime || !endTime) return 'off';

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMin = sh * 60 + (sm || 0);
  const endMin   = eh * 60 + (em || 0);

  const startE = toBusinessElapsed(startMin);
  let   endE   = toBusinessElapsed(endMin);
  if (endE <= startE) endE += 1440;            // 深夜またぎ（翌日の5時以降まで）

  const nowE = toBusinessElapsed(getNowJSTMinutes());

  if (nowE >= startE && nowE <= endE) return 'onDuty';
  return nowE < startE ? 'before' : 'after';
}

export type DutyStatus = 'before' | 'onDuty' | 'after';

export function checkDutyStatus(workHours: string): {
  isOnDuty: boolean;
  startHourStr: string;
  status: DutyStatus;
} {
  const fallback = { isOnDuty: false, startHourStr: '12:00', status: 'before' as DutyStatus };

  if (!workHours) return fallback;

  // 1. 波線を統一してから分割
  const normalized = workHours.replace(/〜/g, '-').replace(/～/g, '-').replace(/~/g, '-');
  if (!normalized.includes('-')) return fallback;

  const [startRaw, endRaw] = normalized.split('-');
  const startHourStr = startRaw.trim();
  const endClean = endRaw.replace(/翌/g, '').trim();

  // 5時始まりの経過分で前後を判定（深夜またぎ・前日昼帯の終了も正しく扱う）
  const window = getScheduleWindowStatus(startHourStr, endClean);
  const status: DutyStatus = window === 'onDuty' ? 'onDuty' : window === 'after' ? 'after' : 'before';

  return { isOnDuty: window === 'onDuty', startHourStr, status };
}
