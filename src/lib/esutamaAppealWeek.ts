// エステ魂の集客ワンクリックアピールの「曜日ごとの時刻指定」（第2048便・2026-11-28・オイルクエスト様のご要望・カッキーさん）。★ 純粋関数だけ。
//
// ★ 行（店舗情報・クーポン情報・お店体験談）ごとに、月〜日それぞれ時刻を最大10個（エステ魂は行ごとに1日10回）。
// ★ 曜日は「朝6時はじまりの1日」で数える（エステ魂の回数が戻る時刻・フクエスCRM の営業日と同じ）。
//   月曜の深夜1:00 の回は「月曜」の欄に入れる（＝暦では火曜の1:00）。
// ★ その曜日の欄が空なら、今までの設定（毎日同じ時刻指定／タイマー更新）で押す。
// ★ 表は conecf_esutama_appeal_rows.week_times（jsonb・追加SQL_第2048便）。{ mon: [600, 726], tue: [...], ... }（0時からの分）
import { normalizeBumpTimes } from './ekichikaBump';

export const APPEAL_WEEK_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type AppealWeekKey = (typeof APPEAL_WEEK_KEYS)[number];
export const APPEAL_WEEK_LABEL: Record<AppealWeekKey, string> = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' };
/** 1日に入れられる時刻の数（エステ魂は行ごとに1日10回） */
export const APPEAL_WEEK_TIMES_MAX = 10;
/** 1日のはじまり（朝6時） */
export const APPEAL_DAY_START_MIN = 6 * 60;

export type AppealWeekTimes = Partial<Record<AppealWeekKey, number[]>>;

/** 表や画面から来た値をそろえる（曜日ごとに 0〜1439 の整数・重複なし・時刻順・10個まで。空の曜日は入れない） */
export function normalizeAppealWeekTimes(raw: unknown): AppealWeekTimes {
  const out: AppealWeekTimes = {};
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const k of APPEAL_WEEK_KEYS) {
    const t = normalizeBumpTimes(o[k]);
    if (t && t.length > 0) out[k] = t.slice(0, APPEAL_WEEK_TIMES_MAX);
  }
  return out;
}

export function hasAppealWeekTimes(w: AppealWeekTimes): boolean {
  return APPEAL_WEEK_KEYS.some((k) => (w[k]?.length ?? 0) > 0);
}

/** いまの「朝6時はじまりの1日」の曜日 */
export function appealBusinessWeekKey(now: Date): AppealWeekKey {
  const j = new Date(now.getTime() + 9 * 3600 * 1000 - APPEAL_DAY_START_MIN * 60000);
  const dow = j.getUTCDay(); // 0=日
  return APPEAL_WEEK_KEYS[(dow + 6) % 7];
}

/** きょう（朝6時はじまり）に使う時刻指定。曜日の欄が空なら fallback（毎日同じ時刻／null＝タイマー更新） */
export function appealTimesForNow(now: Date, week: AppealWeekTimes, fallback: number[] | null): number[] | null {
  const t = week[appealBusinessWeekKey(now)];
  return t && t.length > 0 ? t : fallback;
}
