// 写メ日記の巡回が止まっていることに気づくための見張り（第100便・純粋関数）。
//
// ★★★ なぜ要るか —— 2026-09-01 深夜に実際に困ったこと（引き継ぎメモ 第99便 §9①）
//   「最後の取り込みが19:03。いま22:51」を見て、
//     ・新着が無かっただけ
//     ・巡回そのものが止まっている
//   の**どちらなのか言えなかった**。★ 記録が残るのは【取り込めた周】だけだったため。
//   ```
//   新着があった周   → salon_diary_imports に行が増える   ★ 残る
//   新着が無かった周 → ★★ どこにも何も残らない
//   ```
//   → **「見に行けた時刻」を、取り込めた時刻とは別に持つ**（salon_diary_watch）。
//   ★ salon_diary_imports.checked_at と同じ考え方（意味の違うものを1つの列に入れない）。
//
// ★★★ salon_media_credentials.last_verified_at は使えない
//   あれは【どの用事でも】成功すれば新しくなる。★ 出勤の巡回が動いているだけで新しいまま。
//   ★ 1本の時計で2つの周を見張った 2026-08-29 の事故（importStall 冒頭）とまったく同じ形。
//
// ★★★ 時計は2本。★ ただし importStall の2本とは【つながり方が違う】
//   ```
//   importStall   当日の周 ／ 週間の周   … ★ 並列。片方が止まってももう片方は走る
//   ここ          積んだ   → 読めた      … ★★ 直列。積まなければ読めるはずがない
//   ```
//   ★★★ だから【両方古いときに2件鳴らさない】。★ 原因は1つ（積んでいない）だから。
//     ★ 2件鳴らすと、運営は relay.sh を見に行く。★ 本当に見るべきは crontab。
//     ★ 「二重に鳴らさない」は importStall の「書く向きの枠では黙る」と同じ作法。
//
// ★★ このファイルは通信もDBも触らない。時刻すら引数で受ける（now）。
//   ★ Date.now() をこの中で呼ばない。点検で「4時間止まった状態」を作れなくなる。

import { importsDiaryFromEkichika } from './diarySource';
import { importElapsedLabel, importSlotLabel } from './importStall';

/**
 * 何周ぶん落ちたら鳴らすか。★ 15分間隔なら 16周 = 4時間。
 * ★ importStall の LIST_STALL_CYCLES と同じ数にしてある（考え方を2つにしない）。
 */
export const DIARY_STALL_CYCLES = 16;
/** ★ 間隔をとても短くした店で、警告が過敏になりすぎないための下限。 */
export const DIARY_STALL_MIN_HOURS = 4;
/** 巡回の既定の間隔（分）。★ crontab は 2,17,32,47 の15分ごと。 */
export const DIARY_INTERVAL_MIN_DEFAULT = 15;

/** どちらの時計か。★ 名前を分けているのは、1本にまとめないため。 */
export type DiaryClockKind = 'queued' | 'listed';
/** never＝一度もそこまで進んでいない（いちばん危ない）／stale＝進んだことはあるが止まっている。 */
export type DiaryStallReason = 'never' | 'stale';

export type DiaryStallInput = {
  provider: string;
  slot: number;
  /** salons.diary_source。★ 'ekichika' の店だけが見張りの対象（第99便の一本線） */
  diarySource: string | null;
  /** 鍵が有効か（salon_media_credentials.is_enabled） */
  isEnabled: boolean;
  /** ご同意があるか（consent_version が入っているか） */
  hasConsent: boolean;

  /** 巡回の口がジョブを積んだ時刻。salon_diary_watch.queued_at */
  queuedAt: string | null;
  /** 駅ちかの一覧を読み終えた時刻。salon_diary_watch.listed_at */
  listedAt: string | null;
  /** 巡回の間隔（分）。既定15 */
  intervalMin: number | null;
  /** 鍵を登録した時刻。★ 一度も進んでいないときの起点（importStall と同じ作法） */
  createdAt: string | null;

  now: Date;
  /** 点検で短くするためだけに開けてある */
  hours?: number;
};

export type DiaryStallFinding = {
  clock: DiaryClockKind;
  reason: DiaryStallReason;
  /** 判定の起点（最後に進んだ時刻。無ければ鍵を登録した時刻） */
  sinceISO: string;
  elapsedHours: number;
  /** 何が起きているか。★ 運営が読む1行 */
  message: string;
  /** ★★ 次にどこを見るか。★ message と混ぜない（起きたこと と やること は別） */
  hint: string;
};

