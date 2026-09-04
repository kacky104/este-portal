// エステ魂の「即セラ」ページの読み取り（第143便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ 2026-09-04 20:00 に実物で確かめた（ラビリンス様・サラさんの許可のもと）
//   GET  /tamathera/sokuthera/                    … 状態と「ひとこと呼びかけ」が読める
//   POST /tamathera/sokuthera/ajax_start          … ONにする
//   POST /tamathera/sokuthera/ajax_stop           … OFFにする（★ この便では使わない）
//   POST /tamathera/sokuthera/ajax_update_message … 呼びかけだけ変える（★ 使わない）
//   ★ Content-Type: application/x-www-form-urlencoded ／ 本文は message=…
//   ★★ ctk は要らない（main.min.js に "ctk" が1文字も無い）
//
// ★★★ **読み返して確かめられる**のがこの機能の強み。
//   ★ 写メ日記は「載ったか」を読み返せなかった（★ 一覧のURLを知らない）。
//   ★★ 即セラは【同じページを読み直すだけ】で効いたか分かる。
//   → 相手の JSON の形に頼らない。★ 「送った」と「効いた」を混ぜない。
//
// ★★★ 事故で確かめたこと（2026-09-04 20:10）
//   message を空で送ると、**本人の「ひとこと呼びかけ」が消える**。
//   ★ 「たぶん消える」ではなく消える。★ 実測。
//   → **呼びかけを読めなかったら ON を打たない。**
//     ★ 本人が書いた文を消すくらいなら、露出を諦める。

/** 即セラの状態。★ 'unknown' は【読めなかった】（★ OFF と混ぜない）。 */
export type SokuseraStatus = 'on' | 'off' | 'unknown';

export type SokuseraPage = {
  status: SokuseraStatus;
  /**
   * ひとこと呼びかけ。★ 読めなければ null（★ 空文字にしない）。
   * ★★ null と '' を混ぜない。★ '' は「本人が空にしている」で、null は「読めなかった」。
   */
  message: string | null;
};

/** 呼びかけの上限（★ 画面に「※20文字以内」と出ている・実測）。 */
export const SOKUSERA_MESSAGE_MAX = 20;

/**
 * ★★★ 即セラのページを読む。
 *
 * ★ 状態は画面の「現在のステータス ON / OFF」から。★ 相手の言葉に寄りかかっているので、
 *   ★★ 見つからなければ 'unknown'。★ 「たぶんOFF」にしない（★ OFFだと思ってONを打つと二重になる）。
 */
export function parseSokuseraPage(html: string): SokuseraPage {
  const src = String(html ?? '');

  // ① 状態。★ タグを落としてから見る（★ 文字のあいだにタグが挟まる・写メ日記で踏んだ）
  const text = src.replace(/<[^>]*>/g, '\n').replace(/&nbsp;/g, ' ');
  const m = /現在のステータス\s*(ON|OFF)/.exec(text.replace(/\s+/g, ' '))
    ?? /現在のステータス[\s\S]{0,40}?\b(ON|OFF)\b/.exec(text);
  const status: SokuseraStatus = m ? (m[1] === 'ON' ? 'on' : 'off') : 'unknown';

  // ② ひとこと呼びかけ。★ id="sokuthera-message" の input（実測）
  //   ★ value 属性が無いこともある（★ そのときは null＝読めなかった）
  let message: string | null = null;
  const inputRe = /<input[^>]*>/gi;
  let im: RegExpExecArray | null;
  while ((im = inputRe.exec(src)) !== null) {
    const tag = im[0];
    if (!/id="sokuthera-message"/i.test(tag)) continue;
    const v = /value="([^"]*)"/i.exec(tag);
    // ★ value 属性そのものが無ければ null のまま（★ 空文字にしない）
    if (v) message = decodeEntities(v[1]);
    break;
  }
  return { status, message };
}

function decodeEntities(s: string): string {
  return String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

export type SokuseraDecision =
  | { send: true; message: string }
  | { send: false; reason: 'already_on' | 'unknown_status' | 'no_message'; note: string };

/**
 * ★★★ ONを打ってよいか。
 *
 * ★ 打たない側に倒す条件（★ 相手のアカウントを触るので、迷ったら打たない）:
 *   ・すでにON      … 打ち直さない（★ 60分で相手が勝手に切る。延長は要らない）
 *   ・状態が読めない … ★ 「たぶんOFF」で打たない
 *   ・呼びかけが読めない … ★★ 空で送ると本人の文が消える（2026-09-04 実測）
 */
export function decideSokuseraStart(page: SokuseraPage): SokuseraDecision {
  if (page.status === 'on') {
    return { send: false, reason: 'already_on', note: 'すでに即セラがONです' };
  }
  if (page.status === 'unknown') {
    return { send: false, reason: 'unknown_status', note: '即セラの状態を読み取れませんでした' };
  }
  // ★★★ ここが要。★ null（読めなかった）は打たない。★ '' （本人が空にしている）は打ってよい
  if (page.message === null) {
    return {
      send: false, reason: 'no_message',
      note: 'ひとこと呼びかけを読み取れなかったため、ONにしませんでした（★ 本人の文を消さないため）',
    };
  }
  return { send: true, message: page.message };
}

/** ★ 送る本文。★ 読んだ呼びかけを【そのまま】返す。★ 20文字を超えていても切らない（本人のもの） */
export function sokuseraStartBody(message: string): string {
  return new URLSearchParams({ message: String(message ?? '') }).toString();
}
