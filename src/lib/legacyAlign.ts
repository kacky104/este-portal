// 以前のバッジ・改行なしの紹介文を【今の決まり】に揃える（第1125便・2026-10-03・カッキーさんの決定）。★ 純粋関数のみ。
//
// ★★★ 何を揃えるか（カッキーさんの決め）
//   対象の店は アイリス（salon_id 3）と AROMA-May（salon_id 12）の2店だけ。★ ほかの店は触らない
//     （ラビリンスなど、店舗様が自分で選んだバッジ・書いた紹介文がある）。
//   バッジ … ① 今あるバッジは消さない（経験・キャリアも残す）。
//            ② 雰囲気・性格が1つも無ければ、くじで1つ足す。スキルが1つも無ければ、くじで1つ足す。
//               ★ くじは自動の口と同じ（pickMoodBadge / pickSkillBadge・id で決まる）。
//            ③ 足して6個を超えるときは、外見・タイプの【後ろ】から外す（数値で決まる 低身長・高身長・巨乳 は最後まで残す）。
//               外せる外見が無ければ足さない（skipped に入れて返す。黙って消さない）。
//            ★ バッジが空の方は触らない（自動の口 therapist-badge-auto の仕事。ここで足すと「空」でなくなり、自動の対象から外れる）。
//            ★ ランク・人気のくじ（30%）はここでは引かない（揃えるのは「雰囲気・スキルが無い」だけ）。
//   紹介文 … 改行が1つも無い文章を、文の切れ目で段落に分ける（段落の間は1行あける）。
//            ★★ 文字は1字も変えない。★ 入れるのは改行だけ（点検と、保存の前の照合で固定する）。
//            ★ すでに改行がある文章は触らない（店舗様が自分で整えた形を崩さない）。
//
// ★ 何度流しても同じ（2回目は「雰囲気もスキルもある」「改行がある」ので何も変わらない）。

import { MAX_BADGES, getBadgeCategory, sanitizeBadges, sortBadges } from './therapistBadges';
import { NUMERIC_BADGES, pickMoodBadge, pickSkillBadge } from './therapistBadgePrompt';

/** ★ 揃えてよい店（この2店だけ）。★ 足すときはカッキーさんの決定が要る */
export const LEGACY_ALIGN_SALON_IDS: readonly number[] = [3, 12];

// ────────────────────────────── バッジ ──────────────────────────────

export type LegacyBadgePlan = {
  /** いま入っているバッジ（知らない語・重複を除き、カテゴリ順） */
  before: string[];
  /** 保存する内容（変えないときは before と同じ） */
  after: string[];
  /** くじで足した語 */
  added: string[];
  /** 6個に収めるために外した外見・タイプの語 */
  dropped: string[];
  /** 枠が無くて足せなかった語 */
  skipped: string[];
  changed: boolean;
};

export function alignLegacyBadges(therapistId: number, current: unknown): LegacyBadgePlan {
  const before = sanitizeBadges(current);
  const same: LegacyBadgePlan = { before, after: before, added: [], dropped: [], skipped: [], changed: false };
  // ★ 空は触らない（自動の口の仕事）
  if (before.length === 0) return same;

  const has = (cat: 'mood' | 'skill') => before.some((b) => getBadgeCategory(b) === cat);
  const want: string[] = [];
  if (!has('mood')) {
    const m = pickMoodBadge(therapistId);
    if (m) want.push(m);
  }
  if (!has('skill')) {
    const s = pickSkillBadge(therapistId);
    if (s) want.push(s);
  }
  if (want.length === 0) return same;

  // ★ 外してよい順: 数値で決まらない外見を後ろから → それも無ければ数値の語を後ろから
  const looks = before.filter((b) => getBadgeCategory(b) === 'look');
  const droppable = [
    ...looks.filter((b) => !NUMERIC_BADGES.includes(b)).reverse(),
    ...looks.filter((b) => NUMERIC_BADGES.includes(b)).reverse(),
  ];

  const added: string[] = [];
  const dropped: string[] = [];
  const skipped: string[] = [];
  let size = before.length;
  for (const w of want) {
    if (size < MAX_BADGES) {
      added.push(w);
      size++;
      continue;
    }
    const d = droppable.shift();
    if (d === undefined) {
      skipped.push(w);
      continue;
    }
    dropped.push(d);
    added.push(w);
  }
  if (added.length === 0) return { ...same, skipped };

  const after = sortBadges([...before.filter((b) => !dropped.includes(b)), ...added]);
  return { before, after, added, dropped, skipped, changed: true };
}

// ────────────────────────────── 紹介文 ──────────────────────────────

/** 文の終わりの記号 */
const ENDERS = '。！？!?♪';
/** 文の終わりの記号に続いて、同じ文に含める記号 */
const TRAILERS = '☆★…';
const OPENERS = '「『（(【［[〈《';
const CLOSERS = '」』）)】］]〉》';
const PICTO = /\p{Extended_Pictographic}/u;
/** 文の終わりの記号に続く飾り（☆・…・絵文字。絵文字の後ろに付く見えない符号も含む） */
const isTrailer = (ch: string) => TRAILERS.includes(ch) || ch === '\uFE0F' || ch === '\u200D' || PICTO.test(ch);

