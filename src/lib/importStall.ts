// 取り込みが止まっていることに気づくための見張り（第51便・純粋関数）。
//
// ★★★ なぜ要るか — 2026-08-29 に実際に起きたこと（設計メモ 追記21）
//   1日1回の周（full）が、crontab の衝突で **3日間まったく走っていなかった。**
//     3:20 に list（15分ごと）と full が同時起動 → flock で先に取った list が走る
//     → full は "already running -> skip" で即終了。mode を印字する前に抜けるのでログにも残らない
//     → ★ 翌日も同じ負け方をするので、永久に走らない
//   ★★ 3日間、誰も気づかなかった。別の作業（名簿の写しを読む）をしていなければ、まだ気づいていない。
//
// ★★★ この見張りの芯 —— 1つの時計で2つの周は見張れない
//   ```
//   当日の周（list・15分ごと）  salon_import_sources.last_run_at
//   週間の周（full・1日1回）    salon_import_runs の最終
//   ```
//   ★ 今回の事故で last_run_at は【ずっと新しかった】（list が15分ごとに更新するため）。
//     last_run_at だけを見る見張りを作っていたら、**3日止まっていても「正常」と判定していた。**
//   → ★ 周が2本あるなら、時計も2本要る。★ ここを1本にまとめないこと。
//
// ★★ 第47便 mediaLinkStall（書く向きの見張り）の【対称形】。
//   mediaLinkStall … 書く向きにしたまま、送らない        → 出勤がどちらにも反映されない
//   ここ            … 読む向きのまま、取り込みが止まる    → 出勤がフクエスで古いまま
//   ★ 担当は排他。書く向きの枠はこちらでは見ない（あちらの仕事）。
//
// ★★★ このファイルは通信もDBも触らない。時刻すら引数で受ける（now）。
//   ★ Date.now() をこの中で呼ばない。点検で「3日止まった状態」を作れなくなる。

import { isWriteDirection } from './mediaLinkMode';

/**
 * 当日の周（list）が何周ぶん落ちたら警告するか。
 * ★ 15分間隔なら 16周 = 4時間。1周や2周落ちるのは普通なので、そこでは鳴らさない。
 * ★ 間隔は店ごとに変えられる（プランの差にも使える・第36便）ので、周の数で持つ。
 */
export const LIST_STALL_CYCLES = 16;
/** ★ 間隔をとても短く設定した店で、警告が過敏になりすぎないための下限。 */
export const LIST_STALL_MIN_HOURS = 4;
/**
 * 週間の周（full）が何時間で警告か。
 * ★ 1日1回なので、1回飛ばしても許して2回目で鳴る幅＝48時間。
 *   （第49便 ROSTER_STALE_HOURS=36 と同じ「1回は許す」考え方）
 */
export const FULL_STALL_HOURS = 48;

/** どちらの周か。★ 名前を分けているのは、1本にまとめないため。 */
export type ImportClockKind = 'list' | 'full';
/** never＝一度も走っていない（いちばん危ない）／stale＝走ったことはあるが止まっている。 */
export type ImportStallReason = 'never' | 'stale';

export type ImportStallInput = {
  provider: string;
  slot: number;
  /** 'none' | 'read' | 'write' | 'write_auto' | null */
  linkMode: string | null;
  /** 連携が有効か（salon_media_credentials ではなく salon_import_sources 側） */
  isEnabled: boolean;

  /** 当日の周が最後に走った時刻。salon_import_sources.last_run_at */
  listLastRunAt: string | null;
  /** 週間の周が最後に走った時刻。salon_import_runs の最終。★ full しか書かない */
  fullLastRunAt: string | null;
  /** 取り込みの最短間隔（分）。既定15 */
  intervalMin: number | null;
  /** 取り込み設定を作った時刻。★ 一度も走っていないときの起点（mediaLinkStall と同じ作法） */
  createdAt: string | null;

  now: Date;
  /** 点検で短くするためだけに開けてある */
  listHours?: number;
  fullHours?: number;
};

export type ImportStallFinding = {
  clock: ImportClockKind;
  reason: ImportStallReason;
  /** 判定の起点（最後に走った時刻。無ければ設定を作った時刻） */
  sinceISO: string;
  elapsedHours: number;
  /** 店舗が読んで分かる1行。★ 英語の状態名を混ぜない */
  message: string;
};

