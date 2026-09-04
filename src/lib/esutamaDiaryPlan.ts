// 「今この店で、誰のどの日記をエステ魂へ送るか」を決める（第133便・2026-09-04）。
// ★ 純粋関数（禁則180）。★ DBもネットワークも触らない。
//
// ★★★ なぜ decideDiaryTarget（第132便）と分けるか
//   decideDiaryTarget は【その人に送ってよいか】だけを見る。
//   ここはもう1つ別のことを足す: **送るものがあるか**。
//   ★ 「送ってよい人」と「送るものがある人」は別。★ 混ぜると 0件の理由が読めなくなる。
//
// ★★★ 相手の利用状況は【魂セラピスト一覧に cast_id があるか】で決まる。
//   ★ 名前では突き合わせない。★ 2026-09-04 に「さら」を探して【さくら】が返った。
//   ★★ 一覧を読めていないときは 'unknown'。★ 「始めていない」と決めつけない。
//
// ★★★ 送る日記は【未送信のうち一番新しい1件】。★ まとめて送らない。
//   ★ 日記は上書きではなく投稿。★ しかもエステ魂は店舗側から消せない（2026-09-03 実測）。
//   ★ 一度に何本も出すのは、間違えたときの後始末が重すぎる。

import { decideDiaryTarget, type DiaryTargetReason } from './esutamaDiaryTargets';
import type { ConsentState, MediaAccountState } from './therapistMediaConsent';

/** 送れない理由。★ 第132便の5つに【送るものがない】を足した6つ。 */
export type DiaryPlanReason = DiaryTargetReason | 'no_diary';

/** 1人ぶんの材料。★ 呼び出し側（DB 側）が集めて渡す。 */
export type DiaryCandidate = {
  therapistId: number;
  name: string;
  /** 了承（therapist_media_consent）。★ 行が無いときは 'unknown' */
  consent: ConsentState;
  /** 名簿の結び（therapist_media_ids の esutama）。★ 無ければ null */
  castId: string | null;
  /**
   * まだ送っていない日記のID（★ 新しい順）。
   * ★ 空でも「日記が1件も無い」とは限らない（全部送り済みかもしれない）。
   */
  unsentDiaryIds: readonly string[];
  /** ★ その人の日記が1件でもあるか。★ 「まだ書いていない」と「全部送った」を分けるため */
  hasAnyDiary: boolean;
};

/** 1人ぶんの結論。 */
export type DiaryPlanRow = {
  therapistId: number;
  name: string;
  castId: string | null;
  /** 送るならその日記。送らないなら null */
  diaryId: string | null;
  ok: boolean;
  reason: DiaryPlanReason | null;
  message: string;
};

/**
 * ★★★ 相手の利用状況を決める。
 * @param listRead 魂セラピスト一覧を【読めたか】。★ 読めていないなら全員 'unknown'
 */
export function esutamaAccountState(
  castId: string | null,
  activeCastIds: ReadonlySet<string>,
  listRead: boolean,
): MediaAccountState {
  // ★ 読めていないのに「始めていない」と言わない（引き継ぎメモ 3-5）
  if (!listRead) return 'unknown';
  const id = String(castId ?? '').trim();
  // ★★ 結びが無いと、その人が一覧に居るかを言えない。★ 'not_started' と混ぜない
  if (!/^\d{1,12}$/.test(id)) return 'unknown';
  return activeCastIds.has(id) ? 'started' : 'not_started';
}

/**
 * ★★ 1人ぶんの結論を出す。
 *
 * ★ 順番:
 *   ① 送るものがあるか（無ければ他の理由を並べない。★ 店舗様は何もしなくてよい）
 *   ② decideDiaryTarget（了承 → 名簿の結び → 利用状況）
 */
