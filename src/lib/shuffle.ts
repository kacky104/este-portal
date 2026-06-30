// seed付き決定論的シャッフル。
// 同じ seed・同じ入力なら必ず同じ結果（純粋関数・副作用なし）。
// 「同時刻内シャッフル」を一定時間固定したいとき（例：30分ごとに変える）に使う。

/** mulberry32：軽量な seed 付き疑似乱数。seed（32bit想定）から決定論的に [0,1) を返す関数を生成。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0; // 32bit 符号なしに正規化
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** seed から決定論的に Fisher–Yates シャッフルした新配列を返す（入力は破壊しない）。 */
export function seededShuffle<T>(array: readonly T[], seed: number): T[] {
  const arr = [...array];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * seed から決定論的な「重み付きシャッフル」をした新配列を返す（入力は破壊しない）。
 * weightOf が大きい要素ほど前に来やすいが、確定ではない（重み1の要素も上位に来得る）。
 *
 * 方式：Efraimidis–Spirakis の重み付き順序付け。各要素に key = u^(1/weight)（u は seed PRNG の [0,1)）
 * を割り当て、key の降順に並べる。weight が大きいほど key が大きくなりやすく前に来る。
 * weight が全要素 1.0 なら key = u となり、一様シャッフルと同じ分布（＝従来挙動）になる。
 * 同じ seed・同じ入力・同じ重みなら必ず同じ並び（純粋関数・副作用なし＝30分シードの再現性を保てる）。
 */
export function seededWeightedShuffle<T>(
  array: readonly T[],
  seed: number,
  weightOf: (item: T) => number
): T[] {
  const rand = mulberry32(seed);
  return array
    .map((item) => {
      const w = Math.max(weightOf(item), 1e-9); // 0/負の重みは極小に丸めて 1/w の発散を防ぐ
      const key = Math.pow(rand(), 1 / w); // u^(1/w)：重み大ほど 1 に寄りやすい
      return { item, key };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

/** 現在時刻（ミリ秒）から30分スロットの seed を作る。同じ30分の間は同じ値、30分ごとに変わる。 */
export function thirtyMinSeed(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (30 * 60 * 1000));
}

/** salt 文字列を 32bit ハッシュに（ページごとに並びを変えたい時用・FNV-1a）。 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * 30分ごとに1度だけ並びが変わる決定的シャッフル（入力は破壊しない）。
 * 同じ30分・同じ salt・同じ入力なら必ず同じ並び＝誰がリロードしても同じ、:00/:30 で入れ替わる。
 * salt を渡すと同じ30分でも別の並びになる（トップ/地域/各エリアを独立に回したい時に使う）。
 * 30分スロットはエポック基準（Date.now）なので JST でも :00/:30 にちょうど揃う。
 */
export function shuffleEvery30min<T>(items: readonly T[], salt = ""): T[] {
  return seededShuffle(items, (thirtyMinSeed() ^ hashString(salt)) >>> 0);
}
