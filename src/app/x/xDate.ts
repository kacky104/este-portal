// fukuX 開始日（= x_profiles.created_at）の表示整形。純関数＝クライアント/サーバー両方で安全。
// UTC の created_at を日本時間（Asia/Tokyo）に直し、「📅YYYY年M月D日」（ゼロ埋めなし）で返す。
export function formatFukuxStartDate(createdAt: string | null): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  }).format(d); // 例: "2026年6月30日"
  return `📅${formatted}`;
}
