// 即セラを誰にONするか（第143便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ 決めごと（2026-09-04・カッキーさんに教わった業界の風習）
//   ・フクエスの「今すぐ」  45分で自動OFF（IMASUGU_WINDOW_MIN）
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

/**
 * ★★ 第1246便（2026-10-06・カッキーさん）: 【見に行って打たなかった】方は、これだけの間は見に行かない（分）。
 *   ★ 「今すぐ」中でも、エステ魂側で魂セラピストを始めていない／本人がすでに即セラをONにしている方は、
 *     名簿や設定ページを読まないと分からない＝10分ごとに見に行っていた。★ 相手サイトへの負荷と目立ち方を抑える。
 *   ★ 打った方の間（SOKUSERA_COOLDOWN_MIN）と同じ55分。★ 本人がONにした分も60分で切れるので、それより手前で見直しても意味が薄い。
 */
export const SOKUSERA_CHECK_HOLD_MIN = 55;

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
  /** ★ 第1246便: 最後に【見に行って打たなかった】時刻（ISO）。★ 無ければ null／省略可 */
  lastCheckedAt?: string | null;
};

export type SokuseraTargetReason =
  | 'not_imasugu' | 'not_agreed' | 'not_started' | 'account_unknown' | 'no_cast_id' | 'cooling' | 'checked';

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
  // ★★ 第1246便: 見に行って打たなかったばかりなら、間を置く（★ 相手サイトを読まずに済ませる）
  const checked = input.lastCheckedAt ? Date.parse(input.lastCheckedAt) : NaN;
  if (Number.isFinite(checked)) {
    const passed = (now.getTime() - checked) / 60000;
    if (passed < SOKUSERA_CHECK_HOLD_MIN) {
      return { ok: false, reason: 'checked', message: 'さきほど確かめたばかりです（エステ魂側で開始前、またはすでにON）' };
    }
  }
  return { ok: true };
}

// ───────────── 途中で失敗した方の扱い（第1288便・2026-10-07・カッキーさんの OK） ─────────────
//
// ★★★ 塞いだ穴: 自動の周は「ON にできる方の先頭の1人」を選ぶ。次の周でその方を飛ばすのは、
//   ON にできた（55分）／設定ページまで読んで打たなかった（55分・第1246便）ときだけだった。
//   ★ 途中で失敗すると何も残らず、次の周も同じ方が先頭＝【直るまで毎周その方で止まり、後ろの方が1人も ON にならない】。
//   ★ ON を送ったあと確かめられなかった方へは、10分ごとに ON を打ち直していた。
//   ★ 2026-10-07 の時点で失敗は 14日で0件（SQL で確認）。店が増える前に入れておく。
// ★ 決まり:
//   ・ON を送る【前】に失敗 … あけない。順番を後ろへ回すだけ（ほかに居なければ次の周でもう一度）
//   ・ON を送った【あと】確かめられなかった … 55分あける（★ 打ち直さない）
// ★ 記録は conecf_sokusera_checks（第1246便の表）の reason で分ける。表は増やさない。

/** 送る前に失敗した（後ろへ回すだけ・あけない） */
export const SOKUSERA_REASON_RETRY = 'failed_before_send';
/** 送ったあと確かめられなかった（55分あける） */
export const SOKUSERA_REASON_UNCONFIRMED = 'sent_unconfirmed';

/**
 * ★ 記録を「あける方（held）」と「後ろへ回す方（retried）」に分ける。therapistId → 時刻(ISO)。
 *   ★ 知らない理由は【あける側】（今までの行はすべてこちら）。
 */
export function splitSokuseraChecks(
  rows: ReadonlyArray<{ therapistId: number; checkedAt: string; reason?: string | null }>,
): { held: Map<number, string>; retried: Map<number, string> } {
  const held = new Map<number, string>();
  const retried = new Map<number, string>();
  for (const r of rows) {
    if (!Number.isFinite(r.therapistId) || !r.checkedAt) continue;
    if (r.reason === SOKUSERA_REASON_RETRY) retried.set(r.therapistId, r.checkedAt);
    else held.set(r.therapistId, r.checkedAt);
  }
  return { held, retried };
}

