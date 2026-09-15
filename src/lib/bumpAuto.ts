// 上位表示（bump）を【自動で】押すかどうかの判定（第385便・2026-09-15）。
//
// ★ このファイルは通信もDBも触らない。★ 時刻すら引数で受ける（now）。
//   announceAuto.ts / articleRotation.ts と同じ理由:【判断は、固定して見返せる形に置く】。
//
// ★★★ 第385便で決めたこと（カッキーさん・2026-09-15）
//   「自動表示設定の時間帯〇〇時〇〇分～〇〇時〇〇分の間 〇〇分間隔で先頭表示」
//   「手動でも実行可能で、残り回数が0になったら、朝6時に回復するまで終了」
//
//   ① **間隔はプリセット**（10 / 15 / 20 / 30 / 60 分）。★ 7分・13分のような「すぐ尽きる形」を作らせない。
//   ② **時間帯は日をまたいでよい**（22:00〜翌2:00）。★ 開始 > 終了 なら「またぐ」と読む。
//   ③ **手動はいつでも押せる。** ★ ただし【間隔は手動も含めた最後の1回から数える】。
//      ★ 手で押した1分後に自動が重なると、回数を2つ使って並びは1つしか動かない——いちばん惜しい負け方。
//   ④ **残り0でその日は終わり。** ★ 翌朝6時に回復するまで何もしない（回数の管理はSQL側 salon_bump_apply）。
//   ⑤ **数えられていないときは押さない。** ★ 「0回使った」と「読めていない」を混ぜない（作法3-5）。
//
// ★★ 1日の区切りは dutyStatus.businessDateJSTFrom（朝6時）。★ SQL 側 v_today と同じ切り方。
//   ★ 決め方を2か所に書かない（第150便の1本化）。

import { businessDateJSTFrom } from './dutyStatus';

// ─────────────────────────────────────────────────────────
// 回数の上限（★ SQL 側 salon_bump_apply と同じ数字）
// ─────────────────────────────────────────────────────────

/** 1日に押せる回数の土台。 */
export const BUMP_QUOTA_BASE = 20;
/** フクエスワーク掲載店（jobs_enabled）の上乗せ。 */
export const BUMP_QUOTA_JOBS_BONUS = 20;

/** その店の1日の上限回数。★ 画面も周もここを読む（20 と 40 を各所に書かない）。 */
export function bumpQuota(jobsEnabled: boolean): number {
  return BUMP_QUOTA_BASE + (jobsEnabled ? BUMP_QUOTA_JOBS_BONUS : 0);
}

/**
 * 営業日（朝6時区切り）で数え直した残り回数。
 * ★ bump_day が今日でなければ、使った回数は 0 から数え直す（SQL 側と同じ規則）。
 * ★ 読めていない（bumpUsed が null かつ bumpDay が今日）ときは null を返す——押さない材料にする。
 */
export function bumpRemaining(input: {
  now: Date;
  jobsEnabled: boolean;
  bumpDay: string | null;
  bumpUsed: number | null;
}): number | null {
  const quota = bumpQuota(input.jobsEnabled);
  const today = businessDateJSTFrom(input.now.getTime());
  if (input.bumpDay !== today) return quota;         // ★ 日が変わっている＝まだ1回も使っていない
  if (typeof input.bumpUsed !== 'number' || !Number.isFinite(input.bumpUsed)) return null;
  return Math.max(0, quota - input.bumpUsed);
}

// ─────────────────────────────────────────────────────────
// 設定の形
// ─────────────────────────────────────────────────────────

/** 選べる間隔（分）。★ SQL 側の check 制約と同じ並び。 */
export const BUMP_AUTO_INTERVALS = [10, 15, 20, 30, 60] as const;
export type BumpAutoInterval = (typeof BUMP_AUTO_INTERVALS)[number];

/** 既定の設定（列の default と同じ）。★ 10:00〜23:00 を30分ごと。 */
export const BUMP_AUTO_DEFAULT_START_MIN = 600;   // 10:00
export const BUMP_AUTO_DEFAULT_END_MIN = 1380;    // 23:00
export const BUMP_AUTO_DEFAULT_INTERVAL_MIN = 30;

export function isValidBumpInterval(v: unknown): boolean {
  return typeof v === 'number' && (BUMP_AUTO_INTERVALS as readonly number[]).includes(v);
}

/** 0時からの経過分として使えるか（0〜1439の整数）。 */
export function isValidMinuteOfDay(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1439;
}

