// 紹介文の【頻出フレーズ】を数える（第121便・2026-09-03）。★ 純粋関数（禁則180）。
//
// ★★★ なぜ要るか（2026-09-03・AROMAMay 様の試し打ち3人で実際に出た）
//   3人とも紹介文に「〜なのに（ながら）女性らしいラインがしっかりある」が入っていた。
//     ありな「スレンダーなのに女性らしいラインがしっかりあるスタイル」
//     かりん「細身ながら女性らしいラインがしっかりあるスタイル」
//     はなか「小柄ながら女性らしい曲線美を備えたスタイル」
//   ★ 出どころは therapistCopyPrompt.ts の【お手本そのもの】だった:
//     サンプル4「細身なのに女性らしいラインがしっかりあるスタイル抜群のセラピスト。」
//   ★★ 「お手本は文体と分量の参考。表現をそのまま流用しない」と書いてあるのに素通りしていた。
//
// ★★★ バッジの tally（第114便）と同じ思想。★ 数えるところをコードに置く。
//   ★ 毎回 SQL を書くと、忙しい日に数えなくなる。★ 数え直しがタダになると毎回確かめられる。
//   ★★ ただしバッジと違って【語彙の一覧が無い】。★ 何が決まり文句かは事前に分からない。
//     → 語を照合するのではなく、**文書をまたいで繰り返される部分文字列を見つける**。
//     ★ これなら、まだ気づいていない決まり文句も出てくる（CLICHE_WORDS の次の候補になる）。
//
// ★★★ 「何人に出たか」で数える。★ 1人の文書に何回出ても1と数える。
//   ★ 1人が同じ言い回しを2回使うのは文章の癖。★ 見たいのは【店の全員に並ぶこと】。

/** 頻出フレーズ1件。 */
export type PhraseCount = {
  /** その言い回し。 */
  phrase: string;
  /** 何人の紹介文に出たか（1人の中で何回出ても1）。 */
  count: number;
  /** 母数に対する割合（%・四捨五入）。 */
  ratio: number;
};

/** 数え方の調整。★ 既定のまま使うのが基本。 */
export type TallyOptions = {
  /** 数える言い回しの最短の長さ（既定8）。★ 短すぎると「セラピスト」だらけになる。 */
  minLen?: number;
  /** 最長の長さ（既定20）。 */
  maxLen?: number;
  /** 何人以上に出たものを拾うか（既定2）。 */
  minCount?: number;
  /** 返す件数（既定30）。 */
  top?: number;
};

export type TallyResult = {
  /** 数えた紹介文の数（★ 空の人は数に入れない）。 */
  母数: number;
  /** 空でなかった紹介文の平均字数（空白を除く）。 */
  平均字数: number;
  /** 頻出フレーズ。★ 多い順。 */
  頻出: PhraseCount[];
};

const DEFAULT_MIN_LEN = 8;
const DEFAULT_MAX_LEN = 20;
const DEFAULT_MIN_COUNT = 2;
const DEFAULT_TOP = 30;

/**
 * ★ 包含の吸収に回す候補の上限。
 *   ★ 吸収の比較は総当たり（O(n^2)）なので、先に多い順で切ってから比べる。
 *   ★ top の20倍あれば、吸収で消えるぶんを見込んでも足りる。
 */
const POOL_FACTOR = 20;
const POOL_MIN = 200;

/** 空白・改行を落とす。★ 字数の数え方（isLongEnough）と揃える。 */
function norm(s: string | null | undefined): string {
  return String(s ?? '').replace(/\s/g, '');
}

/**
 * 紹介文の束から、繰り返し出てくる言い回しを数える。
 *
 * ★★★ 使いどころは2つ:
 *   ① 流し切ったあと … 店の全員に同じ言い回しが並んでいないか（3人では見えない）
 *   ② 試し打ちのその場 … 今回の3〜5人に既に揃っていないか（★ 流す前に止められる）
 */
export function tallyPhrases(
  texts: Array<string | null | undefined>,
  opts?: TallyOptions,
): TallyResult {
  const minLen = Math.max(2, opts?.minLen ?? DEFAULT_MIN_LEN);
  const maxLen = Math.max(minLen, opts?.maxLen ?? DEFAULT_MAX_LEN);
  const minCount = Math.max(1, opts?.minCount ?? DEFAULT_MIN_COUNT);
  const top = Math.max(1, opts?.top ?? DEFAULT_TOP);

  // ★ 空の人は母数に入れない。★ 「空だった」と「数えた」を混ぜない（引き継ぎメモ 3-5）
  const docs = texts.map(norm).filter((t) => t.length > 0);
  const 母数 = docs.length;
  if (母数 === 0) return { 母数: 0, 平均字数: 0, 頻出: [] };

  const 平均字数 = Math.round(docs.reduce((a, d) => a + d.length, 0) / 母数);

  // ★ 文書ごとに「出た言い回しの集合」を作ってから数える＝1人で何回出ても1
  const counts = new Map<string, number>();
  for (const d of docs) {
    const seen = new Set<string>();
    for (let len = minLen; len <= maxLen; len++) {
      for (let i = 0; i + len <= d.length; i++) seen.add(d.slice(i, i + len));
    }
    for (const p of seen) counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  // ★ 多い順 → 長い順 → 五十音順（★ 同点の並びを毎回同じにする＝点検で固定できる）
  const byRank = (a: { phrase: string; count: number }, b: { phrase: string; count: number }) =>
    b.count - a.count || b.phrase.length - a.phrase.length || (a.phrase < b.phrase ? -1 : 1);

  const list = [...counts.entries()]
    .filter(([, c]) => c >= minCount)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort(byRank);

  const pool = list.slice(0, Math.max(top * POOL_FACTOR, POOL_MIN));

  // ★★★ 包含の吸収。★ 同じ人数に出た短い言い回しは、それを含む長いほうにまとめる。
  //   ★ 「女性らしいライン」も「女性らしいラインがしっかりある」も3人なら、長いほうだけ残す。
  //   ★★ 人数が違うなら【両方残す】。★ 「女性らしいライン」5人・「〜がしっかりある」3人は別の情報。
  const drop = new Set<string>();
  for (let i = 0; i < pool.length; i++) {
    for (let j = 0; j < pool.length; j++) {
      if (i === j) continue;
      const short = pool[i], long = pool[j];
      if (short.count !== long.count) continue;
      if (long.phrase.length <= short.phrase.length) continue;
      if (long.phrase.includes(short.phrase)) { drop.add(short.phrase); break; }
    }
  }

  const 頻出 = pool
    .filter((x) => !drop.has(x.phrase))
    .slice(0, top)
    .map((x) => ({ phrase: x.phrase, count: x.count, ratio: Math.round((x.count / 母数) * 100) }));

  return { 母数, 平均字数, 頻出 };
}

/**
 * ★★ 試し打ちの返事に出す短い注意文。★ 「揃っている」を人が読める形にする。
 * ★ 全員に出た言い回しがあれば、それを名指しで返す（黙って通さない）。
 * ★ 母数が1のときは何も言わない（1人では「揃っている」と言えない）。
 */
export function allSharedPhrases(result: TallyResult): string[] {
  if (result.母数 < 2) return [];
  return result.頻出.filter((p) => p.count === result.母数).map((p) => p.phrase);
}
