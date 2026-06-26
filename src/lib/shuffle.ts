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

/** 現在時刻（ミリ秒）から30分スロットの seed を作る。同じ30分の間は同じ値、30分ごとに変わる。 */
export function thirtyMinSeed(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (30 * 60 * 1000));
}
