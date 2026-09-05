// 新着情報を「1日◯回・順番に」出す判定（第154便・2026-09-05）。
//
// ★ このファイルは通信もDBも触らない。★ 時刻すら引数で受ける（now）。
//   announceAuto.ts / workPlan.ts と同じ理由:【判断は、固定して見返せる形に置く】。
//
// ★★★ 決めたこと（2026-09-05・カッキーさん）
//   ・ローテは【案A：全体で1本ずつ回す】。
//     テンプレートを1列に並べ、順に1本ずつ出す。★ テンプレート自身が「どの枠へ出すか」を持つ。
//     ★ 案B（枠ごとに5列持つ）は採らない。実物が案Aの使い方をしている（設計メモ §9）。
//   ・**店舗様が選んだ枠しか触らない。**
//   ・**1日4回**が既定。
//     ★ 駅ちかの新着に回数制限は無い（上位表示とは別物）。★ 決めるのは店舗様。
//     ★ ベンリー様は20〜30分おきに回しているが、
//       **記事更新は順位を上げない**（見る人に「新しい・ちゃんと営業している」と伝えるだけ）。
//       → ★ 30分おきは相手にも迷惑。★ 1日4回くらいが妥当（カッキーさんのご判断）。
//
// ★★ 1日の区切りは announceAuto.ts の dayKeyJST（朝6時）を使う。★ 決め方を2つ持たない。
//   ★ 駅ちかの【上位表示】の回数は 00:00 リセットだが、それは別機能。ここでは混ぜない。

import { dayKeyJST, dayStartMs, autoPostMinuteOfDay } from './announceAuto';

/** 1日に出す回数の既定。★ 2026-09-05 に決めた */
export const ARTICLE_POSTS_PER_DAY_DEFAULT = 4;

/**
 * 1日に出せる回数の上限。★ 相手の決まりではなく【こちらが引く線】。
 *
 * ★★ 枠は5つで、出すたびに前の記事が消える。
 *   ★ 出しすぎると、読まれる前に消える。★ だから画面で止める。
 *   ★ 相手の制限ではないので、「駅ちかの決まりです」とは書かないこと。
 */
export const ARTICLE_POSTS_PER_DAY_MAX = 12;

export function isValidPostsPerDay(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= ARTICLE_POSTS_PER_DAY_MAX;
}

/**
 * ★★ その店舗が1日に出す時刻（区切り＝朝6時 からの分）を、回数ぶん返す。
 *
 * ★ 起点は announceAuto の autoPostMinuteOfDay（salonId から決まる・保存しない）。
 *   ★ そこから 1440÷回数 の間隔で置く。★ **決め方は1つのまま、回数でばらける。**
 *   ★ 店舗ごとに起点が違うので、全店が同じ時刻に集中しない。
 * ★ 昇順で返す（★ 区切りからの経過で「何本目か」を数えられる形にする）。
 */
export function articlePostMinutes(salonId: number, times: number): number[] | null {
  const base = autoPostMinuteOfDay(salonId);
  if (base === null) return null;
  if (!isValidPostsPerDay(times)) return null;
  const step = 1440 / times;
  const out: number[] = [];
  for (let i = 0; i < times; i++) out.push(Math.floor((base + step * i) % 1440));
  return out.sort((a, b) => a - b);
}

/** 「14:20ごろ」の形。★ 画面で店舗に見せるためだけ（設定ではない） */
export function articlePostTimeLabels(salonId: number, times: number): string[] | null {
  const mins = articlePostMinutes(salonId, times);
  if (mins === null) return null;
  return mins.map((m) => {
    const total = (6 * 60 + m) % 1440;      // ★ 区切りが朝6時なので足す
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  });
}

// ─────────────────────────────────────────────────────────
// 次の1本を出すか
// ─────────────────────────────────────────────────────────

export type ArticleSkipReason =
  | 'unknown'        // ★ 材料が読めていない。**0件と混ぜない**（作法3-5）
  | 'bad_times'      // 回数の設定が範囲の外
  | 'no_targets'     // 「自動で回す」に印の付いたテンプレートが0本
  | 'not_yet'        // まだこの回の時刻になっていない
  | 'done_today';    // 今日ぶんは出しきった

