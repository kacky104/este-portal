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

  // 3. Intl API で現在の日本時間を取得
  const options = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const jstString = new Intl.DateTimeFormat('ja-JP', options).format(new Date());
  const [currentHour, currentMinute] = jstString.split(':').map(Number);
  const now = currentHour * 60 + currentMinute;

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
