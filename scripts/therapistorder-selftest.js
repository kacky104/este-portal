// セラピスト一覧の並び順（src/lib/therapistOrder.ts）の自己点検（第178便）。
//
// ★★★ なぜ要るか
//   DBに order が無いので、並びは画面側の判断だけで決まる。★ 崩れても静かに崩れる。
//   ★★ 出勤ページとセラピストページが【同じ順】であることが要件（カッキーさん・2026-09-06）。
//     ★ 式を1か所にまとめたので、ここが通れば両方の画面が揃う。
//
//   使い方:  npm run check:therapistorder

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'therapistOrder.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// ── 点数（小さいほど上）──
eq('出勤あり・写真あり = 0', m.therapistOrderRank(true, true), 0);
eq('出勤あり・写真なし = 1', m.therapistOrderRank(true, false), 1);
eq('出勤なし・写真あり = 2', m.therapistOrderRank(false, true), 2);
eq('出勤なし・写真なし = 3', m.therapistOrderRank(false, false), 3);
// ★ 出勤の有無が写真より強い（★ 逆転させない）
eq('★ 出勤なし・写真あり より 出勤あり・写真なし が上',
  m.therapistOrderRank(true, false) < m.therapistOrderRank(false, true), true);

// ── 並べ替え ──
const rows = [
  { name: 'a', work: false, photo: false },
  { name: 'b', work: true,  photo: false },
  { name: 'c', work: false, photo: true  },
  { name: 'd', work: true,  photo: true  },
];
const sorted = m.sortTherapistsForList(rows, (t) => t.work, (t) => t.photo).map((t) => t.name);
eq('並び順は d → b → c → a', sorted, ['d', 'b', 'c', 'a']);

// ★ 同じ組の中は元の順のまま（安定）
const same = [
  { name: '1', work: true, photo: true },
  { name: '2', work: true, photo: true },
  { name: '3', work: true, photo: true },
];
eq('★ 同点は元の順のまま',
  m.sortTherapistsForList(same, (t) => t.work, (t) => t.photo).map((t) => t.name),
  ['1', '2', '3']);

// ★ 元の配列を壊さない（★ 画面の state をその場で並べ替えない）
const orig = [{ name: 'x', work: false, photo: false }, { name: 'y', work: true, photo: true }];
m.sortTherapistsForList(orig, (t) => t.work, (t) => t.photo);
eq('★ 渡した配列は変えない', orig.map((t) => t.name), ['x', 'y']);

eq('空の一覧は空のまま', m.sortTherapistsForList([], () => true, () => true), []);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
