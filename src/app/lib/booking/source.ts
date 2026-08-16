// 予約の「入り口」を表す値（2026-08-16 / 第17便 追加）。salon_bookings.source に保存する。
//
// ★ この2値は DB 側の CHECK 制約と対になっている
//   （supabase/migrations/20260816_salon_bookings_source.sql）。
//   値を増やす（例：LINE予約を別扱いにする）ときは
//     ① この定数  ② DB の salon_bookings_source_check  ③ getSalonBookings() の絞り込み
//   の3か所を同時に直すこと。どれか1つを忘れると、片方は INSERT できず、
//   もう片方は一覧から静かに消える。
//
// ★ どちらの経路で入ったかは、あとから列の値で復元できない。
//   status は運用で変わり、callback_pref の未選択はどちらも 'none'、
//   course_name も手入力でコース名を書けば同じになる。だから列で持つ。
//
// ★ 定数を booking.ts 側に置かないこと。あちらは 'use server' で、
//   export が全部 async 関数である必要がある（limits.ts と同じ理由）。

/** お客様が /salon/[id]/book のフォームから入れた予約。店へ通知メールが飛ぶ。 */
export const BOOKING_SOURCE_WEB = 'web';

/** オーナーが /mypage の予約ボードに直接書いた予約（電話予約など）。メールは飛ばない。 */
export const BOOKING_SOURCE_MANUAL = 'manual';

export type BookingSource = typeof BOOKING_SOURCE_WEB | typeof BOOKING_SOURCE_MANUAL;
