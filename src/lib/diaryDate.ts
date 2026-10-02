// 写メ日記の更新日付の共通フォーマット。
// 「06/25」（MM/DD・ゼロ埋め・JST）で返す。年と「更新」は付けない（呼び出し側でも付けない）。
// 写メ日記の日付表示は全箇所このヘルパーに集約する。
export function formatDiaryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit',
  }).format(d);
}

// ★ 第1091便（2026-10-02・カッキーさん）: 投稿してすぐの写メ日記は、日付ではなく「◯分前」「◯時間前」で出す。
//   1分未満＝「たった今」／60分未満＝「◯分前」／24時間未満＝「◯時間前」／それ以降＝null（呼ぶ側が日付を出す）。
//   ★ Date.now() をこの中で呼ばない（今の時刻は呼ぶ側が渡す。ISR に焼き付けない・点検で時刻を作れるように）。
const DIARY_AGE_WINDOW_MIN = 24 * 60;

export function formatDiaryAge(iso: string, nowMs: number): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || !Number.isFinite(nowMs)) return null;
  const min = Math.floor((nowMs - t) / 60_000);
  if (min >= DIARY_AGE_WINDOW_MIN) return null;
  if (min < 1) return 'たった今'; // 端末の時計が少し遅れていて未来に見える場合もここ
  if (min < 60) return `${min}分前`;
  return `${Math.floor(min / 60)}時間前`;
}
