// 「この日記を、この人へ送ってよいか」の判定（第132便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ 判断はここ1か所。★ 画面もサーバも運営の口も、全部これを呼ぶ。
//   ★ 口ごとに条件を書くと、片方だけ直す日が必ず来る（diarySource.ts と同じ作法）。
//
// ★★★ 送れない理由は【5つあって、混ぜてはいけない】。
//   ★ 店舗様の次の行動が理由ごとに違うから（第118便の決めごと④）。
//     not_agreed      … 了承がない        → 本人に聞いていただく
//     not_started     … 魂セラピスト未開始 → 本人に始めていただく
//     account_unknown … 利用状況が読めない → こちらがもう一度読む
//     no_cast_id      … 名簿が結びついていない → 画面で結んでいただく
//     already_sent    … もう送ってある     → ★ 何もしなくてよい（故障ではない）
//   ★★ 「送れません」の一言でまとめない。★ まとめると、店舗様は何をすればいいか分からない。
//
// ★★★ **既定は送らない（opt-in）。** ★ 迷ったら送らない側に倒す。
//   ★ 日記は本人のアカウントから出る。★ しかもエステ魂では店舗側から消せない。

import { canSendDiary, type ConsentState, type MediaAccountState } from './therapistMediaConsent';

export type DiaryTargetReason =
  | 'not_agreed' | 'not_started' | 'account_unknown' | 'no_cast_id' | 'already_sent';

export type DiaryTargetVerdict =
  | { ok: true }
  | { ok: false; reason: DiaryTargetReason; message: string };

/** 1人ぶんの材料。★ 呼び出し側が DB から集めて渡す。 */
export type DiaryTargetInput = {
  /** 了承（therapist_media_consent）。★ 行が無いときは 'unknown' を渡す */
  consent: ConsentState;
  /** 相手側の利用状況。★ 一覧に data-cast-state='active' があれば 'started' */
  account: MediaAccountState;
  /** 名簿の結び（therapist_media_ids）。★ 無ければ null */
  castId: string | null;
  /** ★ もう送ってあるか（diary_post_sent に行があるか） */
  alreadySent: boolean;
};

/**
 * ★★★ 送ってよいか。★ 断る側に倒す。
 *
 * ★ 順番に意味がある:
 *   ① already_sent を先に見る … 送ってあるなら、他の理由を並べても店舗様は何もしなくてよい
 *   ② 了承 → 利用状況（canSendDiary が持っている・第118便）
 *   ③ 名簿の結び … ★ 最後。★ 了承も利用も済んでいる人だけに「結んでください」と言う
 *     ★ 了承していない人に「結んでください」と出すと、要らない作業を増やす
 */
export function decideDiaryTarget(input: DiaryTargetInput): DiaryTargetVerdict {
  // ★★ もう送ってあるのは【正常】。★ 赤く出さない・故障として数えない
  if (input.alreadySent) {
    return { ok: false, reason: 'already_sent', message: 'この日記はもうお送りしています' };
  }
  const v = canSendDiary({ consent: input.consent, account: input.account });
  if (!v.ok) return { ok: false, reason: v.reason, message: v.message };

  // ★★★ 名簿が結びついていないと【誰として送るか】が決まらない。★ 番号が無いまま代理ログインしない
  const id = String(input.castId ?? '').trim();
  if (!/^\d{1,12}$/.test(id)) {
    return { ok: false, reason: 'no_cast_id', message: 'エステ魂の登録と結びついていないため送れません' };
  }
  return { ok: true };
}

/** 数えた結果。★ 画面と運営の口で同じ数え方を使う。 */
export type DiaryTargetTally = {
  母数: number;
  送れる: number;
  送信済み: number;
  了承なし: number;
  未開始: number;
  利用状況が不明: number;
  名簿未結び: number;
};

/**
 * ★★ 数える。★ 理由ごとに分けて数える（混ぜない）。
 * ★ 母数は渡された人数そのもの。★ 「0件」と「分からない」を混ぜない（引き継ぎメモ 3-5）。
 */
export function tallyDiaryTargets(rows: readonly DiaryTargetInput[]): DiaryTargetTally {
  const t: DiaryTargetTally = {
    母数: rows.length, 送れる: 0, 送信済み: 0, 了承なし: 0, 未開始: 0, 利用状況が不明: 0, 名簿未結び: 0,
  };
  for (const r of rows) {
    const v = decideDiaryTarget(r);
    if (v.ok) { t.送れる++; continue; }
    if (v.reason === 'already_sent') t.送信済み++;
    else if (v.reason === 'not_agreed') t.了承なし++;
    else if (v.reason === 'not_started') t.未開始++;
    else if (v.reason === 'account_unknown') t.利用状況が不明++;
    else if (v.reason === 'no_cast_id') t.名簿未結び++;
  }
  return t;
}

/**
 * ★★ 店舗様に見せる1行。★ 「送れません」で終わらせない。
 * ★ 0のものは出さない（読む量を増やさない）。★ ただし【送れる】は0でも必ず出す。
 *   ★ 0件のときこそ「なぜ0なのか」が要る（第35便の反省6）。
 */
export function diaryTargetSummary(t: DiaryTargetTally): string {
  const parts = ['送れる ' + t.送れる + '名'];
  if (t.送信済み > 0) parts.push('送信済み ' + t.送信済み + '名');
  if (t.了承なし > 0) parts.push('ご了承がまだ ' + t.了承なし + '名');
  if (t.未開始 > 0) parts.push('魂セラピスト未開始 ' + t.未開始 + '名');
  if (t.利用状況が不明 > 0) parts.push('利用状況が未確認 ' + t.利用状況が不明 + '名');
  if (t.名簿未結び > 0) parts.push('名簿が未結び ' + t.名簿未結び + '名');
  return parts.join(' ／ ') + '（在籍 ' + t.母数 + '名）';
}
