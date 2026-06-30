// 出勤スケジュール表示の整形ヘルパー（ピュア関数・サーバー/クライアント共用）。
// 本体 /therapist/[id] と fukuX /x/u/[handle] の7日間スケジュールで共有し、二重メンテを避ける。

/** "YYYY-MM-DD" を "M/D(曜)" に整形（JST固定）。 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${weekday})`;
}

/** "HH:MM"（や "H:MM"）を "H:MM" 表示に整形。空は ""。 */
export function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m || 0)}`;
}

/** 開始・終了から "H:MM〜H:MM" を作る。終了が開始より小さい（深夜またぎ）なら終了に「翌」を付与。 */
export function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const prefix = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0)) ? '翌' : '';
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}
