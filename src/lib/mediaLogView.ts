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
  /**
   * ★★★ 店舗様の画面に出す行か（第149便）。★ 決めるのは src/lib/mediaAudit.ts の isShopVisibleAudit。
   *   ★ ここでは【受け取った旗を読むだけ】。★ この画面で判定し直さない（物差しは1本）。
   *   ★★ 省略・undefined は【出す】。★ 印が無い行を黙らせない。
   */
  visible?: boolean;
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
// ★★★ くわしい記録（第149便）
// ────────────────────────────────────────────────
//
// ★★ 「連携の記録」は【店舗様のための画面】であって、こちらの作業ログではない。
//   ★ 「確かめる」を1回押すと、人ごとの読み取りが23人ぶん（46行）並んでいた。
//     ★ 押したご本人が「何か動き続けている」と不安になった（2026-09-04 23:00）。
//   ★★★ 消すのではなく【たたむ】。★ 記録は残っている。開けば読める。
//     ★ 完全に消すと「フクエスが何をしたか」を店舗様がご自分で確かめられなくなる。

/** ★ 旗が無ければ出す（既定は出す）。★ false と書いてあるときだけ、たたむ */
export function isVisibleLogRow(r: MediaLogRow): boolean {
  return r?.visible !== false;
}

/** 画面に並べる行。★ showDetail が true なら、たたんだ行も出す */
export function visibleLogRows(rows: readonly MediaLogRow[], showDetail: boolean): MediaLogRow[] {
  const list = Array.isArray(rows) ? rows : [];
  return showDetail === true ? [...list] : list.filter(isVisibleLogRow);
}

/** たたんである行の数。★ 0 なら折りたたみのボタンごと出さない */
export function hiddenLogCount(rows: readonly MediaLogRow[]): number {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((r) => !isVisibleLogRow(r)).length;
}

/**
 * 折りたたみのボタンの文字。
 * ★★ 「何が隠れているか」を書く。★ 「詳細」とだけ書くと、押す理由が分からない。
 * ★ 件数を必ず出す（第35便の反省6「0のときも理由が読み取れる形に」の裏返し）。
 */
export function detailToggleLabel(hidden: number, showDetail: boolean): string {
  const n = Number.isFinite(hidden) && hidden > 0 ? hidden : 0;
  if (n === 0) return '';
  return showDetail === true
    ? `くわしい記録（${n}件）を閉じる`
    : `くわしい記録も見る（${n}件）`;
}

/**
 * 折りたたみの下に出す説明。★ 「隠していた」ことを隠さない。
 * ★★ 「動き続けていたのでは」と思わせないために、【何をしていた行か】を書く。
 */
export function detailToggleNote(hidden: number): string {
  const n = Number.isFinite(hidden) && hidden > 0 ? hidden : 0;
  if (n === 0) return '';
  return `1人ずつ読み取った記録など、途中の細かい記録${n}件はたたんであります。フクエスが行ったことはすべて残っています。`;
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
// ★★★ 数えた範囲を言う（第66便・2026-08-30 の実データで見つかった）
// ────────────────────────────────────────────────

/**
 * ★★★ 見つかったこと：
 *   19:27「うまくいかなかったもの 6件」→ 19:51「3件」。★ 記録は消えないのに減った。
 *   ★ 直近50件だけを読んでいたので、取り込みが回って古い3件が窓の外へ押し出されていた。
 *   → 「もっと見る」で200件にしたら 59件／6件 に戻り、見立てが確かめられた。
 *
 * ★★ つまり「記録 50件」は総数ではなく【窓の大きさ】。画面はそう書いていなかった。
 *   ★ 数えた範囲を言わずに数だけ出すと、読む人は総数だと受け取る。
 *   ★★ 引き継ぎメモ 3-5「0件と分からないを混ぜない」と同じ形。
 *     ここでは「全部で6件」と「読んだ範囲に6件」を混ぜない。
 */
export type LogScope = 'unknown' | 'all' | 'window';

export function logScope(input: { known: boolean; loaded: number; limit: number; more?: boolean }): LogScope {
  if (input.known !== true) return 'unknown';
  // ★★★ 第149便: サーバーが「この先にまだある」と言っているなら、行数を数えるまでもなく窓。
  //   ★ たたむ行が窓を食うと、出す行の数だけでは見分けられない。
  //   ★ 断る側へ倒す（総数だと言い切らない）のは元の判定と同じ向き。
  if (input.more === true) return 'window';
  const loaded = Number.isFinite(input.loaded) ? input.loaded : 0;
  const limit = Number.isFinite(input.limit) ? input.limit : 0;
  // ★ 読めた件数が上限ちょうど ＝ この先にまだあるかもしれない。
  //   ★ 「ちょうど全部が上限と同じ数だった」場合も window と言う。
  //     ★ 多めに断る側へ倒す（総数だと言い切らない）。
  return loaded >= limit && limit > 0 ? 'window' : 'all';
}

/** 件数の見出し。★ 窓のときだけ「直近◯件」と断る */
export function logCountLabel(input: { scope: string; siteName: string; limit: number }): string {
  const base = (input.siteName ?? '') === '' ? '記録' : `${input.siteName}の記録`;
  if (input.scope === 'window') return `${base}（直近${input.limit}件）`;
  return base;
}

/** 数の下に出す断り書き。★ 窓でなければ何も書かない（空文字） */
export function logScopeNote(input: { scope: string; limit: number }): string {
  if (input.scope !== 'window') return '';
  return `いまは直近${input.limit}件だけを数えています。「もっと見る」を押すと増えることがあります。`;
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
