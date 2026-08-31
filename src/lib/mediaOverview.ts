// 媒体連携の画面に出す状態の判定（第56便で新設・第58便で送信ボタンを追加・純粋関数）。
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

/**
 * 画面に出す状態の名前。★ 店舗が読む文言なので媒体の内部名を出さない。
 *
 * ★★★ 「向き」「読み込み／反映」と呼ばない（第86便・カッキーさんの指摘）。
 *   ★ どちらも仕組み側の言葉で、店舗様が読んで浮かぶ絵が無い。
 *   ★ 店舗様にとっての違いは【どちらの画面に出勤を入力するか】の1点しかないので、
 *     そのまま「◯◯で入力」と書く。
 *
 * ★★ read の文言には媒体の名前が要る。★ だから siteLabel を受け取る。
 *   ★ 「駅ちか」と決め打ちにしない。READABLE_PROVIDERS は増える前提で書いてある
 *     （このファイルの上）。決め打ちにすると、増やした日に文言だけが嘘になる。
 *   ★ 名前が分からないときは、名前のない言い方に倒す（嘘の名前を出さない）。
 */
export function directionLabel(d: SiteDirection, siteLabel?: string): string {
  switch (d) {
    case 'read': return siteLabel ? `${siteLabel}で入力` : 'サイト側で入力';
    case 'write': return 'フクエスで入力';
    default: return '未設定';
  }
}

/**
 * ★★★ 「変える」ボタンの文字。★ 押した先の【行き先】を名前にする。
 *
 * ★★ 「向きを変える」も「入力する場所を変える」も、押すと何になるのかが読めない
 *   （第86便その2・カッキーさんの指摘）。★ 行き先を書けば、考える場所が消える。
 * ★★ 未設定のときは空文字。★ 変える先が決まっていないのに「変える」と書かない
 *   （画面ではボタンを出さず、ログイン情報へ案内する）。
 * ★ 読める媒体は駅ちかだけで増やさない運営（2026-08-31・カッキーさん）。
 *   ★ それでも媒体名は引数で受ける。文言に店の名前を焼き付けない。
 */
export function switchButtonLabel(from: SiteDirection, siteLabel: string): string {
  if (from === 'read') return 'フクエスに変える';
  if (from === 'write') return `${siteLabel}に変える`;
  return '';
}

/**
 * ★★★ 変えたあとに出す文。★ **止まるほうを必ず一緒に言う。**
 *
 * ★ 1回押すだけで変わる形にした（第86便その2）。★ 押す前の確認が無いぶん、
 *   何が止まったのかを、押した直後に本人へ返す。★ 黙って止めない。
 */
export function switchDoneText(from: SiteDirection, siteLabel: string): string {
  if (from === 'read') return `フクエスに変えました。${siteLabel}からの取り込みは止まります`;
  if (from === 'write') return `${siteLabel}に変えました。フクエスからの反映は止まります`;
  return '';
}