export function planOneDiary(
  c: DiaryCandidate,
  activeCastIds: ReadonlySet<string>,
  listRead: boolean,
): DiaryPlanRow {
  const base = { therapistId: c.therapistId, name: c.name, castId: c.castId ?? null };

  // ★★ 「まだ書いていない」は故障ではない。★ 赤くしない
  if (!c.hasAnyDiary) {
    return { ...base, diaryId: null, ok: false, reason: 'no_diary', message: '送る写メ日記がまだありません' };
  }
  const diaryId = c.unsentDiaryIds[0] ?? null;
  const alreadySent = diaryId === null;

  const v = decideDiaryTarget({
    consent: c.consent,
    account: esutamaAccountState(c.castId, activeCastIds, listRead),
    castId: c.castId,
    alreadySent,
  });
  if (!v.ok) return { ...base, diaryId: null, ok: false, reason: v.reason, message: v.message };
  return { ...base, diaryId, ok: true, reason: null, message: '送れます' };
}

/** 店ぶんまとめて。★ 並びは渡された順のまま（★ 点検で固定できる） */
export function planEsutamaDiaries(input: {
  candidates: readonly DiaryCandidate[];
  /** 魂セラピスト一覧にあった cast_id（active のみ） */
  activeCastIds: readonly string[];
  /** 一覧を読めたか */
  listRead: boolean;
}): DiaryPlanRow[] {
  const set = new Set(input.activeCastIds.map((s) => String(s).trim()));
  return input.candidates.map((c) => planOneDiary(c, set, input.listRead));
}

export type DiaryPlanTally = {
  母数: number;
  送れる: number;
  送信済み: number;
  日記がまだ: number;
  了承なし: number;
  未開始: number;
  利用状況が不明: number;
  名簿未結び: number;
};

export function tallyDiaryPlan(rows: readonly DiaryPlanRow[]): DiaryPlanTally {
  const t: DiaryPlanTally = {
    母数: rows.length, 送れる: 0, 送信済み: 0, 日記がまだ: 0,
    了承なし: 0, 未開始: 0, 利用状況が不明: 0, 名簿未結び: 0,
  };
  for (const r of rows) {
    if (r.ok) { t.送れる++; continue; }
    if (r.reason === 'already_sent') t.送信済み++;
    else if (r.reason === 'no_diary') t.日記がまだ++;
    else if (r.reason === 'not_agreed') t.了承なし++;
    else if (r.reason === 'not_started') t.未開始++;
    else if (r.reason === 'account_unknown') t.利用状況が不明++;
    else if (r.reason === 'no_cast_id') t.名簿未結び++;
  }
  return t;
}

/**
 * ★★ 1行のまとめ。★ 0のものは出さない。★ ただし【送れる】は0でも必ず出す。
 *   ★ 0件のときこそ「なぜ0なのか」が要る（第35便の反省6）。
 */
export function diaryPlanSummary(t: DiaryPlanTally): string {
  const parts = ['送れる ' + t.送れる + '名'];
  if (t.送信済み > 0) parts.push('送信済み ' + t.送信済み + '名');
  if (t.日記がまだ > 0) parts.push('日記がまだ ' + t.日記がまだ + '名');
  if (t.了承なし > 0) parts.push('ご了承がまだ ' + t.了承なし + '名');
  if (t.名簿未結び > 0) parts.push('名簿が未結び ' + t.名簿未結び + '名');
  if (t.未開始 > 0) parts.push('魂セラピスト未開始 ' + t.未開始 + '名');
  if (t.利用状況が不明 > 0) parts.push('利用状況が未確認 ' + t.利用状況が不明 + '名');
  return parts.join(' ／ ') + '（在籍 ' + t.母数 + '名）';
}

/**
 * ★★★ 実弾は【1人だけ】。★ 指定された1人を取り出す。
 *   ★ 見つからない・送れないときは理由を返す。★ 黙って別の人を送らない。
 */
export function pickOneToSend(
  rows: readonly DiaryPlanRow[],
  therapistId: number,
): { ok: true; row: DiaryPlanRow } | { ok: false; message: string } {
  const row = rows.find((r) => r.therapistId === therapistId);
  if (!row) return { ok: false, message: 'この店舗の在籍に therapistId=' + therapistId + ' が見つかりません' };
  if (!row.ok || !row.diaryId) return { ok: false, message: row.name + 'さん: ' + row.message };
  return { ok: true, row };
}