/** ISO文字列 → ミリ秒。読めなければ null（★ 推測で埋めない）。 */
function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** しきい値（時間）。★ 間隔から作るので、間隔を変えれば追随する。 */
export function diaryStallHours(intervalMin: number | null): number {
  const m = Number(intervalMin);
  const min = Number.isFinite(m) && m > 0 ? m : DIARY_INTERVAL_MIN_DEFAULT;
  return Math.max((min * DIARY_STALL_CYCLES) / 60, DIARY_STALL_MIN_HOURS);
}

/** ★ 次に見る場所。★ 時計ごとに違う。★ ここが一緒だと、見張りの意味がない。 */
function buildHint(clock: DiaryClockKind): string {
  if (clock === 'queued') {
    return 'VPS の crontab（2,17,32,47 の巡回）と /root/import.log を見てください。'
      + '巡回の口が叩かれていない可能性があります';
  }
  return 'VPS の relay.sh（/root/relay.heartbeat）と、ログイン情報の直近の失敗理由を見てください。'
    + 'ジョブは積まれているのに、誰も駅ちかを読みに行けていません';
}

/** 何が起きているか。★ ここに「次にどうする」を混ぜない（hint の担当）。 */
function buildMessage(
  clock: DiaryClockKind,
  reason: DiaryStallReason,
  hours: number,
  slotLabel: string,
): string {
  const t = importElapsedLabel(hours);
  if (clock === 'queued') {
    if (reason === 'never') {
      return slotLabel + 'の写メ日記の巡回が、まだ一度も積まれていません（鍵の登録から' + t + '）';
    }
    return slotLabel + 'の写メ日記の巡回が' + t + '積まれていません';
  }
  if (reason === 'never') {
    return slotLabel + 'の写メ日記は、巡回は積まれていますが一覧をまだ一度も読めていません（鍵の登録から' + t + '）';
  }
  return slotLabel + 'の写メ日記は、巡回は積まれていますが一覧を' + t + '読めていません';
}

/**
 * 写メ日記の巡回が止まっていないかを判定する。
 *
 * ★★★ 黙る条件（意図して止めているものを警告にしない）:
 *   ・入口が 'ekichika' ではない … ★ 第99便の一本線。benry/fukues の店は回さないのが正しい
 *   ・鍵が無効（is_enabled=false）
 *   ・ご同意が無い
 *   ・起点になる時刻が1つも無い … 分からないことは、分からないままにする
 *   ・未来の時刻（時計のずれ）
 *
 * ★★★ 戻り値は【多くても1件】。★ importStall と違い、2本は直列につながっている:
 *   積んでいないなら、読めていないのは当たり前。★ そこで relay.sh を見に行かせない。
 */
export function judgeDiaryStall(input: DiaryStallInput): DiaryStallFinding[] {
  // ★★ 入口の判定は diarySource.ts の一本線を通す。★ ここに条件を書き足さないこと（第99便）
  if (!importsDiaryFromEkichika(input.diarySource)) return [];
  if (input.isEnabled !== true) return [];
  if (input.hasConsent !== true) return [];

  const now = input.now.getTime();
  if (!Number.isFinite(now)) return [];

  const limitHours = input.hours ?? diaryStallHours(input.intervalMin);
  const createdAt = msOf(input.createdAt);
  const slotLabel = importSlotLabel(input.provider, input.slot);

  const judge = (
    clock: DiaryClockKind,
    lastISO: string | null,
  ): DiaryStallFinding | null => {
    const last = msOf(lastISO);
    const base = last ?? createdAt;
    if (base === null) return null;               // ★ 根拠が無いので黙る
    const elapsed = (now - base) / 3_600_000;
    if (elapsed < 0) return null;                 // ★ 未来の時刻は鳴らさない
    if (elapsed < limitHours) return null;
    const reason: DiaryStallReason = last === null ? 'never' : 'stale';
    return {
      clock,
      reason,
      sinceISO: new Date(base).toISOString(),
      elapsedHours: elapsed,
      message: buildMessage(clock, reason, elapsed, slotLabel),
      hint: buildHint(clock),
    };
  };

  // ★★★ 上流から見る。積んでいないなら、そこで止める（下流は見ない）
  const queued = judge('queued', input.queuedAt);
  if (queued) return [queued];

  const listed = judge('listed', input.listedAt);
  return listed ? [listed] : [];
}
