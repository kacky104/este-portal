// 即セラを誰にONするか（第143便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ 決めごと（2026-09-04・カッキーさんに教わった業界の風習）
//   ・フクエスの「今すぐ」  30分で自動OFF
//   ・エステ魂の「即セラ」  60分で自動OFF
//   ・駅ちかの「即イク」    45分で自動OFF
//   ★★ **誰も手動でOFFを打たない。★ 流しっぱなしのほうが好まれる。**
//     お客様も「もう埋まっているかも」を前提に見ている。
//     露出が増え、問い合わせを待機中の別のセラピストへ案内できる。
//   → **OFFは打たない。★ 期限のズレは揃えない。**
//     ★ 私（Claude）は当初「食い違いは避けるべき」と書いたが、それは机上の話だった。
//
// ★★★ 了承は【写メ日記と共用】（カッキーさんの判断・2026-09-04）。
//   ★ 「エステ魂へ送ってよい」の1つで、日記も即セラも扱う。★ 店舗様の手間を増やさない。
//
// ★★★ 打ちすぎない。★ 相手のアカウントを触るので、間を置く。
//   ・すでにONなら打たない（★ ページを読んで判断・esutamaSokuseraParse）
//   ・直近に打っていたら打たない（★ ここ。★ 通信そのものを減らす）

import { canSendDiary, type ConsentState, type MediaAccountState } from './therapistMediaConsent';

/**
 * ★ 一度打ったら、これだけの間は打ち直さない（分）。
 *   ★ 相手は60分で勝手にOFFになる。★ その手前で打ち直しても意味が薄い。
 *   ★★ 55分にしてあるのは、60分ちょうどだと「切れた直後に打てない」時間ができるため。
 */
export const SOKUSERA_COOLDOWN_MIN = 55;

export type SokuseraTargetInput = {
  /** 写メ日記の了承を共用する */
  consent: ConsentState;
  /** 相手側で魂セラピストを始めているか */
  account: MediaAccountState;
  /** エステ魂の cast_id */
  castId: string | null;
  /** ★ フクエスの「今すぐ」がいま生きているか（★ 呼び出し側が isImasuguLiveRow で出す） */
  imasuguLive: boolean;
  /** 最後に即セラをONにした時刻（ISO）。★ 無ければ null */
  lastStartedAt: string | null;
};

export type SokuseraTargetReason =
  | 'not_imasugu' | 'not_agreed' | 'not_started' | 'account_unknown' | 'no_cast_id' | 'cooling';

export type SokuseraTargetVerdict =
  | { ok: true }
  | { ok: false; reason: SokuseraTargetReason; message: string };

/**
 * ★★★ その人の即セラをONにしてよいか。
 *
 * ★ 順番に意味がある:
 *   ① 今すぐでない        … ★ 最初。★ そもそも用が無い（★ 店舗様にすることも無い）
 *   ② 了承                … こちらの記録
 *   ③ 名簿の結び          … ★ 利用状況は結びが無いと決められない（第133便の教訓）
 *   ④ 利用状況            … 相手の状態
 *   ⑤ 打ったばかり        … ★ 最後。★ 他が全部そろっている人にだけ言う
 */
export function decideSokuseraTarget(input: SokuseraTargetInput, now: Date): SokuseraTargetVerdict {
  // ★★ 「今すぐ」でなければ何もしない。★ これは故障ではない
  if (!input.imasuguLive) {
    return { ok: false, reason: 'not_imasugu', message: 'いま「今すぐ」ではありません' };
  }
  if (input.consent !== 'agreed') {
    const v = canSendDiary({ consent: input.consent, account: input.account });
    if (!v.ok) return { ok: false, reason: v.reason, message: v.message };
  }
  const id = String(input.castId ?? '').trim();
  if (!/^\d{1,12}$/.test(id)) {
    return { ok: false, reason: 'no_cast_id', message: 'エステ魂の登録と結びついていないため送れません' };
  }
  const v = canSendDiary({ consent: input.consent, account: input.account });
  if (!v.ok) return { ok: false, reason: v.reason, message: v.message };

  // ★★ 打ったばかりなら間を置く。★ 相手は60分で勝手にOFFになる
  const last = input.lastStartedAt ? Date.parse(input.lastStartedAt) : NaN;
  if (Number.isFinite(last)) {
    const passed = (now.getTime() - last) / 60000;
    // ★ 未来の時刻（時計のずれ）は「経っていない」扱い。★ 打たない側へ倒す
    if (passed < SOKUSERA_COOLDOWN_MIN) {
      return { ok: false, reason: 'cooling', message: 'さきほど即セラをONにしたばかりです' };
    }
  }
  return { ok: true };
}

export type SokuseraTally = {
  母数: number;
  ONにする: number;
  今すぐでない: number;
  了承なし: number;
  未開始: number;
  利用状況が不明: number;
  名簿未結び: number;
  打ったばかり: number;
};

export function tallySokusera(
  rows: readonly SokuseraTargetInput[],
  now: Date,
): SokuseraTally {
  const t: SokuseraTally = {
    母数: rows.length, ONにする: 0, 今すぐでない: 0, 了承なし: 0,
    未開始: 0, 利用状況が不明: 0, 名簿未結び: 0, 打ったばかり: 0,
  };
  for (const r of rows) {
    const v = decideSokuseraTarget(r, now);
    if (v.ok) { t.ONにする++; continue; }
    if (v.reason === 'not_imasugu') t.今すぐでない++;
    else if (v.reason === 'not_agreed') t.了承なし++;
    else if (v.reason === 'not_started') t.未開始++;
    else if (v.reason === 'account_unknown') t.利用状況が不明++;
    else if (v.reason === 'no_cast_id') t.名簿未結び++;
    else if (v.reason === 'cooling') t.打ったばかり++;
  }
  return t;
}

/** ★★ 1行のまとめ。★ 「ONにする」は0でも必ず出す（第35便の反省6）。 */
export function sokuseraSummary(t: SokuseraTally): string {
  const parts = ['即セラをONにする ' + t.ONにする + '名'];
  if (t.打ったばかり > 0) parts.push('さきほどONにした ' + t.打ったばかり + '名');
  if (t.今すぐでない > 0) parts.push('「今すぐ」ではない ' + t.今すぐでない + '名');
  if (t.了承なし > 0) parts.push('ご了承がまだ ' + t.了承なし + '名');
  if (t.名簿未結び > 0) parts.push('名簿が未結び ' + t.名簿未結び + '名');
  if (t.未開始 > 0) parts.push('魂セラピスト未開始 ' + t.未開始 + '名');
  if (t.利用状況が不明 > 0) parts.push('利用状況が未確認 ' + t.利用状況が不明 + '名');
  return parts.join(' ／ ') + '（在籍 ' + t.母数 + '名）';
}
