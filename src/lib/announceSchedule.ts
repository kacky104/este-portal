// フクエスお知らせの自動投稿を「決めた時刻」で出す（第1965便・2026-11-12・カッキーさん）。
//
// ★★★ このファイルは通信もDBも触らない。時刻も引数で受ける（announceAuto.ts と同じ理由＝点検で時刻を作れる）。
//
// ★ 何が変わったか（カッキーさんの決定）
//   ・今まで: 自動は全店「1日1回・お店ごとに決まった時刻」。手動と自動を合わせて1日5回まで。手で投稿した日は自動を出さない
//   ・コネックエフで時刻を設定して ON にした店だけ:
//       タイマー更新（時間帯と間隔）か、時刻指定更新（時刻を並べる）で出す。
//       手動と自動を【合わせて1日10回】まで（朝6時に戻る）。手で投稿した日も、決めた時刻の自動はそのまま出す
//   ・設定していない店・OFF の店は、今までどおり（announceAuto.ts の shouldAutoPost）
// ★ 「どの回か」の決め方は上位表示と同じ（ekichikaBump.ts の currentBumpSlotAt）。
//   出した回の始まりを slot_done_at に書き、同じ回では2度出さない。
// ★ 周は10分ごと（VPS の crontab）。出るのは決めた時刻から10分以内。

import { currentBumpSlotAt, bumpSlotsPerDay, isCustomBumpInterval, normalizeBumpTimes } from './ekichikaBump';
import { isValidMinuteOfDay } from './bumpAuto';
import { nextRotationIndex } from './announceAuto';

/** ふつうの店: 手動と自動を合わせて1日5回まで（第500便） */
export const ANNOUNCE_DAILY_LIMIT = 5;
/** コネックエフで時刻を設定して ON にした店: 手動と自動を合わせて1日10回まで */
export const ANNOUNCE_SCHEDULE_DAILY_LIMIT = 10;
/** 設定で作れる自動の回数（1日）。上限と同じ */
export const ANNOUNCE_SCHEDULE_MAX_PER_DAY = 10;
/** タイマー更新の間隔の選択肢（分）。ほかの分数は「入力…」で 10〜240分 */
export const ANNOUNCE_SCHEDULE_INTERVAL_CHOICES = [60, 90, 120, 180, 240] as const;
export const ANNOUNCE_SCHEDULE_DEFAULT = { startMin: 600, endMin: 1320, intervalMin: 120 } as const;   // 10:00〜22:00・120分ごと＝7回

export function announceDailyLimit(scheduleOn: boolean): number {
  return scheduleOn ? ANNOUNCE_SCHEDULE_DAILY_LIMIT : ANNOUNCE_DAILY_LIMIT;
}
export function announceLimitMessage(limit: number): string {
  return `本日のお知らせ投稿は${limit}回までです（毎朝6時にリセットされます）`;
}

export type AnnounceScheduleSetting = { enabled: boolean; startMin: number; endMin: number; intervalMin: number; times: number[] | null };

/** DB の行から設定を作る。読めない値のときは null（★ 推測で埋めない） */
export function announceScheduleFromRow(row: { enabled?: unknown; start_min?: unknown; end_min?: unknown; interval_min?: unknown; times?: unknown } | null | undefined): AnnounceScheduleSetting | null {
  if (!row) return null;
  const s: AnnounceScheduleSetting = {
    enabled: row.enabled === true,
    startMin: Number(row.start_min), endMin: Number(row.end_min), intervalMin: Number(row.interval_min),
    times: normalizeBumpTimes(row.times),
  };
  return validateAnnounceSchedule(s) === null ? s : null;
}

