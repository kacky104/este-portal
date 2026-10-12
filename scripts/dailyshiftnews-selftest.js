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
const P = (id, startKey) => ({ id, name: 'n' + id, startKey });
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

eq('人数: 0→0・1〜3→1・4以上→2', [0, 1, 3, 4, 9].map(m.dailyPickCount), [0, 1, 1, 2, 2]);
// ★ 第1424便: 出勤の方みんなから完全にランダム
{
  const ppl = [P(1, 600), P(2, 300), P(3, 900), P(4, 100)];
  // 出勤の早い順 [4,2,1,3]。0.6 → 4人の 2番 = 1。残り [4,2,3] で 0.0 → 4
  const r = m.pickDailyShift(ppl, 6, '2026-10-13', seq(0.6, 0.0));
  eq('乱数どおりに選ぶ', r.featured.map((p) => p.id), [1, 4]);
  eq('それ以外は出勤の早い順（選んだ方を除く）', r.others.map((p) => p.id), [2, 3]);
}
{
  const ppl = Array.from({ length: 6 }, (_, i) => P(i + 1, i * 60));
  const a = m.pickDailyShift(ppl, 6, '2026-10-13').featured.map((p) => p.id);
  const b = m.pickDailyShift(ppl, 6, '2026-10-13').featured.map((p) => p.id);
  eq('★ 同じお店・同じ日は同じ方（作り直しても変わらない）', a, b);
  // ★ 偏りの見当: 3000日ぶん、1人目に選ばれる回数が6人とも 350〜650 回（平均500）
  const cnt = {};
  for (let d = 0; d < 3000; d++) { const f = m.pickDailyShift(ppl, 6, 'd' + d).featured; cnt[f[0].id] = (cnt[f[0].id] || 0) + 1; }
  eq('★ 6人とも同じくらい選ばれる（3000日）', Object.values(cnt).length === 6 && Object.values(cnt).every((c) => c > 350 && c < 650), true);
}
eq('題名', [m.dailyShiftTitle('2026-10-13', ['なぎさ', 'るい']), m.dailyShiftTitle('2026-10-03', [])], ['10/13 出勤速報｜なぎささん・るいさん', '10/3 出勤速報']);
// ★ 第1421便: 題名をタグで変える（1人目のいちばん強いタグ）
eq('題名（タグ）: NO.1・殿堂入りが先・新人の印・タグなし・2人', [
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'るい', badges: ['お姉さん系', 'NO.1'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'りか', badges: ['NO.1', '殿堂入り'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'みつは', badges: ['キレイ'], isNewFace: true }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'あかね', badges: ['キレイ'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'なぎさ', badges: ['店長おすすめ'] }, { name: 'るい', badges: ['NO.1'] }]),
], ['10/13 ★NO.1★るいさん出勤♪', '10/13 👑殿堂入り👑りかさん出勤', '10/13 🌸新人🌸みつはさん出勤', '10/13 ✨美人✨あかねさん出勤', '10/13 【店長イチオシ】なぎささん・るいさん出勤']);
// ★ 第1423便: 外見・タイプは付けた順の最初・ランクが先・どれも無ければ出勤速報
eq('題名（外見・タイプ）', [
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'えま', badges: ['経験者', '癒し系', 'ギャル'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'えま', badges: ['ギャル', 'NO.1'] }]),
  m.dailyShiftTitleByTags('2026-10-13', [{ name: 'えま', badges: ['経験者', 'アロマ得意'] }]),
], ['10/13 🌿癒し系🌿えまさん出勤', '10/13 ★NO.1★えまさん出勤♪', '10/13 出勤速報｜えまさん']);
// 外見・タイプの全語に言い回しがある（タグ表と食い違わない）
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'therapistBadges.ts'), 'utf8');
  const pick = (k) => (new RegExp(k + ":\\s*\\[([^\\]]*)\\]").exec(src) || [, ''])[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  const words = [...pick('look'), ...pick('mood')];
  eq('★ 外見・タイプの全語に言い回しがある', words.filter((w) => !m.DAILY_TITLE_BY_LOOK[w]), []);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