/**
 * 文に分ける。★ 文字は変えない（つなげば元の文章に戻る）。
 *   ★ かっこの中（「スタイル良っ！可愛い！」）では切らない。
 *   ★ 「！！」「。♪」「！✨」のように記号が続くときは、最後の記号までを1文にする。
 */
export function splitSentences(text: string): string[] {
  const chars = Array.from(String(text ?? ''));
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  // ★ 文の終わりの記号を見たあと、続く記号（！！・♪・絵文字）を読んでいる間は true
  let ended = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    buf += ch;
    if (OPENERS.includes(ch)) {
      depth++;
      ended = false;
    } else if (CLOSERS.includes(ch)) {
      depth = Math.max(0, depth - 1);
      ended = false;
    } else if (depth === 0 && ENDERS.includes(ch)) {
      ended = true;
    } else if (!(ended && isTrailer(ch))) {
      ended = false;
    }
    if (!ended) continue;
    const next = chars[i + 1];
    if (next !== undefined && (ENDERS.includes(next) || isTrailer(next))) continue;
    out.push(buf);
    buf = '';
    ended = false;
  }
  if (buf.trim().length > 0) out.push(buf);
  else if (buf.length > 0 && out.length > 0) out[out.length - 1] += buf;
  return out;
}

/** 空白を除いた字数 */
const bareLen = (s: string) => s.replace(/\s/g, '').length;

/**
 * 文の並びを段落に分ける（今の決まり: 3段落くらい・1段落は2〜3文）。
 *   文が 3つ以下 … 分けない（1段落のまま）
 *   文が 4〜5    … 2段落
 *   文が 6〜9    … 3段落
 *   文が 10以上  … 1段落3文までで、要るだけ
 * ★ 1段落は必ず2〜3文。★ その中で、いちばん長い段落がいちばん短くなる分け方を選ぶ（同じなら前を短く）。
 * @returns 各段落の文の数（例: [2, 3]）。分けないときは [n]
 */
export function paragraphSizes(sentences: readonly string[]): number[] {
  const n = sentences.length;
  if (n <= 3) return [n];
  const k = n <= 5 ? 2 : Math.max(3, Math.ceil(n / 3));
  const len = sentences.map(bareLen);
  const sum = (from: number, size: number) => len.slice(from, from + size).reduce((a, b) => a + b, 0);

  // best[i][j] = i 文目から最後までを j 段落に分けたときの「いちばん長い段落の字数」と、その分け方
  const memo = new Map<string, { worst: number; sizes: number[] } | null>();
  const solve = (i: number, j: number): { worst: number; sizes: number[] } | null => {
    const rest = n - i;
    if (j === 0) return rest === 0 ? { worst: 0, sizes: [] } : null;
    if (rest < 2 * j || rest > 3 * j) return null;
    const key = i + ':' + j;
    if (memo.has(key)) return memo.get(key) ?? null;
    let best: { worst: number; sizes: number[] } | null = null;
    for (const size of [2, 3]) {
      const tail = solve(i + size, j - 1);
      if (!tail) continue;
      const worst = Math.max(sum(i, size), tail.worst);
      if (best === null || worst < best.worst) best = { worst, sizes: [size, ...tail.sizes] };
    }
    memo.set(key, best);
    return best;
  };
  return solve(0, k)?.sizes ?? [n];
}

export type ParagraphPlan = {
  /** 保存する内容（変えないときは元のまま） */
  after: string;
  changed: boolean;
  /** 文の数 */
  sentences: number;
  /** 段落ごとの文の数 */
  sizes: number[];
  /** 変えない理由（変えるときは ''） */
  reason: '' | '空' | '改行あり' | '文が3つ以下' | '照合で不一致';
};

/**
 * ★★★ 改行の無い紹介文を段落に分ける。★ 文字は1字も変えない（最後に照合する）。
 */
export function alignLegacyParagraphs(text: unknown): ParagraphPlan {
  const raw = typeof text === 'string' ? text : '';
  const flat = raw.replace(/\r\n?/g, '\n').trim();
  const keep = (reason: ParagraphPlan['reason'], sentences = 0): ParagraphPlan =>
    ({ after: raw, changed: false, sentences, sizes: sentences > 0 ? [sentences] : [], reason });
  if (flat.length === 0) return keep('空');
  // ★ 改行が1つでもあれば触らない（店舗様が整えた形を崩さない）
  if (flat.includes('\n')) return keep('改行あり');

  const sentences = splitSentences(flat);
  const sizes = paragraphSizes(sentences);
  if (sizes.length <= 1) return keep('文が3つ以下', sentences.length);

  const paras: string[] = [];
  let at = 0;
  for (const size of sizes) {
    paras.push(sentences.slice(at, at + size).join('').trim());
    at += size;
  }
  const after = paras.join('\n\n');
  // ★★★ 照合: 空白を除いて元と同じでなければ保存しない（文字を変えていないことの証明）
  if (after.replace(/\s/g, '') !== raw.replace(/\s/g, '')) return keep('照合で不一致', sentences.length);
  return { after, changed: true, sentences: sentences.length, sizes, reason: '' };
}
