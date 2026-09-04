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

import { findMediaSite } from './mediaSites';

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
  /**
   * ★★★ フクエス側の出勤が最後に変わった時刻（第139便・2026-09-04）。
   *
   * ★★ なぜ要るか: いままで「送っていない時間」だけを見ていた。
   *   ★ 出勤を1つも変えていない店舗にも、24時間後から毎日「止まっています」と出ていた。
   *   ★★ **送るものが無いのに催促していた。** ★ 店舗様には何もできない。
   * → 見るのは「送っていない」ではなく **「変えたのに送っていない」**。
   *
   * ★ null は【分からない】。★ そのときは鳴らさない（★ 嘘の警告より黙るほうがまし）。
   */
  lastChangeAt: string | null;
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
  // ★★★ 起点は【新しいほう】（第139便で直した）。
  //   ★ いままで lastOk を優先していた。★ すると **向きを付け直しても時計が戻らない**。
  //   ★★ 2026-09-04 のラビリンス様: 今日 write にしたのに「43時間経っています」と出た。
  //     ★ 43時間前は、こちらが試しに送った時刻だった。★ 店舗様には身に覚えのない数字。
  const base = lastOk === null ? switched
    : switched === null ? lastOk
      : Math.max(lastOk, switched);
  if (base === null) return NOT_STALLED(null);   // ★ 根拠が無いので黙る

  const now = input.now.getTime();
  if (!Number.isFinite(now)) return NOT_STALLED(null);

  // ★★★ 送るものが無ければ鳴らさない（第139便）。
  const changed = msOf(input.lastChangeAt);
  // ★ 分からないときは黙る。★ 嘘の警告を出すより、何も出さないほうがまし
  if (changed === null) return NOT_STALLED(null);
  // ★★ 変えたぶんは送ってある。★ これは「止まっている」ではない
  if (changed <= base) return NOT_STALLED(0);

  // ★★★ 数えるのは「変えてから」。★ 「送っていない時間」ではない。
  //   ★ 店舗様が知りたいのは【自分が変えた分がいつから出ていないか】。
  const elapsedHours = (now - changed) / 3_600_000;
  // ★ 未来の時刻（時計のずれ）は「経ってない」として扱う。負の数を人に見せない。
  if (elapsedHours < 0) return NOT_STALLED(0);

  const limit = input.hours ?? WRITE_STALL_HOURS;
  if (elapsedHours < limit) return NOT_STALLED(elapsedHours);

  return {
    stalled: true,
    reason: lastOk === null ? 'never_sent' : 'stale',
    sinceISO: new Date(changed).toISOString(),
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
export function stallMessage(
  result: StallResult,
  slotLabel: string,
  /**
   * ★★★ 2026-09-04（第133-6便）: ここまで【駅ちか】と書き込んであった。
   *   ★ 実際にラビリンス様の画面へ「esutama（枠1）は『フクエスから【駅ちか】へ反映する』向き」
   *     と出た。★ エステ魂の話なのに送り先が駅ちか。★ 店舗様が読んだら混乱する。
   *   ★★ 媒体が1つだった頃の文言が、媒体が増えても直っていなかった。
   *   → **送り先の名前を受け取る。** ★ 決め打ちをやめる。
   */
  site?: {
    /** 送り先の呼び名（例: 'エステ魂'）。★ 無ければ「この媒体」 */
    name?: string;
    /**
     * ★ その媒体から【読める】か。★ 読めない媒体に「取り込むに戻してください」と言わない。
     *   ★ エステ魂は送る専用（readable=false）。戻す道がそもそも無い。
     */
    canRead?: boolean;
  },
): string | null {
  if (!result.stalled) return null;
  const t = elapsedLabel(result.elapsedHours);
  const name = site?.name && site.name.trim() ? site.name.trim() : 'この媒体';
  const canRead = site?.canRead === true;

  if (result.reason === 'never_sent') {
    const head =
      slotLabel + 'は「フクエスから' + name + 'へ反映する」向きですが、' +
      '出勤を変えてから' + t + '、まだ一度も反映していません。';
    // ★ 読める媒体だけ「取り込みに戻す」を案内する（★ 戻せない媒体に戻せと言わない）
    if (canRead) {
      return head +
        'この向きでは' + name + 'からの取り込みも止まっているため、' +
        '出勤がどちらにも反映されていない状態です。' +
        '「反映内容を確認」から進めるか、向きを「' + name + 'から取り込む」に戻してください';
    }
    return head + '「反映内容を確認」から進めてください';
  }
  // ★★ 「送っていない」ではなく「変えたのに送っていない」と書く（第139便）。
  //   ★ 店舗様が読んで、次にすることが分かる文にする
  return (
    slotLabel + 'は「フクエスから' + name + 'へ反映する」向きですが、' +
    'フクエスで出勤を変えてから' + t + '、まだ' + name + 'へ反映していません。' +
    '「反映内容を確認」から送ってください'
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
  // ★★★ 2026-09-04（第133-6便）: 駅ちか以外が英字のまま出ていた（'esutama（枠1）'）。
  //   ★ 店舗様が読む場所に内部の名前を出さない。★ 呼び名の正本は mediaSites。
  //   ★ 知らない provider は英字のまま（★ ごまかして別の名前を当てない）。
  const name = findMediaSite(provider)?.name ?? provider;
  return name + '（枠' + slot + '）';
}
