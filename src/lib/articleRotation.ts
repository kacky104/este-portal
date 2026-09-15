// 新着情報を出す判定（第154便・2026-09-05 → ★ 第376便で【枠ごとに1日1回】へ作り直し・2026-09-15）。
//
// ★ このファイルは通信もDBも触らない。★ 時刻すら引数で受ける（now）。
//   announceAuto.ts / workPlan.ts と同じ理由:【判断は、固定して見返せる形に置く】。
//
// ★★★ 第376便で決めたこと（カッキーさん・2026-09-15）
//   「各カテゴリー自動投稿は1日1回にします。手動投稿はなんどでもOK」
//   「1カテゴリーにつき最大5投稿、自動更新用に用意できる仕様で」★ → 第384便で10投稿へ
//
//   ① **ローテは【枠ごと】。** ★ 枠（カテゴリー）に最大10本を持ち（★ 第384便で5本から）、その中を順に1本ずつ回す。
//      ★ 第154便の案A（店舗ぜんぶで1列に並べて回す）は**やめた**。
//   ② **自動は枠ごとに1日1回。** ★ 枠は5つなので、目いっぱいでも1日5本。
//   ③ **手動（いま出す）は何度でも。★ 自動とは別に数える。**
//      ★ 手で出した日も、その枠の自動は時刻が来れば出る（カッキーさんの判断・2026-09-15）。
//      ★ 第154便の「手で出したぶんも1日の回数に数える」は**やめた**（★ 回数の設定そのものが無くなった）。
//   ④ **時刻は店舗IDと枠番号から決まる。★ 選ばせない**（★ お知らせ・第192便と同じ作法）。
//
// ★★ 1日の区切りは announceAuto.ts の dayKeyJST（朝6時）を使う。★ 決め方を2つ持たない。
//   ★ 駅ちかの【上位表示】の回数は 00:00 リセットだが、それは別機能。ここでは混ぜない。
//
// ★★★ 下半分（ARTICLE_POSTS_PER_DAY_* / articlePostMinutes / shouldPostArticle /
//   rotationCycleMessage / articleQuotaNote）は **第376便から誰も呼んでいない。**
//   ★ 消さずに残してある（第372便の作法: 消すのは画面だけ）。★ 番人もそのまま通る。

import { dayKeyJST, dayStartMs, autoPostMinuteOfDay } from './announceAuto';

// ─────────────────────────────────────────────────────────
// ★★★ 第376便: 枠ごとに1日1回
// ─────────────────────────────────────────────────────────

/**
 * ★★★ 1つの枠（カテゴリー）に登録できる文章の上限。
 *   ★ 5本で始めた（カッキーさん・2026-09-15 昼・第376便）→ ★★ 第384便で **10本** へ（同日 夕）。
 *   ★ 枠は5つなので、店舗ぜんぶで最大50本。
 *   ★★ 数字はここだけ。★ 画面・保存・番人はこの定数を読む（★ 2か所に書かない）。
 */
export const ARTICLE_TEMPLATES_PER_SLOT_MAX = 10;

/** ★ 駅ちかの枠の数。★ 1日をこの数で割ってずらす（★ 枠の一覧そのものは ekichikaArticle.ts） */
const ARTICLE_SLOT_COUNT = 5;

/** ★ 枠の番号として使えるか。★ ここは通信を持たない側なので自前で持つ（ekichikaArticle に依らない） */
function isSlotNo(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= ARTICLE_SLOT_COUNT;
}

/**
 * ★★★ その店舗の、その枠が自動で出る時刻（区切り＝朝6時 からの分）。
 *
 * ★ 起点は announceAuto の autoPostMinuteOfDay（salonId から決まる・保存しない）。
 *   ★ そこから 1440÷5＝288分 ずつ枠をずらす。★ **5つの枠が1日の中でバラける。**
 *   ★ 店舗ごとに起点が違うので、全店が同じ時刻に集中しない。
 * ★★ 保存しない（★ 選ばせないものを列に持つと、列と計算がずれた店が作れる・第192便）。
 */
export function articleSlotPostMinute(salonId: number, articleSlot: number): number | null {
  const base = autoPostMinuteOfDay(salonId);
  if (base === null) return null;
  if (!isSlotNo(articleSlot)) return null;
  const step = 1440 / ARTICLE_SLOT_COUNT;
  return Math.floor((base + step * (articleSlot - 1)) % 1440);
}