/**
 * ★★★ 自動の周で ON にする1人を選ぶ。★ 渡すのは【ON にしてよい方だけ】（decideSokuseraTarget が ok）を在籍順で。
 *   ・直近に失敗していない方がいれば、その先頭
 *   ・全員が直近に失敗している → いちばん前に失敗した方（★ 同じ方ばかりにしない）
 */
export function pickSokuseraAuto<T extends { lastFailedAt?: string | null }>(okRows: readonly T[]): T | null {
  if (okRows.length === 0) return null;
  const at = (r: T) => (r.lastFailedAt ? Date.parse(r.lastFailedAt) : NaN);
  const fresh = okRows.find((r) => !Number.isFinite(at(r)));
  if (fresh) return fresh;
  let best = okRows[0];
  for (const r of okRows) if (at(r) < at(best)) best = r;
  return best;
}

/**
 * ★★★ 1つの段が終わったとき、その方をどう覚えるか。
 *   'retry'       … 送る前に失敗した（後ろへ回す）
 *   'unconfirmed' … 送ったあと確かめられなかった（55分あける）
 *   null          … 覚えない（続きがある／ON を確かめた／打たないと決めた回＝第1246便が別に記録する）
 * ★ nextPurpose は次に積む段（無ければ null）。★ 'esutama_sokusera_end' へ向かう＝流れを畳んでいる。
 */
export function sokuseraAttemptOutcome(input: {
  purpose: string;
  nextPurpose: string | null;
  audits: ReadonlyArray<{ event: string; outcome: string; detail?: Record<string, unknown> | null }>;
}): 'retry' | 'unconfirmed' | null {
  const ending = input.nextPurpose === null || input.nextPurpose === 'esutama_sokusera_end';
  switch (input.purpose) {
    case 'esutama_sokusera_token':
    case 'esutama_sokusera_proxy':
      return ending ? 'retry' : null;
    case 'esutama_sokusera_page': {
      if (!ending) return null;
      const decidedNoStart = input.audits.some((a) =>
        a.event === 'read_sokusera' && a.outcome === 'ok' && a.detail?.['use'] === 'sokusera' && a.detail?.['willStart'] === false);
      return decidedNoStart ? null : 'retry';
    }
    case 'esutama_sokusera_start':
      return ending ? 'unconfirmed' : null;
    case 'esutama_sokusera_verify':
      return input.audits.some((a) => a.event === 'verify_sokusera' && a.outcome === 'ok') ? null : 'unconfirmed';
    default:
      return null;
  }
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
  /** ★ 第1246便 */
  確かめたばかり: number;
};

export function tallySokusera(
  rows: readonly SokuseraTargetInput[],
  now: Date,
): SokuseraTally {
  const t: SokuseraTally = {
    母数: rows.length, ONにする: 0, 今すぐでない: 0, 了承なし: 0,
    未開始: 0, 利用状況が不明: 0, 名簿未結び: 0, 打ったばかり: 0, 確かめたばかり: 0,
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
    else if (v.reason === 'checked') t.確かめたばかり++;
  }
  return t;
}

/** ★★ 1行のまとめ。★ 「ONにする」は0でも必ず出す（第35便の反省6）。 */
export function sokuseraSummary(t: SokuseraTally): string {
  const parts = ['即セラをONにする ' + t.ONにする + '名'];
  if (t.打ったばかり > 0) parts.push('さきほどONにした ' + t.打ったばかり + '名');
  if (t.確かめたばかり > 0) parts.push('さきほど確かめた ' + t.確かめたばかり + '名');
  if (t.今すぐでない > 0) parts.push('「今すぐ」ではない ' + t.今すぐでない + '名');
  if (t.了承なし > 0) parts.push('ご了承がまだ ' + t.了承なし + '名');
  if (t.名簿未結び > 0) parts.push('名簿が未結び ' + t.名簿未結び + '名');
  if (t.未開始 > 0) parts.push('魂セラピスト未開始 ' + t.未開始 + '名');
  if (t.利用状況が不明 > 0) parts.push('利用状況が未確認 ' + t.利用状況が不明 + '名');
  return parts.join(' ／ ') + '（在籍 ' + t.母数 + '名）';
}
