// 在籍セラピスト一覧の表示順（2026-08-22 第27便）。
//
// ★ このファイルはサーバー・クライアントの両方から import される。
//   components/SalonTherapists.tsx（'use client'）に置くと、サーバー専用の
//   lib/salonTherapists.ts が import した時点でクライアントモジュール一式が
//   ビルドに巻き込まれ、`supabaseUrl is required` でビルドが落ちる（2026-08-22 実測）。
//   そのため型と純粋関数だけをここに切り出す。Supabase も React も import しないこと。
//
// 並び順:
//   1. 写真あり × 今すぐ（残り時間の少ない順）
//   2. 写真あり × 出勤中・出勤予定（開始時間が早い順）
//   3. 写真あり × 受付終了
//   4. 写真あり × 本日お休み
//   5. 写真なし（同グループ内は同じく出勤状況順）
//
// 写真の有無を最上位のキーにしているのは、掲載直後で写真が未登録の子が一覧の先頭を
// 占めると「準備中の店」に見えてしまうため（2026-08-22 アイリス145名の登録時に判明）。
import { getScheduleWindowStatus } from '@/lib/dutyStatus';
import { isImasuguLiveCamel, imasuguUntilCamel } from '@/lib/imasugu';

/** 並び替えに必要な最小限の形（Therapist はこれを満たす）。 */
export type SortableTherapist = {
  profileImageUrl: string | null;
  today: { is_active: boolean; start_time: string | null; end_time: string | null };
  isAvailableNow: boolean;
  availableUntil: string | null;
  isAvailableNowCast: boolean;
  availableUntilCast: string | null;
};

/** 出勤状況のランク（0=今すぐ / 1=出勤中・出勤予定 / 2=受付終了 / 3=お休み）。 */
export function dutyRank(t: SortableTherapist): number {
  if (isImasuguLiveCamel(t)) return 0;
  if (!t.today.is_active || !t.today.start_time || !t.today.end_time) return 3;
  const w = getScheduleWindowStatus(t.today.start_time, t.today.end_time);
  if (w === 'onDuty' || w === 'before') return 1;
  if (w === 'after') return 2;
  return 3;
}

/** 同一ランク内の細かい並び（今すぐ=残り時間昇順 / 出勤=開始時刻昇順）。 */
export function sameRankOrder<T extends SortableTherapist>(rank: number, a: T, b: T): number {
  if (rank === 0) return imasuguUntilCamel(a) - imasuguUntilCamel(b);
  if (rank === 1) {
    const sa = a.today.start_time ?? '99:99';
    const sb = b.today.start_time ?? '99:99';
    return sa.localeCompare(sb);
  }
  return 0;
}

/**
 * 写真の有無（0=あり / 1=なし）。並び替えのキーに使う。
 * ★ どのブロックでも「写真なしは後ろ」に揃える。イニシャル代替のカードが
 *   先頭に並ぶと店全体が準備中に見えるため（2026-08-22 オーナー指摘）。
 */
export function photoRank(t: { profileImageUrl: string | null }): number {
  return t.profileImageUrl ? 0 : 1;
}

/** 在籍一覧用の並べ替え（写真あり優先 → 出勤状況）。元配列は壊さない。 */
export function sortSalonTherapists<T extends SortableTherapist>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const pa = photoRank(a), pb = photoRank(b);
    if (pa !== pb) return pa - pb;          // 写真あり(0) が先
    const ra = dutyRank(a), rb = dutyRank(b);
    if (ra !== rb) return ra - rb;
    return sameRankOrder(ra, a, b);
  });
}
