// 求人一覧の30分間隔シード付きシャッフル（表示のみ・サーバー側でレンダリング時に適用）。
// シード = 30分バケット（Math.floor(Date.now() / 1_800_000)）。同一バケット内は決定的（何度呼んでも同じ並び）。
// 並びはISRキャッシュに焼き込まれ、バケット切替後の最初の再生成で入れ替わる（きっかり30分の切替は保証しない）。
// クライアント側での再シャッフルはしない（ハイドレーション不整合を作らない）。
// 既存のfetch関数は一切変更せず、取得後の配列にこれを適用する。入力配列は破壊しない（コピーを返す）。
const BUCKET_MS = 1_800_000; // 30分

// mulberry32：シード付き軽量PRNG（0以上1未満を返す）。同じシードなら同じ乱数列＝決定的。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 30分バケットをシードにしたシャッフル。入力を破壊せずコピーを返す。
// weightOf 未指定：従来どおり一様な Fisher–Yates シャッフル。
// weightOf 指定：重み付きシャッフル（Efraimidis–Spirakis）。重みが大きい要素ほど前
//   （＝一覧の上側）に来やすいが確定ではない。重みが全要素 1.0 なら一様シャッフルと同じ分布＝従来挙動。
//   バナー設置特典（job_boost=true の求人に重み JOB_BOOST_WEIGHT）で上側に来やすくするのに使う。
export function shuffleJobs<T>(jobs: T[], weightOf?: (item: T) => number): T[] {
  const seed = Math.floor(Date.now() / BUCKET_MS);
  const rand = mulberry32(seed);

  if (weightOf) {
    // 各要素に key = u^(1/weight)（u は seed PRNG の [0,1)）を割り当て、key 降順で並べる。
    // weight が大きいほど key が 1 に寄りやすく前に来る。weight 全1なら key=u＝一様シャッフル。
    return jobs
      .map((item) => {
        const w = Math.max(weightOf(item), 1e-9); // 0/負の重みは極小に丸めて 1/w の発散を防ぐ
        return { item, key: Math.pow(rand(), 1 / w) };
      })
      .sort((a, b) => b.key - a.key)
      .map((x) => x.item);
  }

  const out = jobs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
