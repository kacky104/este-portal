// 送った印の【状態】から、もう一度送ってよいかを決める（第137便・2026-09-05）。
// ★ 純粋関数（禁則180）。★ DBもネットワークも触らない。
//
// ★★★ なぜ要るか
//   手で1発ずつ撃つあいだは「失敗したら印を消す」で足りていた。
//   ★★ 自動の周を回すと、**同じ日記を5分ごとに永遠に送り続ける**ことになる。
//   → 試した回数と時刻を覚えて、**やめどきを決める**。
//
// ★★★ 決めごと
//   ・失敗しても【すぐには】再挑戦しない（★ 相手を叩き続けない）
//   ・上限に達したら**もう試さない**。★ 消さずに残す（人が見て気づけるように）
//   ・'unknown' は **一度も再挑戦しない**。★ 受け取られたかもしれない相手に二度送らない
//   ・'pending' が長く残っているのは【途中で落ちた】印。★ これも再挑戦しない
//       ★ 送信の直前に立てた印なので、**送られている可能性がある**。
//       ★ 消せない相手に対して「たぶん送っていない」で二度送らない。

export type DiaryMarkState = 'pending' | 'sent' | 'failed' | 'unknown';

export const DIARY_MARK_STATES: readonly DiaryMarkState[] = ['pending', 'sent', 'failed', 'unknown'];

/** 知らない値は、いちばん強い「送らない側」へ倒す。 */
export function toDiaryMarkState(v: unknown): DiaryMarkState {
  return typeof v === 'string' && (DIARY_MARK_STATES as readonly string[]).includes(v)
    ? (v as DiaryMarkState)
    : 'unknown';
}

/** ★ 何回まで試すか。★ 3回で駄目なものは、やり方が間違っている */
export const MAX_DIARY_ATTEMPTS = 3;
/** ★ 失敗してから次に試すまでの間（分）。★ 相手を叩き続けない */
export const DIARY_RETRY_COOLDOWN_MIN = 30;

export type RetryVerdict =
  | { send: true; attempts: number }
  | { send: false; reason: 'sent' | 'unknown' | 'pending' | 'gave_up' | 'cooling'; message: string };

/**
 * ★★★ その印を見て、もう一度送ってよいか。
 *
 * @param row 印の中身。★ 行が無いとき（＝まだ一度も送っていない）は呼ばない
 * @param now いまの時刻。★ 引数で受ける（点検で固定できるように）
 */
export function decideDiaryRetry(
  row: { state: unknown; attempts: unknown; updatedAt: string | null },
  now: Date,
): RetryVerdict {
  const state = toDiaryMarkState(row.state);
  const attempts = Number.isFinite(Number(row.attempts)) ? Math.max(1, Math.trunc(Number(row.attempts))) : 1;

  if (state === 'sent') {
    return { send: false, reason: 'sent', message: 'この日記はもうお送りしています' };
  }
  // ★★★ 受け取られたかもしれない。★ 消せない相手に二度送らない
  if (state === 'unknown') {
    return {
      send: false, reason: 'unknown',
      message: '前回、受け取られたか判定できませんでした。★ 二度送りを避けるため、もうお送りしません（媒体側でご確認ください）',
    };
  }
  // ★★★ 送信の直前に立てた印が残っている＝途中で落ちた。★ 送られている可能性がある
  if (state === 'pending') {
    return {
      send: false, reason: 'pending',
      message: '前回の送信が途中で終わっています。★ 二度送りを避けるため、もうお送りしません（媒体側でご確認ください）',
    };
  }
  // ここから state === 'failed'
  if (attempts >= MAX_DIARY_ATTEMPTS) {
    return {
      send: false, reason: 'gave_up',
      message: MAX_DIARY_ATTEMPTS + '回お送りできなかったため、これ以上は試しません',
    };
  }
  const last = row.updatedAt ? Date.parse(row.updatedAt) : NaN;
  // ★ 時刻が読めなければ待たずに試す（★ 待ち続けて永久に送られないほうが困る）
  if (Number.isFinite(last)) {
    const passedMin = (now.getTime() - last) / 60000;
    // ★ 未来の時刻（時計のずれ）は「経っていない」として扱う
    if (passedMin < DIARY_RETRY_COOLDOWN_MIN) {
      return {
        send: false, reason: 'cooling',
        message: '前回お送りできなかったため、しばらく置いてからもう一度試します',
      };
    }
  }
  return { send: true, attempts: attempts + 1 };
}
