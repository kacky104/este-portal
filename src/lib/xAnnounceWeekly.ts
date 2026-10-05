// ★ 第1189便（2026-10-05・カッキーさん）: お店のお知らせ（新着情報）を、週に1回、そのお店のフクエックスの店舗アカウントへ
//   自動で投稿する周（/api/admin/x-announce-weekly）の【いつ・どれを出すか】の判断。
//   ★ ここは純粋関数だけ（DB を読まない）。配線は route.ts。★ 画面の案内（マイページ）も同じ関数から作る。
//
// ★ 決めごと（カッキーさん）
//   ・出すのは「自動投稿」に印の付いた、公開中のお知らせ。週ごとに1本ずつ順番に。
//   ・対象は、フクエックスの店舗アカウントを開設していて、印の付いたお知らせがあるお店すべて（店舗様の設定は無い）。
//   ・曜日と時刻はお店ごとにばらばら。★ 店舗IDから決まる（選べない・設定項目を増やさない。お知らせの自動投稿と同じ考え方）。
//     曜日＝7つに散らす ／ 時刻＝10:00〜21:50 の10分きざみ（★ 夜中・早朝には出さない）。
//   ・週は月曜0時（JST）から。その週の時刻を過ぎてから3時間のあいだに回った周が出す。
//     ★ 3時間を過ぎていたら、その週は出さない（＝あとから対象になったお店が、夜中にいきなり投稿されない）。
import { nextRotationIndex } from '@/lib/announceAuto';

const JST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;
/** 時刻を過ぎてから、この時間のあいだだけ出す */
export const X_WEEKLY_WINDOW_MS = 3 * 3_600_000;
const FIRST_MINUTE = 10 * 60; // 10:00
const SLOT_MINUTES = 10;
const SLOT_COUNT = 72;        // 10:00〜21:50
const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

/** その時刻が属する週の、月曜0時（JST）のミリ秒 */
export function xWeekStartMs(now: Date): number | null {
  const t = now.getTime();
  if (!Number.isFinite(t)) return null; // ★ 読めない時刻を推測で埋めない
  const j = new Date(t + JST_OFFSET_MS);
  const dow = (j.getUTCDay() + 6) % 7; // 月=0 … 日=6
  return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - dow * DAY_MS - JST_OFFSET_MS;
}

/** 週の名前＝その週の月曜（JST）の 'YYYY-MM-DD'。★ DB の x_last_week と同じ形。 */
export function xWeekKey(now: Date): string | null {
  const ws = xWeekStartMs(now);
  return ws === null ? null : new Date(ws + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** そのお店の曜日（月=0 … 日=6）と時刻（0時からの分）。店舗IDから決まる。 */
export function xWeeklySlot(salonId: number): { weekday: number; minuteOfDay: number } | null {
  if (!Number.isFinite(salonId)) return null;
  const id = Math.abs(Math.trunc(salonId));
  return { weekday: (id * 3) % 7, minuteOfDay: FIRST_MINUTE + ((id * 37) % SLOT_COUNT) * SLOT_MINUTES };
}

/** 「毎週金曜 11:00ごろ」 */
export function xWeeklyLabel(salonId: number): string | null {
  const s = xWeeklySlot(salonId);
  if (!s) return null;
  const hh = String(Math.floor(s.minuteOfDay / 60)).padStart(2, '0');
  const mm = String(s.minuteOfDay % 60).padStart(2, '0');
  return `毎週${WEEKDAY_LABELS[s.weekday]}曜 ${hh}:${mm}ごろ`;
}

export type XWeeklySkipReason =
  | 'unknown'        // ★ 材料が読めていない。0件と混ぜない
  | 'no_targets'     // 印の付いたお知らせが0件
  | 'done_this_week' // 今週ぶんはもう出した
  | 'not_yet'        // まだこの店の曜日・時刻になっていない
  | 'missed';        // 時刻から3時間を過ぎた（今週は出さない）

export type XWeeklyResult =
  | { post: false; reason: XWeeklySkipReason; weekKey: string | null; index: null; dueAtISO: string | null }
  | { post: true; reason: null; weekKey: string; index: number; dueAtISO: string };

export function shouldPostXWeekly(input: {
  now: Date;
  salonId: number;
  /** 印の付いた公開中のお知らせの本数。読めていないときは null */
  targetCount: number | null;
  /** 最後に出した週（月曜の 'YYYY-MM-DD'）。まだ無ければ null */
  lastWeek: string | null;
  rotationIndex: number | null;
}): XWeeklyResult {
  const NO = (reason: XWeeklySkipReason, weekKey: string | null, dueAtISO: string | null): XWeeklyResult =>
    ({ post: false, reason, weekKey, index: null, dueAtISO });
  const ws = xWeekStartMs(input.now);
  const weekKey = xWeekKey(input.now);
  const slot = xWeeklySlot(input.salonId);
  if (ws === null || weekKey === null || slot === null) return NO('unknown', weekKey, null);
  const dueMs = ws + slot.weekday * DAY_MS + slot.minuteOfDay * 60_000;
  const dueAtISO = new Date(dueMs).toISOString();
  if (input.targetCount === null || !Number.isFinite(input.targetCount)) return NO('unknown', weekKey, dueAtISO);
  if (input.targetCount <= 0) return NO('no_targets', weekKey, dueAtISO);
  if (input.lastWeek === weekKey) return NO('done_this_week', weekKey, dueAtISO);
  const now = input.now.getTime();
  if (now < dueMs) return NO('not_yet', weekKey, dueAtISO);
  if (now >= dueMs + X_WEEKLY_WINDOW_MS) return NO('missed', weekKey, dueAtISO);
  return { post: true, reason: null, weekKey, index: nextRotationIndex(input.rotationIndex, input.targetCount), dueAtISO };
}

/** フクエックスの本文（手で「fukuX 同時投稿」したときと同じ形）。題名＋空行＋本文・500字を超えたら先頭497字＋「…」。 */
export function xAnnounceBody(title: string | null, content: string | null): string {
  const t = (title ?? '').trim();
  const c = (content ?? '').trim();
  const body = t && c ? `${t}\n\n${c}` : (t || c);
  const MAX = 500;
  return body.length > MAX ? `${body.slice(0, MAX - 3)}…` : body;
}