/** 設定として正しいか。だめなら店舗様に見せる文、よければ null */
export function validateAnnounceSchedule(s: AnnounceScheduleSetting): string | null {
  if (s.times && s.times.length > 0) {
    if (!s.times.every((t) => isValidMinuteOfDay(t))) return '読めない時刻があります';
    if (s.times.length > ANNOUNCE_SCHEDULE_MAX_PER_DAY) return `時刻は${ANNOUNCE_SCHEDULE_MAX_PER_DAY}個までです（いま ${s.times.length}個）`;
    return null;
  }
  if (!isValidMinuteOfDay(s.startMin) || !isValidMinuteOfDay(s.endMin) || s.startMin === s.endMin) return '時間帯の値が正しくありません';
  if (!isCustomBumpInterval(s.intervalMin)) return '間隔は10〜240分の数字で入れてください';
  const perDay = bumpSlotsPerDay(s);
  if (perDay > ANNOUNCE_SCHEDULE_MAX_PER_DAY) return `この設定だと1日${perDay}回になります。お知らせは1日${ANNOUNCE_SCHEDULE_MAX_PER_DAY}回までなので、間隔を広げるか、時間帯を短くしてください`;
  return null;
}

/** その設定で1日に自動で出す回数 */
export function announceSchedulePerDay(s: AnnounceScheduleSetting): number {
  return bumpSlotsPerDay(s);
}

export type ScheduleSkipReason =
  | 'off'              // 自動を止めている
  | 'unknown'          // 材料が読めていない（0件と混ぜない）
  | 'no_targets'       // 「自動投稿」の印が付いた公開中のお知らせが0件
  | 'out_of_window'    // いまは出す時刻ではない
  | 'done_this_slot'   // この回はもう出した（設定を保存した回も、次の回から）
  | 'limit';           // 今日は10回に達している

export type SchedulePostResult =
  | { post: false; reason: ScheduleSkipReason }
  | { post: true; reason: null; slotAt: string; index: number };

/** この瞬間に、決めた時刻の自動投稿を出すか */
export function shouldSchedulePost(input: {
  now: Date;
  setting: AnnounceScheduleSetting | null;
  /** 出した最後の回の始まり（ISO）。まだ無ければ null */
  slotDoneAt: string | null;
  /** 「自動投稿」の印が付いた公開中のお知らせの本数。null＝数えられていない */
  autoTargetCount: number | null;
  /** 今日（朝6時から）出した回数（手動＋自動）。null＝読めていない → 止めない（第500便と同じ） */
  usedToday: number | null;
  rotationIndex: number | null;
}): SchedulePostResult {
  const no = (reason: ScheduleSkipReason): SchedulePostResult => ({ post: false, reason });
  const s = input.setting;
  if (!s) return no('unknown');
  if (!s.enabled) return no('off');
  if (input.autoTargetCount === null || !Number.isFinite(input.autoTargetCount)) return no('unknown');
  if (input.autoTargetCount <= 0) return no('no_targets');
  const slotAt = currentBumpSlotAt(input.now, s);
  if (!slotAt) return no('out_of_window');
  if (input.slotDoneAt) {
    const done = Date.parse(input.slotDoneAt);
    if (!Number.isFinite(done)) return no('unknown');
    if (done >= Date.parse(slotAt)) return no('done_this_slot');
  }
  if (input.usedToday !== null && input.usedToday >= ANNOUNCE_SCHEDULE_DAILY_LIMIT) return no('limit');
  return { post: true, reason: null, slotAt, index: nextRotationIndex(input.rotationIndex, input.autoTargetCount) };
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 画面に出す1行（決めた時刻で動いている店） */
export function announceScheduleMessage(s: AnnounceScheduleSetting, targetCount: number | null): string {
  const how = s.times && s.times.length > 0
    ? `時刻指定更新（${s.times.map(hhmm).join('・')}）`
    : `タイマー更新（${hhmm(s.startMin)}〜${hhmm(s.endMin)}・${s.intervalMin}分ごと）`;
  if (targetCount === null) return `${how}で自動投稿します（お知らせの本数を読み取れていません）`;
  if (targetCount <= 0) return `${how}に設定されていますが、「自動投稿」にしたお知らせがありません（下の一覧で「自動投稿にする」を押してください）`;
  return `${how}で、1日${announceSchedulePerDay(s)}回・順番に自動投稿します（自動投稿設定${targetCount}件）`;
}