/** 「09:42」の形。★ 画面で店舗に見せるためだけ（設定ではない） */
export function articleSlotPostTimeLabel(salonId: number, articleSlot: number): string | null {
  const m = articleSlotPostMinute(salonId, articleSlot);
  if (m === null) return null;
  const total = (6 * 60 + m) % 1440;        // ★ 区切りが朝6時なので足す
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

export type ArticleSlotSkipReason =
  | 'unknown'        // ★ 材料が読めていない。**0件と混ぜない**（作法3-5）
  | 'auto_off'       // 店舗の元栓が入っていない
  | 'no_targets'     // この枠に「自動で回す」印の付いた文章が0本
  | 'not_yet'        // まだこの枠の時刻になっていない
  | 'done_today';    // 今日ぶん（1回）は出した

export type ArticleSlotPostInput = {
  now: Date;
  salonId: number;
  /** 枠（カテゴリー）の番号 1〜5 */
  articleSlot: number;
  /**
   * 店舗の元栓（salon_article_settings.auto_enabled）。
   * ★★★ 第380便（2026-09-15）: **呼び出し側は常に true を渡す。** ★ 元栓そのものをやめた。
   *   ★ 「デフォルトが自動で出す。出したくなかったら文章で自動設定を止めてもらう」（カッキーさん）
   *   ★★ 引数と 'auto_off' の道は消さずに残してある（★ 戻すなら渡す値を変えるだけ）。
   */
  autoEnabled: boolean;
  /**
   * この枠の「自動で回す」印の付いた本数。
   * ★ null は【数えられていない】。0（1本も無い）と区別する。
   */
  activeCount: number | null;
  /**
   * この枠で最後に【自動で】出した営業日（YYYY-MM-DD）。★ まだ無ければ null。
   * ★★ 手で出した日は入らない。★ 手動と自動は別（カッキーさんの判断・2026-09-15）。
   */
  lastAutoDay: string | null;
};

export type ArticleSlotPostResult =
  | { post: false; reason: ArticleSlotSkipReason; dayKey: string | null; dueAtISO: string | null }
  | { post: true;  reason: null;                  dayKey: string;        dueAtISO: string };

/**
 * ★★★ この枠を、いま自動で出すか（第376便）。
 *
 * ★ 「出さない」ときは**理由を必ず返す**。★ 呼ぶ側が記録できるようにする。
 * ★★ 出す1本を選ぶのはここではない（★ DBの「最後に出した時刻が古い順」で決める・route.ts）。
 *   ★ 位置の数字（rotation_index）は持たない。★ 持つと、本数が変わったときにずれる。
 */
export function shouldPostArticleSlot(input: ArticleSlotPostInput): ArticleSlotPostResult {
  const no = (reason: ArticleSlotSkipReason, dayKey: string | null, dueAtISO: string | null = null): ArticleSlotPostResult =>
    ({ post: false, reason, dayKey, dueAtISO });

  const dayKey = dayKeyJST(input.now);
  if (dayKey === null) return no('unknown', null);
  if (!isSlotNo(input.articleSlot)) return no('unknown', dayKey);

  if (input.autoEnabled !== true) return no('auto_off', dayKey);

  // ★ 数えられていないものを 0 として扱わない
  if (input.activeCount === null || !Number.isFinite(input.activeCount)) return no('unknown', dayKey);
  if (input.activeCount <= 0) return no('no_targets', dayKey);

  // ★★★ 今日この枠を自動で出していれば、もう出さない（★ 1日1回）
  if (typeof input.lastAutoDay === 'string' && input.lastAutoDay === dayKey) return no('done_today', dayKey);

  const min = articleSlotPostMinute(input.salonId, input.articleSlot);
  const start = dayStartMs(dayKey);
  if (min === null || start === null) return no('unknown', dayKey);

  const dueMs = start + min * 60_000;
  const dueAtISO = new Date(dueMs).toISOString();
  const now = input.now.getTime();
  if (!Number.isFinite(now)) return no('unknown', dayKey);
  if (now < dueMs) return no('not_yet', dayKey, dueAtISO);

  return { post: true, reason: null, dayKey, dueAtISO };
}

/**
 * ★★★ 枠の見出しの下に出す1行（第376便）。★ マイページのお知らせと同じ言い方にそろえる。
 *
 * ★★ 文言はここで作る（★ 画面で作らない・第167便で直した作法）。
 * ★ 「必ず出ます」と約束しない（★ 時刻が来ても中継役が詰まっていれば出ない）。
 *
 * @returns 出す1行。★ 材料が読めていなければ null（★ 空文字と分ける・作法3-5）
 */
export function articleSlotAutoNote(input: {
  autoEnabled: boolean;
  /** この枠の「自動で回す」本数。★ null は数えられていない */
  activeCount: number | null;
  /** この枠で最後に自動で出した営業日 */
  lastAutoDay: string | null;
  /** 今日の営業日（★ 呼ぶ側が dayKeyJST で作って渡す） */
  dayKey: string | null;
  /** この枠の時刻「09:42」 */
  timeLabel: string | null;
}): string | null {
  if (input.activeCount === null || !Number.isFinite(input.activeCount)) return null;
  const n = Math.max(0, Math.trunc(input.activeCount));

  // ★ 「自動で回す」印が1本も無いのが先。★ 元栓の話をする前に、回すものが無い
  if (n <= 0) return '自動投稿にする文章がまだありません。';
  if (input.autoEnabled !== true) return '自動投稿は止まっています（下の「自動で出す」で許可できます）。';

  const done = typeof input.lastAutoDay === 'string'
    && input.dayKey !== null && input.lastAutoDay === input.dayKey;
  const time = input.timeLabel === null ? '' : input.timeLabel;

  // ★ 第382便: ここも短く言い切る（カッキーさん・2026-09-15）
  if (done) {
    return time === ''
      ? '本日投稿済み。明日予定。'
      : '本日投稿済み。明日は ' + time + ' ごろ予定。';
  }
  // ★ 第381便: 短く言い切る（カッキーさん・2026-09-15）。★ 「〜します」をやめて「投稿」で止める
  const tail = '（自動設定' + n + '件・ローテーション）';
  return time === ''
    ? '今日はこのあと1回投稿' + tail
    : '今日は ' + time + ' ごろ投稿' + tail;
}

// ─────────────────────────────────────────────────────────
// ★ 第154〜168便の道具（★ 第376便から誰も呼んでいない。★ 残してある）
// ─────────────────────────────────────────────────────────

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

/**
 * ★★★ 「今日はここまで◯本」の【すぐ下】に置く1行（第168便・2026-09-05）。
 *
 * ★★ なぜ要るか（2026-09-05 実測）
 *   画面に「今日はここまで **5本** 出しました」と「1日に出す本数 **2回**」が
 *   並んでいるのに、★ その関係を**どこにも書いていなかった**。
 *   ★ 店舗様は「2回なのに5本？」で止まる。★ 中身は正しく動いているのに、黙っている形。
 *   ★★★ これは「送ったのに公開ページに出ていなかった」と同じ穴（★ 正しいのに言わない）。
 *
 * ★★ ここで言わないこと（★ 下の「自動で出す」の節がすでに言っている。★ 二重に言わない）
 *   ・自動を許可していない        → null
 *   ・1日の本数が「出さない」      → null
 *   ・回す文章が1本も無い          → null
 *   ★ 数えられていないときも null（★ 0本と混ぜない・作法3-5）
 *
 * @returns 出す1行。★ 言うことが無ければ null（★ 空文字と分けない）
 */
export function articleQuotaNote(input: {
  autoEnabled: boolean;
  timesPerDay: number;
  postedToday: number | null;
  /** 「自動で回す」に印の付いた本数。★ null は数えられていない */
  activeCount: number | null;
}): string | null {
  if (input.autoEnabled !== true) return null;
  if (!isValidPostsPerDay(input.timesPerDay) || input.timesPerDay <= 0) return null;
  if (input.activeCount === null || !Number.isFinite(input.activeCount) || input.activeCount <= 0) return null;
  if (input.postedToday === null || !Number.isFinite(input.postedToday)) return null;

  const posted = Math.max(0, Math.trunc(input.postedToday));
  // ★★★ 達しているときは【今日はもう出ない】と言い切る。★ ここが今回いちばん言いたい1行
  if (posted >= input.timesPerDay) {
    return '1日の本数（' + input.timesPerDay + '回）に達したので、今日はこれ以上自動では出ません。';
  }
  // ★ 残りは「あと◯本まで」。★ 「あと◯本出ます」と約束しない（★ 時刻が来なければ出ない）
  return '今日はあと ' + (input.timesPerDay - posted) + ' 本まで自動で出ます。';
}
