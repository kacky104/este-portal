// 並びのシード（src/lib/shuffle.ts）の自己点検（第386便・2026-09-15）。
//
// ★★★ ここで危ないのは:
//   ・朝6時の区切りがズレる → 「1日1回」のはずが日付をまたいだ深夜に2回変わる
//   ・同じ営業日のうちに値が変わる → リロードのたびに並びが動く（ISR が焼き直るたび別物）
//   ・salt が効かない        → TOP と地域ページが同じ並びになる
//   ・入力を壊す            → 呼び出し元の配列が書き換わる
//
//   使い方:  npm run check:shuffleseed

const S = require(require('path').join(__dirname, '..', '_tmpcheck', 'shuffle.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const ne = (name, got, notWant) => {
  if (JSON.stringify(got) === JSON.stringify(notWant)) { console.log('NG ' + name + '（同じになってしまった）'); fail++; }
  else console.log('ok ' + name);
};

// ★ JST の時刻（ミリ秒）
const jst = (iso) => Date.parse(iso + '+09:00');

console.log('── 1. ★★★ 営業日のシード（朝6時区切り） ──');
eq('★ 昼はその日', S.dailySeedJST(jst('2026-09-15T15:00:00')), 20260915);
eq('★★ 朝6時ちょうどで新しい日になる', S.dailySeedJST(jst('2026-09-16T06:00:00')), 20260916);
eq('★★★ 朝5時59分はまだ前の日', S.dailySeedJST(jst('2026-09-16T05:59:00')), 20260915);
eq('★★★ 深夜0時も前の日のまま（★ ここがズレると深夜に2回変わる）', S.dailySeedJST(jst('2026-09-16T00:00:00')), 20260915);
eq('★★ 夜23時59分も同じ日', S.dailySeedJST(jst('2026-09-15T23:59:00')), 20260915);
eq('★ 月をまたぐ', S.dailySeedJST(jst('2026-10-01T06:00:00')), 20261001);
eq('★★ 月末の朝5時は前月の最終日', S.dailySeedJST(jst('2026-10-01T05:00:00')), 20260930);

console.log('\n── 2. ★★ 同じ営業日のうちは動かない ──');
{
  const a = S.dailySeedJST(jst('2026-09-15T06:00:00'));
  const b = S.dailySeedJST(jst('2026-09-15T12:34:00'));
  const c = S.dailySeedJST(jst('2026-09-16T05:59:59'));
  eq('★★★ 6:00 と 12:34 と 翌5:59 が同じ', [a === b, b === c], [true, true]);
}

console.log('\n── 3. 並びそのもの ──');
{
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const w = () => 1;
  const t1 = S.weightedShuffleDaily(items, 'home', w);
  const t2 = S.weightedShuffleDaily(items, 'home', w);
  eq('★★ 同じ営業日・同じ salt なら同じ並び', t1, t2);
  eq('★ 中身は増えも減りもしない', t1.slice().sort((a, b) => a - b), items);
  eq('★★ 入力を壊さない', items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  ne('★★★ salt が違えば並びも違う（TOP と地域ページ）', t1, S.weightedShuffleDaily(items, 'area:tenjin', w));
  eq('★ 空でも落ちない', S.weightedShuffleDaily([], 'home', w), []);
  eq('★ 1件なら1件', S.weightedShuffleDaily([7], 'home', w), [7]);
}

console.log('\n── 4. ★★ 重み（カード上位表示の下駄） ──');
{
  // ★ 重みの大きいものが「前に来やすい」。★ 確定ではないので、たくさん試して割合で見る
  const items = Array.from({ length: 20 }, (_, i) => i);
  const heavy = new Set([0, 1]);           // ★ この2つだけ重み3
  let topHits = 0;
  const TRIES = 200;
  for (let i = 0; i < TRIES; i++) {
    // ★ salt を変えて別の並びを作る（seed を直接いじらずに散らす）
    const out = S.weightedShuffleDaily(items, 'try:' + i, (x) => (heavy.has(x) ? 3 : 1));
    if (heavy.has(out[0])) topHits++;
  }
  // ★ 重み無しなら 2/20 = 10%。★ 重み3なら明確に増える（★ 目安として20%以上）
  eq('★★★ 重い要素が先頭に来る割合が上がる', topHits / TRIES > 0.2, true);
}

console.log('\n── 5. ★ 前からある関数は残っている ──');
eq('★ 30分シードは残す（他の場所がまだ使う）', typeof S.thirtyMinSeed, 'function');
eq('★ 6時間シードも残す（第386便で呼ばなくなっただけ）', typeof S.sixHourSeed, 'function');
eq('★ 6時間版の関数も残す', typeof S.weightedShuffleEvery6h, 'function');

console.log(fail === 0 ? '\n★ すべて通った' : `\n★★ ${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