/** ISO文字列 → ミリ秒。読めなければ null（★ 推測で埋めない）。 */
function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** 当日の周のしきい値（時間）。★ 間隔から作るので、店ごとの設定に追随する。 */
export function listStallHours(intervalMin: number | null): number {
  const m = Number(intervalMin);
  const min = Number.isFinite(m) && m > 0 ? m : 15;
  return Math.max((min * LIST_STALL_CYCLES) / 60, LIST_STALL_MIN_HOURS);
}

/** 「26時間」「3日」。★ 切り捨て（実際より長く言わない）。mediaLinkStall と同じ規則。 */
export function importElapsedLabel(hours: number): string {
  const h = Math.floor(hours);
  if (h < 48) return h + '時間';
  return Math.floor(h / 24) + '日';
}

/** 'ekichika' → 「駅ちか（枠1）」。★ 未知の provider はそのまま出す。 */
export function importSlotLabel(provider: string, slot: number): string {
  const name = provider === 'ekichika' ? '駅ちか' : provider;
  return name + '（枠' + slot + '）';
}

/**
 * 店舗が読む1行を組み立てる。
 * ★★ ここに「★」を書かないこと（2026-08-29 に一度漏らした）。
 *   ★ は設計メモとコードの注記の記号で、**店舗はその意味を知らない。**
 *   mediaLinkStall の文言にも入っていない。★ 内部の記法を画面へ持ち出さない。
 */
function buildMessage(
  clock: ImportClockKind,
  reason: ImportStallReason,
  hours: number,
  slotLabel: string,
): string {
  const t = importElapsedLabel(hours);
  if (clock === 'list') {
    if (reason === 'never') {
      return (
        slotLabel + 'から、まだ一度も出勤を取り込めていません（設定から' + t + '）。' +
        'ログイン情報と店舗ページの設定をご確認ください'
      );
    }
    return (
      slotLabel + 'からの出勤の取り込みが' + t + '止まっています。' +
      '本日の出勤がフクエスに反映されていない可能性があります'
    );
  }
  if (reason === 'never') {
    return (
      slotLabel + 'の週間予定を、まだ一度も取り込めていません（設定から' + t + '）。' +
      '本日ぶんは取り込めていても、明日以降の出勤が入りません'
    );
  }
  return (
    slotLabel + 'の週間予定の取り込みが' + t + '止まっています。' +
    '本日の出勤は取り込めていますが、明日以降の出勤が古いままです'
  );
}

/**
 * 取り込みが止まっていないかを、2本の時計で別々に判定する。
 *
 * ★★★ 対象外（黙る）の条件。★ 意図して止めているものを警告にしない:
 *   ・連携が無効（is_enabled=false）
 *   ・link_mode='none'（連携しない）
 *   ・★ 書く向き（write / write_auto）… 取り込みは設計どおり止まっている。
 *     こちらは第47便 mediaLinkStall の担当。★ 二重に鳴らさない
 *   ・★ 起点になる時刻が1つも無い … 分からないことは、分からないままにする
 *
 * ★ 戻り値は配列。2本の時計が同時に鳴ることがあり、**まとめて1件にしない**
 *   （どちらが止まっているかで、店舗が見るべき場所が違う）。
 */
export function judgeImportStall(input: ImportStallInput): ImportStallFinding[] {
  if (input.isEnabled !== true) return [];
  const mode = input.linkMode;
  if (mode === 'none') return [];
  // ★ 書く向きの枠は取り込みを止めてある（設計メモ §11）。あちらの見張りの担当
  if (isWriteDirection(mode)) return [];

  const now = input.now.getTime();
  if (!Number.isFinite(now)) return [];

  const createdAt = msOf(input.createdAt);
  const slotLabel = importSlotLabel(input.provider, input.slot);
  const out: ImportStallFinding[] = [];

  const check = (
    clock: ImportClockKind,
    lastRunISO: string | null,
    limitHours: number,
  ): void => {
    const last = msOf(lastRunISO);
    const base = last ?? createdAt;
    if (base === null) return;                    // ★ 根拠が無いので黙る
    const elapsed = (now - base) / 3_600_000;
    if (elapsed < 0) return;                      // ★ 未来の時刻（時計のずれ）は鳴らさない
    if (elapsed < limitHours) return;
    const reason: ImportStallReason = last === null ? 'never' : 'stale';
    out.push({
      clock,
      reason,
      sinceISO: new Date(base).toISOString(),
      elapsedHours: elapsed,
      message: buildMessage(clock, reason, elapsed, slotLabel),
    });
  };

  check('list', input.listLastRunAt, input.listHours ?? listStallHours(input.intervalMin));
  check('full', input.fullLastRunAt, input.fullHours ?? FULL_STALL_HOURS);

  return out;
}