export type ArticlePostInput = {
  now: Date;
  salonId: number;
  /** 1日に出す回数 */
  timesPerDay: number;
  /**
   * 「自動で回す」に印の付いたテンプレートの本数。
   * ★ null は【数えられていない】。0（1本も無い）と区別する。
   */
  targetCount: number | null;
  /**
   * 今日（区切り内）に出した回数。
   * ★★★ **手で出したぶんも数える。**
   *   ★ 「1日4回まで。手で出したぶんも数えます」——説明が1つで済む形にする。
   *   ★ 1日1回のお知らせ（announceAuto）は「手動があった日は自動を出さない」だったが、
   *     回数が増えると丸1日止まるのは強すぎる。★ 数え方をそろえるほうが素直。
   * ★ null は【数えられていない】。
   */
  postedToday: number | null;
  /** ローテの現在位置。まだ無ければ null（→ 次は0本目） */
  rotationIndex: number | null;
};

export type ArticlePostResult =
  | { post: false; reason: ArticleSkipReason; dayKey: string | null; index: null; nth: null; dueAtISO: string | null }
  | { post: true;  reason: null;              dayKey: string;        index: number; nth: number; dueAtISO: string };

/**
 * ★★★ 次の1本を出すか。★ 出すなら「テンプレートの何本目か」も返す。
 *
 * ★ 「出さない」ときは**理由を必ず返す**。★ 呼ぶ側が記録できるようにする（§372 と同じ芯）。
 */
export function shouldPostArticle(input: ArticlePostInput): ArticlePostResult {
  const no = (reason: ArticleSkipReason, dayKey: string | null, dueAtISO: string | null = null): ArticlePostResult =>
    ({ post: false, reason, dayKey, index: null, nth: null, dueAtISO });

  const dayKey = dayKeyJST(input.now);
  if (dayKey === null) return no('unknown', null);

  if (!isValidPostsPerDay(input.timesPerDay)) return no('bad_times', dayKey);

  // ★ 数えられていないものを 0 として扱わない
  if (input.targetCount === null || !Number.isFinite(input.targetCount)) return no('unknown', dayKey);
  if (input.targetCount <= 0) return no('no_targets', dayKey);
  if (input.postedToday === null || !Number.isFinite(input.postedToday)) return no('unknown', dayKey);

  const posted = Math.max(0, Math.trunc(input.postedToday));
  if (posted >= input.timesPerDay) return no('done_today', dayKey);

  const mins = articlePostMinutes(input.salonId, input.timesPerDay);
  const start = dayStartMs(dayKey);
  if (mins === null || start === null) return no('unknown', dayKey);

  // ★ 今日の「posted 本目」の予定時刻。★ 何本目かは【出した回数】で決まる
  const dueMs = start + mins[posted] * 60_000;
  const dueAtISO = new Date(dueMs).toISOString();
  const now = input.now.getTime();
  if (!Number.isFinite(now)) return no('unknown', dayKey);
  if (now < dueMs) return no('not_yet', dayKey, dueAtISO);

  // ★ 位置は本数で丸める。★ 本数が減っても位置が外に出ない
  const idx = input.rotationIndex === null || !Number.isFinite(input.rotationIndex)
    ? 0
    : ((Math.trunc(input.rotationIndex) % input.targetCount) + input.targetCount) % input.targetCount;

  return { post: true, reason: null, dayKey, index: idx, nth: posted + 1, dueAtISO };
}

/**
 * 一巡にかかる日数を、店舗様の言葉で返す。
 * ★ 「10本付けると◯日に1回」と数字で言えば、店舗が自分で減らす判断ができる。
 * ★ 数えられていなければ空文字（★ 0本と混ぜない）。
 */
export function rotationCycleMessage(targetCount: number | null, timesPerDay: number): string {
  if (targetCount === null || !Number.isFinite(targetCount)) return '';
  if (targetCount <= 0) return '「自動で回す」に印を付けた新着がまだありません。';
  if (!isValidPostsPerDay(timesPerDay)) return '';
  const days = targetCount / timesPerDay;
  if (days <= 1) {
    return targetCount + '本を1日' + timesPerDay + '回で出すので、同じ内容が1日に'
      + Math.floor(timesPerDay / targetCount) + '回まわります。';
  }
  const d = Math.ceil(days * 10) / 10;
  return targetCount + '本を1日' + timesPerDay + '回で出すので、ひととおり出るのに およそ' + d + '日 かかります。';
}
