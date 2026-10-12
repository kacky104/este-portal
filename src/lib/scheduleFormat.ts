// 出勤スケジュール表示の整形ヘルパー（ピュア関数・サーバー/クライアント共用）。
// 本体 /therapist/[id] と fukuX /x/u/[handle] の7日間スケジュールで共有し、二重メンテを避ける。

/**
 * "YYYY-MM-DD" を "M/D(曜)" に整形。
 *
 * ★★★ 2026-09-09: 実行環境の時間帯に左右されない形に直した（第224便）。
 *   ★ 旧: `new Date(dateStr + 'T00:00:00+09:00')` を作ってから getMonth()/getDate()/getDay()
 *     ＝【ローカル時刻】で読み出していた。ブラウザ（JST）は正しいが、
 *     ★ サーバー（Vercel＝UTC）では JST 0:00 が前日15:00 として読まれ、**日付が1日前**になっていた。
 *   ★ 症状: /therapist/[id] の「出勤スケジュール（7日間）」が、中身は今日ぶんなのに
 *     見出しの日付だけ1日ずれて出る（例: 9/9 の並びが 9/8 始まりに見える）。
 *   ★ 直し方: 文字列をそのまま数字にして使い、曜日だけ UTC で求める（Date のローカル読み出しをしない）。
 */
export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${weekday})`;
}

/** "HH:MM"（や "H:MM"）を "H:MM" 表示に整形。空は ""。 */
export function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m || 0)}`;
}

/** 出勤日の区切り（朝6時・lib/dutyStatus.ts の DAY_START_HOUR と同じ）。★ これより前に始まる出勤は「翌」 */
export const SHIFT_DAY_START_MIN = 6 * 60;

/**
 * 出勤の開始・終了に「翌」を付けるか（第1409便・2026-10-12・カッキーさん「揃えます」）。
 *   ・開始が朝6時より前（00:00〜05:30）… 開始も終了も「翌」（出勤の入力は 06:00〜翌05:30 から選ぶ＝その日の営業日の翌0時台）
 *   ・終了が開始以前（深夜またぎ 21:00〜翌03:00）… 終了だけ「翌」
 *   ★ 時刻の読み方は lib/booking/slots.ts の scheduleWindowUtc（第1408便）と同じ。
 */
export function shiftNextDayMarks(start: string | null, end: string | null): { start: boolean; end: boolean } {
  const toMin = (t: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const s = toMin(start), e = toMin(end);
  if (s === null) return { start: false, end: false };
  const startNext = s < SHIFT_DAY_START_MIN;
  return { start: startNext, end: startNext || (e !== null && e <= s) };
}

/** "20:00〜翌02:00"・"翌00:00〜翌05:00"（時刻の文字はそのまま使う）。★ どちらか無ければ空文字 */
export function shiftRangeText(start: string | null, end: string | null, sep = '〜'): string {
  if (!start || !end) return '';
  const k = shiftNextDayMarks(start, end);
  return `${k.start ? '翌' : ''}${start}${sep}${k.end ? '翌' : ''}${end}`;
}

/** 開始・終了から "H:MM〜H:MM" を作る。深夜またぎは終了に、朝6時より前の開始は両方に「翌」を付与（第1409便）。 */
export function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const k = shiftNextDayMarks(start, end);
  return `${k.start ? '翌' : ''}${sh}:${pad(sm || 0)}〜${k.end ? '翌' : ''}${eh}:${pad(em || 0)}`;
}
