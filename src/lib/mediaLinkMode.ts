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

/**
 * 画面に出す名前。★ 知らない値は「未設定」にする（勝手に読み替えない）。
 *
 * ★★★ 2026-09-04（第141便）: 媒体名を決め打ちしていたので、受け取る形にした。
 *   ★ 呼び出し元がまだ無い（画面はどこもこれを使っていない）が、
 *     **使われた瞬間に「エステ魂なのに駅ちか」になる**ので、先に直しておく。
 *   ★ 名前を渡さなければ「連携サイト」と書く。★ 別の媒体の名前は絶対に出さない。
 */
export function linkModeTitle(mode: string | null | undefined, siteName?: string): string {
  const n = siteName && siteName.trim() ? siteName.trim() : '連携サイト';
  switch (mode) {
    case 'none': return '連携しない';
    case 'read': return `${n}から取り込んでいます`;
    case 'write': return `フクエスから${n}へ反映しています（毎回ご承認）`;
    case 'write_auto': return `フクエスから${n}へ自動で反映しています`;
    default: return '未設定';
  }
}

// ───────────────────────── 1回目の承認が済んでいるか ─────────────────────────

export type ApprovalHistory = {
  /** 最後に「書く向き」へ切り替えた時刻（監査ログ link_mode_changed）。ISO文字列 */
  switchedToWriteAt: string | null;
  /** 最後に駅ちかへ反映できた時刻（監査ログ write_work / outcome 'ok'）。ISO文字列 */
  lastWriteOkAt: string | null;
  /**
   * ★★★★ 【第331便】（2026-09-13・カッキーさん）: 「確かめたら、いまの媒体の内容と一致していた」時刻。
   *   ★ media_work_plans の created_at（★ change_count が 0 で、止めた理由も無い行）。
   *
   * ★★★ なぜ承認として数えるのか
   *   ・送るものが1つも無い ＝ 上書きの危険が【ゼロ】。
   *   ・それでも「人が画面を開いて、媒体の中身と突き合わせた」ことは変わらない（§54 が守りたいのはここ）。
   *
   * ★★★★ これが無いと【詰む】（第331便で見つけた穴）
   *   一致している枠は送るボタンが押せない（pushAvailability が no_change を返す）。
   *   → write_work の成功が永久に生まれない → 自動を選べない。
   *   ★ うっかり read に触ってすぐ戻した店舗は、まさに一致しているので、この穴に落ちる。
   */
  matchedAt?: string | null;
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
  const switched = msOf(h.switchedToWriteAt);
  if (switched === null) return false;   // ★ 切り替えの記録が無ければ自動にさせない
  const ok = msOf(h.lastWriteOkAt);
  const matched = msOf(h.matchedAt ?? null);
  // ★ 第331便: 「送れた」と「一致していた」の【新しいほう】を1回目とみなす
  const done = ok === null ? matched : (matched === null ? ok : Math.max(ok, matched));
  if (done === null) return false;
  return done >= switched;
}

// ───────────────────── 書く向きが「いつ始まったか」（第331便） ─────────────────────

/**
 * ★★★★ 【第331便】うっかり向きを変えて【すぐ戻した】ときは、1回目の承認をやり直させない。
 *
 * ★ なぜ要るか — 店舗様の画面は担当の方が触る。取り違えて「駅ちかから反映」にし、
 *   すぐ戻す、ということが起きる。★ そのたびに出勤の自動反映が止まり、
 *   24時間の見張り（WRITE_STALL_HOURS）が鳴るまで誰も気づかない。
 * ★★ ただし「本当に read で回してから戻した」場合は、媒体側の中身が変わっているので、
 *   これまでどおり人が1回見る。★ その線引きが【24時間】。
 */
export const WRITE_GAP_FORGIVE_HOURS = 24;

/** 向きを変えた記録の1行（監査ログ link_mode_changed から作る）。 */
export type LinkModeChange = {
  /** 変えた時刻（ISO文字列） */
  at: string;
  /** 変えた先の向き */
  mode: string;
};

/**
 * 「いまの書く向きが、いつ始まったか」を決める。★ rows は【新しい順】。
 *
 *   ・書く向きへの切り替え → そこを始まりの候補にして、さらに遡る
 *   ・書く向きから外れた記録 → そこで打ち切る（★ 危ないのは read/none から来たときだけ・§11-3）
 *     ★★ ただし外れていた時間が hours 以内なら【うっかり】とみなし、遡り続ける
 *
 * ★ 読めない時刻の行は飛ばす（勝手に「今」として扱わない）。
 * ★ いま書く向きでない枠には使わないこと（呼び出し側が向きで絞る）。
 */
export function writeSpanStart(
  rows: ReadonlyArray<LinkModeChange>,
  hours: number = WRITE_GAP_FORGIVE_HOURS,
): string | null {
  const limitMs = Math.max(0, hours) * 3600_000;
  let start: string | null = null;
  let backAtMs: number | null = null;   // ★ いま見ているうち、いちばん古い「書く向きへ戻った」時刻
  for (const r of rows) {
    const at = msOf(r.at);
    if (at === null) continue;
    if (isWriteDirection(r.mode)) {
      start = r.at;
      backAtMs = at;
      continue;
    }
    // ★ 書く向きから外れた記録
    if (backAtMs === null) break;             // ★ 書く向きより先に外れが来た＝いまは書く向きでない
    if (backAtMs - at <= limitMs) continue;   // ★ うっかり（hours 以内に戻した）→ さらに遡る
    break;                                    // ★ 本当に離れていた
  }
  return start;
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
