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
  const isOvernightShift = endRaw.includes('翌');

  // 2. 時と分を数字にする
  const [startHour, startMin] = startHourStr.split(':').map(Number);
  const [endHour, endMin] = endClean.split(':').map(Number);

  const startInMinutes = startHour * 60 + (startMin || 0);
  const endInMinutes = endHour * 60 + (endMin || 0);

  // 3. 現在の日本時間を取得（sv-SE ロケールで HH:MM 形式を保証）
  const nowDate = new Date();
  const jstHour   = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(nowDate));
  const jstMinute = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', minute: '2-digit' }).format(nowDate));
  const now = jstHour * 60 + jstMinute;

  // 4. 判定
  let isOnDuty: boolean;
  let status: DutyStatus;

  if (isOvernightShift || endInMinutes < startInMinutes) {
    // 深夜またぎシフト: 開始以降 OR 終了以前 → 出勤中
    isOnDuty = now >= startInMinutes || now <= endInMinutes;
    // 出勤時間外はすべて「これから始まるシフト」として before 扱い
    status = isOnDuty ? 'onDuty' : 'before';
  } else {
    // 通常シフト
    isOnDuty = now >= startInMinutes && now <= endInMinutes;
    if (isOnDuty) {
      status = 'onDuty';
    } else if (now < startInMinutes) {
      status = 'before';
    } else {
      status = 'after';
    }
  }

  return { isOnDuty, startHourStr, status };
}