/** ★ 押したら何になるか。★ 未設定からは決められない（null）。 */
export function switchTargetMode(from: SiteDirection): 'read' | 'write' | null {
  if (from === 'read') return 'write';
  if (from === 'write') return 'read';
  return null;
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

// ───────────────────────── 送信ボタンの状態（第58便） ─────────────────────────

/**
 * ★★★ 「この内容で送る」を押せるか。押せないときは【なぜ押せないか】。
 *
 * ★ きっかけ: 変わるところが0件のとき、ボタンが灰色になるだけで理由を持っていなかった。
 *   すぐ上に「変えるところはありません」と書いてあるので読めば分かるが、
 *   ★★ ボタン自体が理由を持っていないと、押せないことしか伝わらない。
 *   → §159 と同じ作法を、ボタンにも通す:
 *     **できないことを、できない理由といっしょに出す。**
 *
 * ★ 判定の順番が意味を持つ。★ 止めた理由がある枠は、0件かどうかより先に「止まっている」と言う。
 */
export type PushAvailability = 'not_confirmed' | 'blocked' | 'no_change' | 'ready';

export function pushAvailability(input: {
  /** 確かめた結果（計画）があるか */
  hasPlan: boolean;
  /** 計画が「送れる」状態か（止めた理由が無いか） */
  sendable: boolean;
  /** 変わるところの件数 */
  changeCount: number;
  /** 承認に添える指紋。★ 空なら送れない（第46便） */
  fingerprint: string;
}): PushAvailability {
  if (input.hasPlan !== true) return 'not_confirmed';
  // ★ 止めた理由がある枠は、まずそれを言う
  if (input.sendable !== true) return 'blocked';
  // ★★★ 0件は【指紋より先に】見る（2026-08-30 の取り違え）。
  //   planFingerprint() は【変更の一覧】から作るので、変更0件なら指紋は必ず空になる。
  //   ★ 「指紋が空」と「変更0件」は同じことの裏表。
  //     指紋を先に見ると、いちばん多い場面（変えるところが無い）で
  //     「いまは送れません」という別の理由が出てしまう。
  if (!Number.isFinite(input.changeCount) || input.changeCount <= 0) return 'no_change';
  // ★ ここまで来て指紋が空なのは、変更があるのに指紋が作れていない＝おかしい。
  //   ★ 起きないはずだが、起きたら送らせない側に倒す
  if (typeof input.fingerprint !== 'string' || input.fingerprint.length === 0) return 'blocked';
  return 'ready';
}

/**
 * ボタンに出す文字。★ 押せないときは、押せない理由が文字になっている。
 * ★ 知らない値は「いまは送れません」に落とす（送る側に倒さない）。
 */
export function pushButtonLabel(a: PushAvailability | string): string {
  switch (a) {
    case 'ready': return 'この内容で送る';
    case 'no_change': return '送るものがありません';
    case 'not_confirmed': return 'まだ確かめていません';
    default: return 'いまは送れません';
  }
}

// ───────────────────────── 投稿用アドレスの伏せ字（第58便） ─────────────────────────

/**
 * ★★★ 写メ日記の投稿用アドレスを伏せ字にする。
 *
 * ★ このアドレスを知っている者は、誰でもその媒体に投稿できる（migration 20260826 のとおり）。
 *   ★ 一覧に丸ごと出すと、隣で画面を覗いた人がそのまま持ち帰れる。
 *   ★★ 一方で「どのセラピストの宛先が入っているか」は店舗が確かめたい。
 *   → **頭2文字とドメインだけ出す。** 見分けはつくが、書き写しても使えない。
 *
 * ★ 形が分からない値（@ が無い・文字列でない）は【全部隠す】。
 *   ★ 分からないときは出さない側に倒す。★ 元の値をそのまま返す枝を作らない。
 */
export function maskAddress(address: string | null | undefined): string {
  if (typeof address !== 'string') return '';
  const s = address.trim();
  if (s.length === 0) return '';
  const at = s.lastIndexOf('@');
  // ★ @ が先頭・無い ときは形が読めない。★ 中身を出さない
  if (at <= 0) return '****';
  // ★ 頭2文字は【ローカル部から】取る。
  //   ★ 元は s.slice(0,2) にしていて、'a@shame.jp' が 'a@****@shame.jp' になっていた（点検が捕まえた）
  const local = s.slice(0, at);
  return local.slice(0, 2) + '****' + s.slice(at);
}

// ───────────────── セラピストが、その媒体に出ているか（第62便） ─────────────────

/**
 * ★★★ 4値。★ 「いません」と言ってよい場面を狭くするための型。
 *
 *   present  … 向こうの名簿で見つかった
 *   missing  … 番号は知っているのに、向こうの名簿に無かった
 *   unlinked … ★ そもそも番号が結びついていない。★ 「いない」ではない
 *   unknown  … ★ 向こうの名簿をまだ読めていない。★ これも「いない」ではない
 *
 * ★★ 画面に「いません」と出すのは missing のときだけ。
 *   ★ unlinked を「いません」と書くと、名前が違うだけの人を「消えた」と読ませる。
 *   ★ unknown を「います」と書くと、確かめていないことを確かめたことにする。
 *   → 引き継ぎメモ 3-5「0件と分からないを混ぜない」の、人単位の版。
 */
export type TherapistSiteState = 'present' | 'missing' | 'unlinked' | 'unknown';

export function therapistSiteState(input: {
  /** 媒体側の番号（castId）が結びついていないか */
  isUnlinked: boolean;
  /** 番号は知っているのに、向こうの名簿に無かったか */
  isMissing: boolean;
  /** 向こうの名簿を読めているか（読めていなければ何も言えない） */
  known: boolean;
}): TherapistSiteState {
  // ★ 番号が無い人は、向こうを読めていても判定できない。★ ここが最優先
  if (input.isUnlinked === true) return 'unlinked';
  // ★ 読んでいないのに「います」と言わない
  if (input.known !== true) return 'unknown';
  return input.isMissing === true ? 'missing' : 'present';
}

/** 画面に出す言い方。★ 知らない値は「まだ確かめていません」に落とす（断定しない側）。 */
export function therapistSiteLabel(s: TherapistSiteState | string): string {
  switch (s) {
    case 'present': return 'います';
    case 'missing': return 'いません';
    case 'unlinked': return 'まだ結びついていません';
    default: return 'まだ確かめていません';
  }
}
