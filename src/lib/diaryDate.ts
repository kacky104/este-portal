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
