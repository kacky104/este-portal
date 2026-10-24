// ★ 第1625便: 「ネット予約を受け付けているか」の判定（受付ON＋有効な予約コースが1つ以上）。
//   店舗詳細（page.tsx）とサブページ共通の追従バナー（layout.tsx）で同じ判定を使う。
//   コースの判定は /salon/[id]/book の parseBookingCourses と同じ条件。
export function isSalonBookable(bookingEnabled: unknown, bookingCourses: unknown): boolean {
  return Boolean(bookingEnabled) && Array.isArray(bookingCourses) &&
    (bookingCourses as Record<string, unknown>[]).some((c) => {
      const d = Number(c?.duration_min);
      return String(c?.name ?? '').trim() !== '' && Number.isInteger(d) && d > 0;
    });
}
