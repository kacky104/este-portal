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

// ── ★★★ 店舗様が決めた順（コネックエフ・第1384便・2026-10-10・カッキーさんの決定）──
{
  const L = [
    { id: 1, name: 'あかね', hidden: false },
    { id: 2, name: 'うみ', hidden: false },
    { id: 3, name: 'えま', hidden: false },
    { id: 4, name: 'かな', hidden: false },
    { id: 5, name: 'いずみ', hidden: true },
    { id: 6, name: 'あい', hidden: true },
  ];
  const by = (order, list) => m.sortTherapistsByManual(list || L, (t) => t.id, (t) => t.name, (t) => t.hidden, order).map((t) => t.name);
  const kana = m.sortTherapistsByKana(L, (t) => t.name, (t) => t.hidden).map((t) => t.name);
  eq('★★★ まだ並べ替えたことが無い店（空・null・undefined）は、今までどおり あいうえお順', [by([]), by(null), by(undefined)], [kana, kana, kana]);
  eq('★★★ 決めた順に並ぶ・非公開の方は下（中は あいうえお順）', by([4, 3, 2, 1]), ['かな', 'えま', 'うみ', 'あかね', 'あい', 'いずみ']);
  eq('★★★ 並びに入っていない公開の方（新しく登録した方）は、いちばん上', by([4, 1]), ['うみ', 'えま', 'かな', 'あかね', 'あい', 'いずみ']);
  eq('★★ 非公開の方は、並びに入っていても下（公開の方の中だけで並べる）', by([5, 4, 3, 2, 1]), ['かな', 'えま', 'うみ', 'あかね', 'あい', 'いずみ']);
  eq('★ 消した方の id が残っていても無視・同じ id が2回あれば先のほう', by([99, 3, 1, 3, 2, 4]), ['えま', 'あかね', 'うみ', 'かな', 'あい', 'いずみ']);
  const before = L.map((t) => t.id);
  by([4, 3, 2, 1]);
  eq('★ 渡した配列は変えない', L.map((t) => t.id), before);

  // 保存する並び: 公開の方だけ・画面の上から順
  eq('★★★ 保存するのは公開の方の id を上から順に（非公開の方は入れない）', m.manualOrderToSave([L[3], L[4], L[0], L[1], L[5], L[2]], (t) => t.id, (t) => t.hidden), [4, 1, 2, 3]);
  // ★ 保存した並びで読み直すと、画面と同じ順に戻る
  const shown = [L[3], L[0], L[1], L[2], L[5], L[4]];
  eq('★★★ 保存 → 読み直しで同じ順', by(m.manualOrderToSave(shown, (t) => t.id, (t) => t.hidden)), shown.map((t) => t.name));

  // つまんで動かす途中の並び
  const ids = (list) => list.map((t) => t.id);
  const P = L.slice(0, 4);
  eq('★★ 下へ動かす（1 を 3 の位置へ）', ids(m.moveInList(P, (t) => t.id, 1, 3)), [2, 3, 1, 4]);
  eq('★★ 上へ動かす（4 を 2 の位置へ）', ids(m.moveInList(P, (t) => t.id, 4, 2)), [1, 4, 2, 3]);
  eq('★ 動かせないとき（同じ人・居ない人）は同じ配列を返す', [m.moveInList(P, (t) => t.id, 2, 2) === P, m.moveInList(P, (t) => t.id, 9, 2) === P, m.moveInList(P, (t) => t.id, 2, 9) === P], [true, true, true]);
  eq('★ 渡した配列は変えない（動かす途中）', ids(P), [1, 2, 3, 4]);

  // ★★ 画面と受け口が、この決まりを使っている（式を別に書かない）
  const fs = require('fs'), path = require('path');
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const girls = read('src', 'app', 'actions', 'conecfGirls.ts');
  const sched = read('src', 'app', 'actions', 'conecfSchedule.ts');
  const board = read('src', 'app', 'conecf', 'girls', 'sync', 'SiteCompareBoard.tsx');
  eq('★★★ セラピスト一覧・週間スケジュール・セラピスト登録状況一覧が、同じ並べ方（sortTherapistsByManual）',
    [girls, sched, board].map((s) => /sortTherapistsByManual\(/.test(s)), [true, true, true]);
  const save = girls.slice(girls.indexOf('export async function saveConecfGirlOrder'));
  eq('★★★ 保存は「切り替え済み・止めていない自店」だけ（resolveSalon の write）・他店の id を断る・therapists の行は書き換えない',
    [/resolveSalon\(\{ write: true \}\)/.test(save.slice(0, 400)), /ownIds\.has\(id\)/.test(save), /from\('therapists'\)\s*\.update|from\('therapists'\)\.update/.test(save.slice(0, save.indexOf('\n}\n')))], [true, true, false]);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
