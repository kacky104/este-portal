// 連携の向きと「自動で反映するか」（第48便・純粋関数）。
//
// ★★★ 設計メモ 追記14。要点だけ:
//   ・自動にすると【指紋】という担保が消える。人が見た内容が存在しないため（§52・§53）。
//     → 代わりに blockers を厳しくする（workPlan.ts の AUTO_* しきい値）。
//   ・自動にしてよいのは【1回目の承認が通っている枠だけ】（§54）。
//     ★ 向きを read に戻してまた write にしたら、1回目からやり直しになる。
//       これは副作用ではなく狙い。§11-3「いちばん危ないのは切り替えた瞬間」を、
//       自動運転を入れても崩さないため。
//   ・状態は1列に持つ（§55）。auto を別の列にすると「read なのに auto」が作れてしまう。
//
// ★★ このファイルは通信もDBも触らない。時刻も引数で受ける（mediaLinkStall.ts と同じ作法）。

/**
 * 連携の向き。★ 1列の別の値なので、読みと書きが同時に立つことはない。
 *   none       … 連携しない
 *   read       … 駅ちかから読む
 *   write      … フクエスから書く（★ 毎回、人が承認する）
 *   write_auto … フクエスから書く（★ 承認なしで自動反映）
 */
export const LINK_MODES = ['none', 'read', 'write', 'write_auto'] as const;
export type LinkMode = (typeof LINK_MODES)[number];

export function isLinkMode(v: unknown): v is LinkMode {
  return typeof v === 'string' && (LINK_MODES as readonly string[]).includes(v);
}

/**
 * ★★★ 「駅ちかへ書く向き」か。write と write_auto の両方が該当する。
 *
 * ★ 既存の `=== 'write'` をここへ寄せる。直し忘れた箇所は false になり、
 *   **送らない側＝安全側**に倒れる（§55-1）。逆（read に混ざって書く）は起きない。
 * ★★ ただし安全側は「気づけない」でもある。直し忘れは「自動にしたのに何も起きない」
 *   として、第47便の見張り（stale）が24時間後に拾う（§55-2）。
 */
export function isWriteDirection(mode: string | null | undefined): boolean {
  return mode === 'write' || mode === 'write_auto';
}

/** 承認なしで自動反映する枠か。 */
export function isAutoPush(mode: string | null | undefined): boolean {
  return mode === 'write_auto';
}

/** 画面に出す名前。★ 知らない値は「未設定」にする（勝手に読み替えない）。 */
export function linkModeTitle(mode: string | null | undefined): string {
  switch (mode) {
    case 'none': return '連携しない';
    case 'read': return '駅ちかから取り込んでいます';
    case 'write': return 'フクエスから駅ちかへ反映しています（毎回ご承認）';
    case 'write_auto': return 'フクエスから駅ちかへ自動で反映しています';
    default: return '未設定';
  }
}

// ───────────────────────── 1回目の承認が済んでいるか ─────────────────────────

export type ApprovalHistory = {
  /** 最後に「書く向き」へ切り替えた時刻（監査ログ link_mode_changed）。ISO文字列 */
  switchedToWriteAt: string | null;
  /** 最後に駅ちかへ反映できた時刻（監査ログ write_work / outcome 'ok'）。ISO文字列 */
  lastWriteOkAt: string | null;
};

function msOf(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * ★★★ 自動にしてよいか（§54）。
 *
 *   条件は1つだけ: **いまの向きになってから、1回でも反映が成功していること。**
 *
 * ★ 切り替え時刻が読めないときは false（＝自動にさせない）。
 *   ★ mediaLinkStall.judgeWriteStall とは倒れる向きが逆になるが、どちらも同じ原則:
 *     **分からないときは、危なくない側に倒す。**
 *     あちらは「警告を出さない」が安全側、こちらは「自動にさせない」が安全側。
 */
export function hasApprovedOnce(h: ApprovalHistory): boolean {
  const ok = msOf(h.lastWriteOkAt);
  if (ok === null) return false;
  const switched = msOf(h.switchedToWriteAt);
  if (switched === null) return false;   // ★ 切り替えの記録が無ければ自動にさせない
  return ok >= switched;
}

// ───────────────────────── 自動を切る判断 ─────────────────────────

/** 何回続けて送れなければ自動を切るか。★ 第38便 relay_gave_up と同じ 3 回。 */
export const AUTO_GIVE_UP_STREAK = 3;

/** 反映の結果。'stopped' は「判断して止めた」＝こちらの不具合ではない。 */
export type PushOutcome = 'ok' | 'failed' | 'stopped';

/**
 * ★★ 連続失敗で自動を切るか（§56）。
 *
 * ★ 'stopped'（0件・急減・差分が大きい等）も数える。
 *   機械の故障ではないが、**人が見ないと進まない状態**であることは同じで、
 *   放っておくと「自動にしたのに何も起きない」が続く。
 *
 * @param recentOutcomes 新しい順。書き込みを試みた回の結果だけを渡すこと
 */
export function shouldGiveUpAuto(recentOutcomes: readonly PushOutcome[]): boolean {
  let streak = 0;
  for (const o of recentOutcomes) {
    if (o === 'ok') break;
    streak += 1;
    if (streak >= AUTO_GIVE_UP_STREAK) return true;
  }
  return false;
}

// ───────────────────────── いつ回すか ─────────────────────────

/**
 * ★ 自動反映の周期。取り込み（15分）と同じにしない（§57）。
 *   出勤は日単位で変わる。818フィールドの全件上書きPOSTを15分ごとに投げるのは相手に重い。
 */
export const AUTO_PUSH_INTERVAL_MIN = 30;

/**
 * この枠を、いま回す番か。
 * ★ 前回が分からないときは true（＝1回やる）。★ ここは「やらない」より「やる」が安全。
 *   やっても blockers が全部効いており、駅ちかを壊す道は残っていない。
 */
export function isDueForAutoPush(input: {
  lastAttemptAt: string | null;
  now: Date;
  intervalMin?: number;
}): boolean {
  const last = msOf(input.lastAttemptAt);
  if (last === null) return true;
  const now = input.now.getTime();
  if (!Number.isFinite(now)) return false;
  const min = (now - last) / 60_000;
  if (min < 0) return false;                        // 時計のずれ。次の周に回す
  return min >= (input.intervalMin ?? AUTO_PUSH_INTERVAL_MIN);
}