/** 分 → 「HH:MM」。★ 画面の time 入力と行き来する。 */
export function minuteLabel(min: number): string {
  if (!isValidMinuteOfDay(min)) return '';
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/** 「HH:MM」→ 分。★ 読めなければ null（既定値で埋めない——黙って別の時刻にしない）。 */
export function minuteFromLabel(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(label ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** いまの日本時間の「0時からの経過分」（0〜1439）。 */
export function minuteOfDayJST(now: Date): number {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

/**
 * いまが時間帯の中か。
 * ★ 開始 <= 終了 … その間（終了ちょうども中に入れる）。
 * ★ 開始 >  終了 … 日をまたぐ（開始以降 または 終了まで）。★ 22:00〜翌2:00。
 * ★ 開始 == 終了 … その1分だけ。★ 「1日中」とは読まない（読むと止め方が無くなる）。
 */
export function bumpWindowContains(nowMin: number, startMin: number, endMin: number): boolean {
  if (!isValidMinuteOfDay(nowMin) || !isValidMinuteOfDay(startMin) || !isValidMinuteOfDay(endMin)) return false;
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin;
  return nowMin >= startMin || nowMin <= endMin;
}

/** 時間帯の長さ（分）。★ 日またぎも数えられる。★ 開始と終了が同じなら 0。 */
export function bumpWindowLength(startMin: number, endMin: number): number {
  if (!isValidMinuteOfDay(startMin) || !isValidMinuteOfDay(endMin)) return 0;
  return startMin <= endMin ? endMin - startMin : 1440 - startMin + endMin;
}

/**
 * その時間帯に自動で入る最大の本数（＝押す回数）。
 * ★ 開始ちょうどに1回、あとは間隔ごと。★ 残り回数とは別（少ないほうで止まる）。
 */
export function bumpAutoMaxPerDay(startMin: number, endMin: number, intervalMin: number): number {
  if (!isValidBumpInterval(intervalMin)) return 0;
  return Math.floor(bumpWindowLength(startMin, endMin) / intervalMin) + 1;
}

// ─────────────────────────────────────────────────────────
// ★★★ 押すか押さないか
// ─────────────────────────────────────────────────────────

export type BumpAutoReason =
  | 'ok'
  | 'off'            // 元栓が入っていない
  | 'bad_setting'    // 設定の値が壊れている（★ 直すまで押さない）
  | 'unknown'        // 回数が読めていない（★ 0回と混ぜない）
  | 'no_quota'       // 今日の回数を使い切った
  | 'out_of_window'  // 時間帯の外
  | 'too_soon';      // 前回から間隔が空いていない

export type BumpAutoJudge = {
  bump: boolean;
  reason: BumpAutoReason;
  /** ★ 参考：この周から見て、次に押せるようになるまでの残り分（too_soon のときだけ） */
  waitMin: number | null;
};

/**
 * 自動で上位表示を押すか。
 * ★ lastBumpAt は【手動も自動も入る最後の1回】（salons.bumped_at）。
 *   ★ 自動だけの足あと（bump_auto_at）では数えない——手で押した直後に重なる。
 */
export function shouldAutoBump(input: {
  now: Date;
  enabled: boolean;
  startMin: number;
  endMin: number;
  intervalMin: number;
  /** salons.bumped_at（ISO文字列）。★ 一度も押していなければ null */
  lastBumpAt: string | null;
  /** 営業日で数え直した残り回数。★ 読めていなければ null */
  remaining: number | null;
}): BumpAutoJudge {
  const no = (reason: BumpAutoReason, waitMin: number | null = null): BumpAutoJudge =>
    ({ bump: false, reason, waitMin });

  if (!input.enabled) return no('off');

  if (!isValidMinuteOfDay(input.startMin) || !isValidMinuteOfDay(input.endMin) || !isValidBumpInterval(input.intervalMin)) {
    return no('bad_setting');
  }

  // ★★ 回数が読めていないときは何もしない。★ ここを 0 扱いで進めると、上限を越えて押しに行く
  if (input.remaining === null) return no('unknown');
  if (input.remaining <= 0) return no('no_quota');

  if (!bumpWindowContains(minuteOfDayJST(input.now), input.startMin, input.endMin)) {
    return no('out_of_window');
  }

  if (input.lastBumpAt) {
    const last = Date.parse(input.lastBumpAt);
    // ★ 読めない文字列は「押していない」と同じに扱わない。★ 押さない側に倒す
    if (!Number.isFinite(last)) return no('unknown');
    const elapsedMin = (input.now.getTime() - last) / 60000;
    // ★ 未来の時刻（時計のずれ）も押さない側へ
    if (elapsedMin < 0) return no('too_soon', input.intervalMin);
    if (elapsedMin < input.intervalMin) {
      return no('too_soon', Math.max(0, Math.ceil(input.intervalMin - elapsedMin)));
    }
  }

  return { bump: true, reason: 'ok', waitMin: null };
}

// ─────────────────────────────────────────────────────────
// 画面に出す1行（★ 文言はここで作る。画面で組み立てない・第167便）
// ─────────────────────────────────────────────────────────

/**
 * 設定の下に出す1行。★ 店舗様の言葉だけで書く（内部の語を出さない）。
 * ★ 材料が読めていなければ null（★ 空文字と分ける）。
 */
export function bumpAutoNote(input: {
  enabled: boolean;
  startMin: number;
  endMin: number;
  intervalMin: number;
  /** 営業日で数え直した残り回数。★ 読めていなければ null */
  remaining: number | null;
}): string | null {
  if (!isValidMinuteOfDay(input.startMin) || !isValidMinuteOfDay(input.endMin) || !isValidBumpInterval(input.intervalMin)) {
    return '時間帯か間隔の設定を見直してください。';
  }
  if (!input.enabled) return '自動実行はお休み中です。手動のボタンはいつでも押せます。';

  const span = minuteLabel(input.startMin) + '〜' + minuteLabel(input.endMin)
    + (input.startMin > input.endMin ? '（翌日）' : '');
  const max = bumpAutoMaxPerDay(input.startMin, input.endMin, input.intervalMin);
  const head = span + ' のあいだ ' + input.intervalMin + '分ごとに自動で上位表示します（1日最大 ' + max + '回）。';

  if (input.remaining === null) return head;
  if (input.remaining <= 0) return head + ' 本日の回数は使い切りました。明朝6時に戻ります。';
  if (input.remaining < max) {
    return head + ' 本日の残りは ' + input.remaining + '回なので、途中で止まります。';
  }
  return head;
}
