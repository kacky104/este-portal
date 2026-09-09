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

/** 開始・終了から "H:MM〜H:MM" を作る。終了が開始より小さい（深夜またぎ）なら終了に「翌」を付与。 */
export function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const prefix = (eh * 60 + (em || 0)) < (sh * 60 + (sm || 0)) ? '翌' : '';
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}
