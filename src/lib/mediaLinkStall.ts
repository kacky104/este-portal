// 「書き込みの向きにしたまま、駅ちかへ反映していない」枠を見つける（第47便・純粋関数）。
//
// ★★★ なぜ要るか — 設計メモ 追記11 §32 の【裏返し】
//   §32 は「切り替えUIを書き込みができる前に出すと、店舗が【何も動かない状態】を自分で作れる」
//   と書いた。第46便で送る経路と同じ便に出したので §32 は満たしている。
//   ★ だが塞げていないものが1つ残った。**押したまま、何もしないこと。**
//     向きを write にする → 取り込みが止まる
//     承認しない          → 書き込みもされない
//     → ★ 出勤がどこからも更新されない。**店舗もこちらも気づけない。**
//
//   ★★ 切り替え自体は軽い操作でよい（送る前なら戻せる。重い門は承認側に置いてある）。
//     だから「押させない」ではなく「**押したまま止まっていることに気づける**」で塞ぐ。
//     設計メモ §2-3「失敗を店舗に届ける」・追記11 §40 の見張りと同じ形。
//
// ★★★ このファイルは通信もDBも触らない。**時刻すら引数で受ける**（now）。
//   理由は workPlan.ts / relayFlow.ts と同じ:【判断は、固定して見返せる形に置く】。
//   ★ Date.now() をこの中で呼ぶと、点検で「24時間経った状態」を作れなくなる。

import { isWriteDirection } from './mediaLinkMode';

/** これだけ反映が無ければ、止まっているとみなす。 */
export const WRITE_STALL_HOURS = 24;

export type StallReason =
  | 'never_sent'   // 切り替えてから一度も反映していない（★ いちばん危ない）
  | 'stale';       // 反映したことはあるが、久しく止まっている

export type StallInput = {
  /** 'none' | 'read' | 'write' | null */
  linkMode: string | null;
  /** 最後に write へ切り替えた時刻（監査ログ link_mode_changed）。ISO文字列 */
  switchedToWriteAt: string | null;
  /** 最後に駅ちかへ反映できた時刻（監査ログ write_work / outcome 'ok'）。ISO文字列 */
  lastWriteOkAt: string | null;
  now: Date;
  /** 既定 WRITE_STALL_HOURS。点検で短くするためだけに開けてある */
  hours?: number;
};

export type StallResult =
  | { stalled: false; reason: null; sinceISO: null; elapsedHours: number | null }
  | { stalled: true; reason: StallReason; sinceISO: string; elapsedHours: number };

const NOT_STALLED = (elapsedHours: number | null): StallResult => ({
  stalled: false, reason: null, sinceISO: null, elapsedHours,
});

/** ISO文字列 → ミリ秒。読めなければ null（★ 推測で埋めない）。 */
function msOf(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * 止まっているかを判定する。
 *
 * ★★★ 判定の起点は「最後に反映できた時刻」。まだ一度も無ければ「write に切り替えた時刻」。
 *   ★ どちらも無いときは【判定しない】。
 *     監査ログが流れて消えた／切り替えの記録が取れていない場合に、
 *     「一度も送っていない」と決めつけると **嘘の警告** になる。
 *     設計メモ §26「比べた相手が0人でも『変更なし』になる」と同じ罠。
 *     ★ 分からないことは、分からないままにする。
 */
export function judgeWriteStall(input: StallInput): StallResult {
  // ★ write / write_auto のどちらも見張る（第48便）。自動の枠も止まりうる
  if (!isWriteDirection(input.linkMode)) return NOT_STALLED(null);

  const lastOk = msOf(input.lastWriteOkAt);
  const switched = msOf(input.switchedToWriteAt);
  const base = lastOk ?? switched;
  if (base === null) return NOT_STALLED(null);   // ★ 根拠が無いので黙る

  const now = input.now.getTime();
  if (!Number.isFinite(now)) return NOT_STALLED(null);

  const elapsedHours = (now - base) / 3_600_000;
  // ★ 未来の時刻（時計のずれ）は「経ってない」として扱う。負の数を人に見せない。
  if (elapsedHours < 0) return NOT_STALLED(0);

  const limit = input.hours ?? WRITE_STALL_HOURS;
  if (elapsedHours < limit) return NOT_STALLED(elapsedHours);

  return {
    stalled: true,
    reason: lastOk === null ? 'never_sent' : 'stale',
    sinceISO: new Date(base).toISOString(),
    elapsedHours,
  };
}

/** 「26時間」「3日」のような、人が読む長さ。★ 切り捨て（実際より長く言わない）。 */
export function elapsedLabel(hours: number): string {
  const h = Math.floor(hours);
  if (h < 48) return h + '時間';
  return Math.floor(h / 24) + '日';
}

/**
 * 店舗が読んで分かる1行。★ 英語のエラー文字列を混ぜない（監査ログ migration の作法と同じ）。
 * 止まっていなければ null。
 */
export function stallMessage(result: StallResult, slotLabel: string): string | null {
  if (!result.stalled) return null;
  const t = elapsedLabel(result.elapsedHours);
  if (result.reason === 'never_sent') {
    return (
      slotLabel + 'は「フクエスから駅ちかへ反映する」向きのままですが、' +
      t + '、まだ一度も反映していません。' +
      'この向きでは駅ちかからの取り込みも止まっているため、' +
      '出勤がどちらにも反映されていない状態です。' +
      '「反映内容を確認」から進めるか、向きを「駅ちかから取り込む」に戻してください'
    );
  }
  return (
    slotLabel + 'は「フクエスから駅ちかへ反映する」向きですが、' +
    '最後の反映から' + t + '経っています。' +
    'フクエスで出勤を変えた分が駅ちかに出ていない可能性があります'
  );
}

/** 画面に出す1件ぶん。★ 'use server' のファイルは型を export できないのでここに置く。 */
export type MediaLinkAlert = {
  provider: string;
  slot: number;
  /**
   * ★★★ どの見張りが出したか（第51便）。
   *   'write'  … 書く向きにしたまま送っていない（このファイル・第47便）
   *   'import' … 読む向きのまま取り込みが止まっている（importStall.ts・第51便）
   * ★ 文言だけでは区別できないので持たせる。★ 画面の見出しと key もこれで分ける
   *   （同じ枠で2つ鳴ることがあり、provider#slot だけでは key が衝突する）。
   */
  watch: 'write' | 'import';
  /** ★ 見張りごとに語彙が違う（never_sent / stale / never …）。表示と記録のためだけに持つ */
  reason: string;
  /** 経過（時間）。★ 画面では elapsedLabel を通す */
  elapsedHours: number;
  /** 店舗が読んで分かる1行 */
  message: string;
};

/** 'ekichika' → 「駅ちか（枠1）」。★ 未知の provider はそのまま出す（勝手に日本語をでっち上げない）。 */
export function mediaSlotLabel(provider: string, slot: number): string {
  const name = provider === 'ekichika' ? '駅ちか' : provider;
  return name + '（枠' + slot + '）';
}
