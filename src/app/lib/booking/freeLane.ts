// ★ 第1788便（カッキーさん・2026-11-08）: フリー（担当未定）の予約は、同じ時間帯に3件まで。
//   CRM のスケジュールのフリーの行が3行まで（第1786便）なのに合わせた。グループ予約（第1787便）で担当未定の方が重なるため。
//   ★ 数え方: その予約の時間帯に少しでも重なるフリーの予約（キャンセルを除く）が3件あれば、4件目は入れない。
//   ★ DB 側の「フリーは同じ開始時刻に1件」の一意索引（salon_bookings_free_slot_uniq）は、追加SQL_第1788便で外す。
export const FREE_LANE_MAX = 3;

/** 重なりを見るとき、何件あったら断るか（担当ありは1件・フリーは FREE_LANE_MAX 件） */
export function overlapLimit(therapistId: number | null): number {
  return therapistId === null ? FREE_LANE_MAX : 1;
}
