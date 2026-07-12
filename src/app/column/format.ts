// 本体コラム公開ページ共通：published_at / updated_at の表示整形（JST・日付のみ）。
// ワーク側 jobs/column/format.ts と同一実装（サイト間の相互依存を避けるため複製）。
export function formatColumnDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}
