// セラピスト本人の了承（媒体×用途）の判断（第118便・2026-09-03・純粋関数）。
//
// ★★★ なぜ要るか
//   エステ魂の写メ日記は【本人のアカウント】から投稿する（店舗の管理画面からは投稿できない・実測 9/3）。
//   ★ 店舗が繋いだからといって全員ぶん送ると、了承していない人の日記が本人のアカウントから出る。
//   → 送る相手は1人ずつ決める。★ 既定は【送らない】。
//
// ★★★ 3つを混ぜない（作法 3-5）
//   まだ聞いていない（unknown） … 店舗様がこれから本人に聞く
//   断られた（declined）        … ★ もう聞かない。★ 「まだ聞いていない」と同じ扱いにすると何度も聞くことになる
//   了承あり（agreed）          … 送ってよい
//   ★ どれも「送らない/送る」の2値には潰さない。★ 潰すと、店舗様の次の行動が画面から消える。
//
// ★★ もう1つ別の軸がある: 相手側で【魂セラピストを始めているか】。
//   ★ 了承があっても、始めていない人には代理ログインできない＝送れない。
//   ★ これは"こちらの記録"ではなく"相手の状態"。★ 混ぜずに、合わせるのは canSendDiary の1か所だけ。
//
// ★ このファイルは通信もDBも触らない。

/** こちらが持つ記録。★ 行が無いときは 'unknown' として扱う */
export type ConsentState = 'unknown' | 'agreed' | 'declined';

export const CONSENT_STATES: readonly ConsentState[] = ['unknown', 'agreed', 'declined'];

/** 相手側の状態。★ 'unknown' は「まだ読めていない」（★ 始めていない、ではない） */
export type MediaAccountState = 'unknown' | 'started' | 'not_started';

export function isConsentState(v: unknown): v is ConsentState {
  return typeof v === 'string' && (CONSENT_STATES as readonly string[]).includes(v);
}

/** 記録が読めなかった・知らない値だったときは、いちばん弱い 'unknown' に倒す（★ 送らない側） */
export function toConsentState(v: unknown): ConsentState {
  return isConsentState(v) ? v : 'unknown';
}

/** 店舗様が読んで分かる言葉。 */
export function consentLabel(s: ConsentState): string {
  if (s === 'agreed') return '了承あり';
  if (s === 'declined') return '送らない';
  return 'まだ確認していません';
}

/** その状態のときに店舗様が次にすること。★ 画面にそのまま出す */
export function consentNextStep(s: ConsentState): string {
  if (s === 'agreed') return '本人の了承が取れています。仕組みができたら、この方の日記を送ります。';
  if (s === 'declined') return 'ご本人が希望されていないため、この方の日記は送りません。';
  return 'ご本人に確認してから、「了承あり」または「送らない」を選んでください。';
}

export type SendVerdict =
  | { ok: true }
  | { ok: false; reason: 'not_agreed' | 'not_started' | 'account_unknown'; message: string };

/**
 * ★★★ その人の日記を送ってよいか。★ 画面もサーバも、判断はこの1か所を呼ぶ。
 *
 * ★★ 断る側に倒す:
 *   ・了承が無い（unknown / declined）          … 送らない
 *   ・相手側で魂セラピストを始めていない        … 代理ログインできない＝送れない
 *   ・相手側の状態がまだ読めていない            … ★ 「始めている」と決めつけない
 */
export function canSendDiary(input: { consent: ConsentState; account: MediaAccountState }): SendVerdict {
  if (input.consent !== 'agreed') {
    return {
      ok: false,
      reason: 'not_agreed',
      message: input.consent === 'declined'
        ? 'ご本人が希望されていないため送りません'
        : 'ご本人の了承がまだ確認できていないため送りません',
    };
  }
  if (input.account === 'not_started') {
    return { ok: false, reason: 'not_started', message: 'ご本人がまだ魂セラピストを始めていないため送れません' };
  }
  if (input.account !== 'started') {
    return { ok: false, reason: 'account_unknown', message: '魂セラピストの利用状況をまだ確かめていないため送りません' };
  }
  return { ok: true };
}

export type ConsentTally = { 全体: number; 了承あり: number; 送らない: number; 未確認: number };

/**
 * 数える。★ 行が無い人も【未確認】として数える（人数の母数は在籍）。
 * @param therapists 在籍のID
 * @param rows いま入っている記録
 */
export function tallyConsents(
  therapists: readonly number[],
  rows: ReadonlyArray<{ therapistId: number; state: ConsentState }>,
): ConsentTally {
  const of = new Map<number, ConsentState>();
  for (const r of rows) of.set(r.therapistId, toConsentState(r.state));
  const t: ConsentTally = { 全体: therapists.length, 了承あり: 0, 送らない: 0, 未確認: 0 };
  for (const id of therapists) {
    const s = of.get(id) ?? 'unknown';
    if (s === 'agreed') t.了承あり += 1;
    else if (s === 'declined') t.送らない += 1;
    else t.未確認 += 1;
  }
  return t;
}

/** 見出しの1行。★ 0件のときも「揃っています」と言わない（まだ何も聞いていないだけ） */
export function consentSummary(t: ConsentTally): string {
  if (t.全体 === 0) return 'セラピストが登録されていません';
  if (t.未確認 === t.全体) return `${t.全体}名ぶん、まだご本人に確認していません`;
  const parts = [`了承あり ${t.了承あり}名`];
  if (t.送らない > 0) parts.push(`送らない ${t.送らない}名`);
  if (t.未確認 > 0) parts.push(`未確認 ${t.未確認}名`);
  return parts.join(' ／ ') + `（在籍 ${t.全体}名）`;
}
