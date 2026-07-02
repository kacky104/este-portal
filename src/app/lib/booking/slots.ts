// ネット予約の枠計算ユーティリティ（サーバー側専用・純ロジック）。
//
// 時刻の扱い：
//  - therapist_schedules.start_time / end_time は "HH:MM" 文字列（JSTの壁掛け時計時刻）。
//  - schedule_date は "YYYY-MM-DD"（JSTの日付）。
//  - salon_bookings.slot_start / slot_end は timestamptz（UTC）。
//  すべて UTC の絶対時刻（epoch ms）に正規化してから比較し、表示ラベルのみ JST に整形する。
//  これにより 9時間ズレを防ぐ。

export const SLOT_STEP_MIN = 15;   // 枠の刻み（分）
export const LEAD_TIME_MIN = 60;   // 直前予約ガード：現在＋この分数以内の枠は不可（TEL誘導）

export type SlotState = 'past' | 'tel' | 'full' | 'open';
export type Slot = { startISO: string; label: string; state: SlotState };

// "HH:MM" → 0時からの経過分。
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// "YYYY-MM-DD" を dayOffset 日ずらした日付文字列（月跨ぎを UTC 正午基準で正しく処理）。
function shiftDate(dateStr: string, dayOffset: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, mo - 1, d));
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * "YYYY-MM-DD" + "HH:MM" を JST の壁掛け時計時刻として解釈し、UTC の Date を返す。
 * dayOffset=1 で翌日（日跨ぎの end 側などに使用）。
 */
export function jstWallToUtc(dateStr: string, hhmm: string, dayOffset = 0): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const day = dayOffset === 0 ? dateStr : shiftDate(dateStr, dayOffset);
  const iso = `${day}T${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00+09:00`;
  return new Date(iso);
}

/**
 * 出勤日の start/end（"HH:MM"）から、出勤枠の UTC 開始・終了を返す。
 * end <= start のときは翌日跨ぎ（例 "18:00"〜"02:00"）として end を翌日で計算する。
 */
export function scheduleWindowUtc(
  dateStr: string,
  start: string,
  end: string,
): { startUtc: Date; endUtc: Date } {
  const startUtc = jstWallToUtc(dateStr, start, 0);
  const endDayOffset = toMin(end) <= toMin(start) ? 1 : 0;
  const endUtc = jstWallToUtc(dateStr, end, endDayOffset);
  return { startUtc, endUtc };
}

// UTC の Date を JST の "HH:MM" ラベルへ。
function formatJstHHMM(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

/**
 * 空き枠を生成する。
 * - 出勤 start〜end を 15分刻みで列挙し、各 slotStart に slotEnd = slotStart + courseMin を割り当てる。
 * - 状態タグ：
 *    slotStart <= now                    → 'past'（非表示）
 *    now < slotStart <= now + LEAD_TIME   → 'tel'（TEL表示・選択不可）
 *    上記以外で「コースが収まらない」or「既存予約と重なる」→ 'full'（×・選択不可）
 *    空いている                           → 'open'（選択可）
 */
export function buildSlots(params: {
  scheduleDate: string;
  start: string;
  end: string;
  existingBookings: { slot_start: string; slot_end: string }[];
  courseMin: number;
  now: Date;
}): Slot[] {
  const { scheduleDate, start, end, existingBookings, courseMin, now } = params;
  const { startUtc, endUtc } = scheduleWindowUtc(scheduleDate, start, end);

  const bookings = existingBookings.map((b) => ({
    start: new Date(b.slot_start).getTime(),
    end: new Date(b.slot_end).getTime(),
  }));

  const nowMs = now.getTime();
  const leadCutoff = nowMs + LEAD_TIME_MIN * 60 * 1000;
  const stepMs = SLOT_STEP_MIN * 60 * 1000;
  const courseMs = courseMin * 60 * 1000;
  const endMs = endUtc.getTime();

  const slots: Slot[] = [];
  for (let t = startUtc.getTime(); t < endMs; t += stepMs) {
    const slotStart = t;
    const slotEnd = t + courseMs;
    const label = formatJstHHMM(new Date(slotStart));

    let state: SlotState;
    if (slotStart <= nowMs) {
      state = 'past';
    } else if (slotStart <= leadCutoff) {
      state = 'tel';
    } else {
      const fits = slotEnd <= endMs; // コースが出勤終了内に収まるか
      const overlaps = bookings.some((b) => slotStart < b.end && slotEnd > b.start);
      state = !fits || overlaps ? 'full' : 'open';
    }
    slots.push({ startISO: new Date(slotStart).toISOString(), label, state });
  }
  return slots;
}
