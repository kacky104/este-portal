// お知らせページの「本日の出勤速報」（src/lib/dailyShiftNews.ts）の自己点検（第1418便）。
//   使い方:  npm run check:dailyshiftnews
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'dailyShiftNews.js'));
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const P = (id, startKey, isPick) => ({ id, name: 'n' + id, startKey, isPick });
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

eq('人数: 0→0・1〜3→1・4以上→2', [0, 1, 3, 4, 9].map(m.dailyPickCount), [0, 1, 1, 2, 2]);
{
  const ppl = [P(1, 600, false), P(2, 300, true), P(3, 900, false), P(4, 100, true)];
  // 0.1 < 0.75 → イチオシから（出勤の早い順のイチオシ [4,2] の 0番）→ 4。次 0.9 → それ以外 [1,3] の 0番 → 1
  const r = m.pickDailyShift(ppl, 6, '2026-10-13', seq(0.1, 0.0, 0.9, 0.0));
  eq('★ 75% はイチオシから・25% はそれ以外から', r.featured.map((p) => p.id), [4, 1]);
  eq('それ以外は出勤の早い順（選んだ方を除く）', r.others.map((p) => p.id), [2, 3]);
}
{
  const ppl = [P(1, 600, false), P(2, 300, false)];
  eq('★ イチオシがいない日は、それ以外から', m.pickDailyShift(ppl, 6, 'x', seq(0.1, 0.0)).featured.map((p) => p.id), [2]);
  const ppl2 = [P(1, 600, true), P(2, 300, true)];
  eq('★ それ以外がいない日は、イチオシから', m.pickDailyShift(ppl2, 6, 'x', seq(0.9, 0.99)).featured.map((p) => p.id), [1]);
}
{
  const ppl = Array.from({ length: 6 }, (_, i) => P(i + 1, i * 60, i < 2));
  const a = m.pickDailyShift(ppl, 6, '2026-10-13').featured.map((p) => p.id);
  const b = m.pickDailyShift(ppl, 6, '2026-10-13').featured.map((p) => p.id);
  eq('★ 同じお店・同じ日は同じ方（作り直しても変わらない）', a, b);
  // 確率の見当: 1000日ぶん、1人目がイチオシになる割合が 0.7〜0.8
  let hit = 0;
  for (let d = 0; d < 1000; d++) { const f = m.pickDailyShift(ppl, 6, 'd' + d).featured; if (f[0].isPick) hit++; }
  eq('★ 1人目がイチオシの割合はおよそ75%（1000日）', hit > 700 && hit < 800, true);
}
eq('題名', [m.dailyShiftTitle('2026-10-13', ['なぎさ', 'るい']), m.dailyShiftTitle('2026-10-03', [])], ['10/13 出勤速報｜なぎささん・るいさん', '10/3 出勤速報']);
// ★ 第1421便: 題名をタグで変える（1人目のいちばん強いタグ）
eq('題名（タグ）: NO.1・殿堂入りが先・新人の印・タグなし・2人', [
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'るい', badges: ['お姉さん系', 'NO.1'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'りか', badges: ['NO.1', '殿堂入り'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'みつは', badges: ['キレイ'], isNewFace: true }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'あかね', badges: ['キレイ'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'なぎさ', badges: ['店長おすすめ'] }, { name: 'るい', badges: ['NO.1'] }]),
], ['10/13 ★NO.1★るいさん出勤♪', '10/13 👑殿堂入り👑りかさん出勤', '10/13 🌸新人🌸みつはさん出勤', '10/13 出勤速報｜あかねさん', '10/13 【店長イチオシ】なぎささん・るいさん出勤']);

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
