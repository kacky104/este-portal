// 1日（営業日）の始まりを午前6時とする。深夜営業のサロンに対応するため、
// 午前0:00〜5:59 は「前日」のスケジュールを参照する。
export const DAY_START_HOUR = 6;

/**
 * 現在の日本時間を基準に、「営業日」を YYYY-MM-DD 形式で返す。
 * JST が午前6時より前の場合は前日扱いとする。
 * @param offsetDays 営業日からのオフセット日数（0=当日, 1=翌営業日 ...）
 */
/**
 * ★★★ 営業日の正本（第150便・2026-09-05）。★ 時刻を【受け取る】ので、テストできる。
 *
 * ★★ なぜ分けたか
 *   これまで「営業日」を知る道は getBusinessDateJST（`new Date()` を内側で読む）しか無く、
 *   ★ 純粋関数からは呼べなかった。★ その結果、他媒体へ送る段が
 *     `new Date(Date.now() + 9h).toISOString().slice(0,10)`（＝暦日・0時切替）を
 *     **その場で書いて**いた。★ フクエス全体の決めごとから、そこだけ外れていた。
 *   ★★★ 2026-09-05 に実測: エステ魂の出勤表の1日目は【営業日】。
 *     深夜0:01〜5:01 の周が6回とも「1日目が今日と違う」で止まっていた（第112便の記録より）。
 *
 * @param epochMs 判定したい時刻（ミリ秒）
 */
export function businessDateJSTFrom(epochMs: number): string {
  // JST に寄せてから UTC の読み出しで日付と時を取る（★ 実行環境の時間帯に左右されない）
  const jst = new Date(epochMs + 9 * 60 * 60 * 1000);
  const shift = jst.getUTCHours() < DAY_START_HOUR ? -1 : 0;
  const base = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + shift);
  return base.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' の n 日後。★ 月またぎは UTC 正午基準で加減算する */
export function addBusinessDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function getBusinessDateJST(offsetDays = 0): string {
  // ★ 正本は businessDateJSTFrom。★ ここは「いま」を渡すだけにする（決め方を2か所に書かない）
  return addBusinessDays(businessDateJSTFrom(Date.now()), offsetDays);
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

/** 0時起点の分を「営業日（午前6時始まり）の経過分」に変換する（0 = 06:00）。 */
function toBusinessElapsed(minutes: number): number {
  return (minutes - DAY_START_HOUR * 60 + 1440) % 1440;
}

export type ScheduleWindowStatus = 'off' | 'onDuty' | 'before' | 'after';

/**
 * 出勤の開始・終了時刻（"HH:MM"）と現在時刻から、営業日内での前後を判定する。
 * 6時始まりの経過分で比較するため、深夜0〜6時に前日の昼帯シフトが
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
  if (endE <= startE) endE += 1440;            // 深夜またぎ（翌日の6時以降まで）

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

  // 6時始まりの経過分で前後を判定（深夜またぎ・前日昼帯の終了も正しく扱う）
  const window = getScheduleWindowStatus(startHourStr, endClean);
  const status: DutyStatus = window === 'onDuty' ? 'onDuty' : window === 'after' ? 'after' : 'before';

  return { isOnDuty: window === 'onDuty', startHourStr, status };
}
