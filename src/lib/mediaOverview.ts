// 媒体連携の入口（/mypage/media）に出す状態の判定（第56便・㉞・純粋関数）。
//
// ★★★ なぜ要るか
//   連携先が4サイトになる（2026-08-30・カッキーさん）:
//     駅ちか                読む（取り込み）か 書く（反映）の【どちらか一方】
//     エステラブ            書くだけ
//     エステ魂              書くだけ
//     全国エステランキング   書くだけ
//   ★ 向きを選べるのは駅ちかだけ。他の3サイトには選ぶところが無い（設計メモ §159）。
//
// ★★ このファイルは通信もDBも触らない。時刻も引数で受ける
//   （mediaLinkStall / importStall / mediaVisibility と同じ作法・引き継ぎメモ 3-1）。

import { isWriteDirection } from './mediaLinkMode';

/**
 * 【向こうを読める】媒体。★ ここに無い媒体は書くことしかできない。
 *
 * ★★ 読めるかどうかは媒体の性質であって、店舗の設定ではない。
 *   ★ だから設定値（link_mode）ではなく、この表で決める。
 *   ★ 増やすときはここに足す。★ 足し忘れると「読めない側」に倒れる（＝安全側）。
 */
export const READABLE_PROVIDERS: readonly string[] = ['ekichika'];

export function canReadProvider(provider: string): boolean {
  return READABLE_PROVIDERS.includes(provider);
}

/**
 * 入口に出す向き。★ 3値。
 *   read   … 向こうから取り込んでいる
 *   write  … フクエスから反映している
 *   unset  … まだ何もしていない（ログイン情報が無い・止めてある・分からない）
 */
export type SiteDirection = 'read' | 'write' | 'unset';

export type SiteFacts = {
  provider: string;
  slot: number;
  /** salon_import_sources.link_mode。★ 行が無い枠は null */
  linkMode: string | null;
  /** 取り込み設定の枠が有効か（店舗が止めていないか） */
  sourceEnabled: boolean;
  /** ★ 使えるログイン情報を預かっているか（行があり・止めておらず・パスワードがある） */
  hasCredential: boolean;
};

/**
 * ★★★ 向きを決める。
 *
 * ★★★ 【読むのに鍵は要らない。書くには鍵が要る。】
 *   第1弾の取り込みは公開ページを読むだけなので、読み取りしかしない店は
 *   ログイン情報を持たない（mediaCredentials.ts のコメントのとおり）。
 *   ★ ここで hasCredential を一律に required にすると、
 *     **いま実際に取り込めている店が「未設定」に見える。**
 *
 * ★ 倒れる向き: **分からないときは「書かない側」に倒す。**
 *   ★ mediaVisibility の「分からないときは出さない」と同じ考え方だが、危ない側が違う。
 *     あちらは【見せること】が危なく、こちらは【書くこと】が危ない。
 *
 * ★★ link_mode が null の枠を「書くだけの媒体だから write」と読み替えない。
 *   読み替えると、ログイン情報を入れただけで反映が始まったように見える。
 *   ★ 反映するかどうかは、店舗が決めたことだけを写す。
 */
export function siteDirection(f: SiteFacts): SiteDirection {
  if (f.sourceEnabled !== true) return 'unset';
  if (isWriteDirection(f.linkMode)) {
    // ★ 書くには管理画面に入る必要がある。鍵が無ければ書けない
    return f.hasCredential === true ? 'write' : 'unset';
  }
  if (f.linkMode === 'read') {
    // ★ 読めない媒体に 'read' が入っていても、読めるようにはならない。
    //   ★ 勝手に write へ読み替えることもしない（設定を書き換えるのは画面の仕事ではない）。
    return canReadProvider(f.provider) ? 'read' : 'unset';
  }
  return 'unset';
}

/** 画面に出す状態の名前。★ 店舗が読む文言なので媒体の内部名を出さない。 */
export function directionLabel(d: SiteDirection): string {
  switch (d) {
    case 'read': return '読み込み';
    case 'write': return '反映のみ';
    default: return '未設定';
  }
}

/**
 * ★★★ 向きの切り替えボタンを出してよいか。
 *
 * ★ 出すのは【読める媒体】だけ。書くだけの媒体に切り替えを出すと、
 *   選べるように見えて選べない、という画面になる。
 * ★ ログイン情報が無いうちは出さない（切り替える相手がいない）。
 */
export function canSwitchDirection(f: SiteFacts): boolean {
  return f.hasCredential === true && canReadProvider(f.provider);
}

/**
 * ★★★ 次の取り込みはいつか。★ 分からないときは null。
 *
 * ★★ 過ぎている時刻を「次」と書かない。
 *   間隔ぶん過ぎているのに次の周が来ていない＝**止まっている**のであって、
 *   「次はさっきでした」は嘘になる。★ 見張り（importStall）の担当に渡す。
 *
 * ★ 「0件」と「分からない」を混ぜない（引き継ぎメモ 3-5）と同じ話で、
 *   ここは「分からない」を null で返し、画面では【何も出さない】。
 */
export function nextImportAt(input: {
  lastRunAt: string | null;
  intervalMin: number | null;
  now: Date;
}): Date | null {
  const { lastRunAt, intervalMin, now } = input;
  if (typeof lastRunAt !== 'string' || lastRunAt.length === 0) return null;
  if (typeof intervalMin !== 'number' || !Number.isFinite(intervalMin) || intervalMin <= 0) return null;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return null;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return null;
  const next = last + intervalMin * 60 * 1000;
  if (next <= nowMs) return null;   // ★ 過ぎている「次」は出さない
  return new Date(next);
}
