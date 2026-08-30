// 連携の記録の見せ方（第64便・㉞ その6）。
//
// ★★★ 記録は【起きた順】に読むもの。並べ替えない。
//   失敗を上に上げると読みやすくなった気がするが、
//   「ログインできなかった → だから送れなかった」という**順番が消える**。
//   ★ 代わりに ① 失敗の件数を上に出す ② 失敗だけに絞れる の2つを置く。
//
// ★★ この画面でいちばん危ないのは【空っぽの見せ方】。
//   「記録がありません」と書いてよいのは、読めていて0件のときだけ。
//   ・まだ読めていない
//   ・絞り込みに合うものが無いだけ（記録自体はある）
//   ・そのサイトの記録がまだ1件も無い
//   この4つを混ぜない（引き継ぎメモ 3-5・設計メモ §186 の一覧版）。

export type MediaLogRow = {
  id: number;
  provider: string;
  slot: number;
  outcome: string;
  summary: string;
  createdAt: string;
};

// ────────────────────────────────────────────────
// どうなったか
// ────────────────────────────────────────────────

export type LogTone = 'ok' | 'bad' | 'warn' | 'unknown';

/** ★ 知らない値は 'unknown'。★ 成功側に倒さない（できたことにしない） */
export function outcomeTone(outcome: string): LogTone {
  if (outcome === 'ok') return 'ok';
  if (outcome === 'failed') return 'bad';
  if (outcome === 'stopped') return 'warn';
  return 'unknown';
}

export function outcomeLabel(outcome: string): string {
  if (outcome === 'ok') return 'できました';
  if (outcome === 'failed') return 'できませんでした';
  if (outcome === 'stopped') return '途中で止めました';
  return 'まだ分かりません';
}

/** ★★ 「できました」と書いてよいのは 'ok' だけ。ここを点検で固定する */
export function isFailure(outcome: string): boolean {
  return outcome === 'failed' || outcome === 'stopped';
}

// ────────────────────────────────────────────────
// 並び
// ────────────────────────────────────────────────

/**
 * 新しい順。★ 同じ時刻なら id の大きい順（あとから入った行が上）。
 * ★ outcome では並べ替えない（起きた順を壊さないため）。
 */
export function sortLogRows(rows: readonly MediaLogRow[]): MediaLogRow[] {
  return [...(rows ?? [])].sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    const va = Number.isFinite(ta) ? ta : 0;
    const vb = Number.isFinite(tb) ? tb : 0;
    if (va !== vb) return vb - va;
    return b.id - a.id;
  });
}

// ────────────────────────────────────────────────
// 絞り込み
// ────────────────────────────────────────────────

export type LogFilter = {
  /** '' はすべて */
  provider: string;
  /** '' はすべて。'failed' は failed と stopped の両方を拾う */
  outcome: string;
};

export const EMPTY_LOG_FILTER: LogFilter = { provider: '', outcome: '' };

export function hasLogFilter(f: LogFilter): boolean {
  return (f?.provider ?? '') !== '' || (f?.outcome ?? '') !== '';
}

/**
 * ★★ 上に出す件数のための絞り込み。サイトだけを残し、結果の絞り込みは外す（第65便・§205）。
 *   ★ 「うまくいかなかったものだけ」を見ているときこそ、
 *     【全体のうち何件か】を知りたい。両方に結果の絞り込みを効かせると、
 *     上の2つの数が同じ値になって、片方が何も語らなくなる。
 */
export function siteOnlyFilter(f: LogFilter): LogFilter {
  return { provider: f?.provider ?? '', outcome: '' };
}

export function filterLogRows(rows: readonly MediaLogRow[], f: LogFilter): MediaLogRow[] {
  const list = Array.isArray(rows) ? rows : [];
  const provider = f?.provider ?? '';
  const outcome = f?.outcome ?? '';
  return list.filter((r) => {
    if (provider !== '' && r.provider !== provider) return false;
    if (outcome === 'ok' && r.outcome !== 'ok') return false;
    // ★★ 「うまくいかなかったもの」は failed と stopped の両方。
    //   ★ stopped を落とすと、止めた記録が絞り込みから消える
    if (outcome === 'failed' && !isFailure(r.outcome)) return false;
    return true;
  });
}

// ────────────────────────────────────────────────
// 数
// ────────────────────────────────────────────────

/**
 * ★★★ 読めていなければ null。★ 0件と書かない。
 *   件数は「絞り込んだあと」の数を返す（画面に出しているものと一致させる）。
 */
export function logTally(input: {
  known: boolean;
  rows: readonly MediaLogRow[];
}): { total: number; failed: number } | null {
  if (input.known !== true) return null;
  const list = Array.isArray(input.rows) ? input.rows : [];
  return {
    total: list.length,
    failed: list.filter((r) => isFailure(r.outcome)).length,
  };
}

// ────────────────────────────────────────────────
// 空っぽのときに何と書くか
// ────────────────────────────────────────────────

export type LogEmptyReason = 'loading' | 'filtered' | 'site_empty' | 'none';

/**
 * ★★★ 空の理由を1つに決める。★ 「記録がありません」で全部を片づけない。
 *   ★ 順番が要点：読めているかを先に見る。読めていないのに「ありません」と言わない。
 */
export function logEmptyReason(input: {
  known: boolean;
  filter: LogFilter;
  /** 絞り込む前の総数。★ 0 なら、そもそも記録が1件も無い */
  totalBeforeFilter: number;
}): LogEmptyReason {
  if (input.known !== true) return 'loading';
  const total = Number.isFinite(input.totalBeforeFilter) ? input.totalBeforeFilter : 0;
  if (total <= 0) return 'none';
  // ★ 記録はあるのに出ていない ＝ 絞り込みのせい
  if ((input.filter?.provider ?? '') !== '') return 'site_empty';
  if (hasLogFilter(input.filter)) return 'filtered';
  return 'none';
}

export function logEmptyMessage(reason: string, siteName: string): string {
  if (reason === 'loading') return '記録を読み込んでいます。';
  // ★★ サイトを選んでいるときは「そのサイトの記録がまだ無い」と言う。
  //   ★ 「該当なし」だと、連携が動いていないのか絞り込みのせいか分からない
  if (reason === 'site_empty') return `${siteName}の記録は、まだありません。`;
  if (reason === 'filtered') return 'この絞り込みに合う記録はありません。絞り込みを外すと表示されます。';
  return 'まだ記録はありません。';
}

// ────────────────────────────────────────────────
// もっと見る
// ────────────────────────────────────────────────

export const LOG_LIMIT_STEPS: readonly number[] = [50, 200, 500];

/** ★ これ以上増やせないときは null。★ 同じボタンを押し続けられる形にしない */
export function nextLogLimit(current: number): number | null {
  const now = Number.isFinite(current) ? current : LOG_LIMIT_STEPS[0];
  for (const step of LOG_LIMIT_STEPS) {
    if (step > now) return step;
  }
  return null;
}
