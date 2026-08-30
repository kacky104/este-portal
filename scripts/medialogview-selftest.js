// 連携の記録の見せ方（src/lib/mediaLogView.ts）の自己点検（第64便・㉞ その6）。
//
// ★★★ ここで危ないのは【空っぽの見せ方】と【できたことにすること】。
//   ・読めていないのに「記録がありません」と書く
//   ・絞り込みのせいで出ていないだけなのに「ありません」と書く
//   ・知らない outcome を成功側に倒す
//
//   使い方:  npm run check:medialogview

const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaLogView.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const row = (o) => Object.assign(
  { id: 1, provider: 'ekichika', slot: 1, outcome: 'ok', summary: 'x', createdAt: '2026-08-30T10:00:00.000Z' },
  o || {}
);

console.log('── 1. ★ どうなったか。知らない値を成功側に倒さない ──');
eq('ok', v.outcomeTone('ok'), 'ok');
eq('failed', v.outcomeTone('failed'), 'bad');
eq('stopped', v.outcomeTone('stopped'), 'warn');
eq('★ 知らない値は unknown', v.outcomeTone('なにか'), 'unknown');
eq('★ 空文字も unknown', v.outcomeTone(''), 'unknown');
eq('★ 大文字の OK は成功にしない', v.outcomeTone('OK'), 'unknown');
eq('ok の言い方', v.outcomeLabel('ok'), 'できました');
eq('failed の言い方', v.outcomeLabel('failed'), 'できませんでした');
eq('stopped の言い方', v.outcomeLabel('stopped'), '途中で止めました');
eq('★ 知らない値は断定しない側へ', v.outcomeLabel('なにか'), 'まだ分かりません');
// ★★ 「できました」と書いてよいのは ok だけ
eq('★★ ok 以外に「できました」と書かない',
   ['failed', 'stopped', 'なにか', ''].some((o) => v.outcomeLabel(o) === 'できました'), false);

console.log('\n── 1-2. ★★ 止めたものは「うまくいかなかった」に入れる ──');
eq('failed は失敗', v.isFailure('failed'), true);
eq('★★ stopped も失敗に数える（絞り込みから消さない）', v.isFailure('stopped'), true);
eq('ok は失敗ではない', v.isFailure('ok'), false);
eq('★ 知らない値は失敗に数えない（数を水増ししない）', v.isFailure('なにか'), false);

console.log('\n── 2. ★★★ 並べ替えない（起きた順を壊さない）──');
const mixed = [
  row({ id: 1, outcome: 'ok',     createdAt: '2026-08-30T10:00:00.000Z' }),
  row({ id: 2, outcome: 'failed', createdAt: '2026-08-30T09:00:00.000Z' }),
  row({ id: 3, outcome: 'ok',     createdAt: '2026-08-30T11:00:00.000Z' }),
];
eq('新しい順', v.sortLogRows(mixed).map((r) => r.id), [3, 1, 2]);
// ★★★ 対になる主張。失敗が古くても、上には来ない
eq('★★ 失敗でも古ければ下のまま', v.sortLogRows(mixed)[2].outcome, 'failed');
eq('★ 同じ時刻なら id の大きい順',
   v.sortLogRows([row({ id: 5 }), row({ id: 9 })]).map((r) => r.id), [9, 5]);
eq('★ 時刻が壊れている行があっても落ちない',
   v.sortLogRows([row({ id: 1, createdAt: 'こわれた' }), row({ id: 2 })]).map((r) => r.id), [2, 1]);
eq('★ 元の配列を書き換えない', mixed.map((r) => r.id), [1, 2, 3]);

console.log('\n── 3. 絞り込み ──');
const rows = [
  row({ id: 1, provider: 'ekichika', outcome: 'ok' }),
  row({ id: 2, provider: 'ekichika', outcome: 'failed' }),
  row({ id: 3, provider: 'esulove',  outcome: 'ok' }),
  row({ id: 4, provider: 'ekichika', outcome: 'stopped' }),
];
const f = (o) => v.filterLogRows(rows, Object.assign({ provider: '', outcome: '' }, o || {}));
eq('空の絞り込みは全部', f().map((r) => r.id), [1, 2, 3, 4]);
eq('サイトで絞る', f({ provider: 'esulove' }).map((r) => r.id), [3]);
eq('成功だけ', f({ outcome: 'ok' }).map((r) => r.id), [1, 3]);
// ★★★ 対になる主張。同じ stopped の行が、絞り込みによって残る／消える
eq("★★ 「うまくいかなかった」は failed と stopped の両方",
   f({ outcome: 'failed' }).map((r) => r.id), [2, 4]);
eq('★★ 「できたもの」に stopped は入らない',
   f({ outcome: 'ok' }).some((r) => r.outcome === 'stopped'), false);
eq('サイト＋結果', f({ provider: 'ekichika', outcome: 'failed' }).map((r) => r.id), [2, 4]);
eq('★ 記録の無いサイトを選ぶと空', f({ provider: 'esutama' }).map((r) => r.id), []);
eq('絞り込みが立っているか（空）', v.hasLogFilter({ provider: '', outcome: '' }), false);
eq('絞り込みが立っているか（サイト）', v.hasLogFilter({ provider: 'ekichika', outcome: '' }), true);

console.log('\n── 4. ★★★ 数えられないものを 0 と書かない ──');
eq('読めていれば数える',
   v.logTally({ known: true, rows }), { total: 4, failed: 2 });
// ★★★ 対になる主張。同じ「失敗が無い」でも、読めたかどうかで 0 と null に割れる
eq('★★ 読めていて失敗が無ければ 0',
   v.logTally({ known: true, rows: [row()] }), { total: 1, failed: 0 });
eq('★★ 読めていなければ null（★ 0 と書かない）',
   v.logTally({ known: false, rows }), null);
eq("★ known が 'true' という文字列なら null", v.logTally({ known: 'true', rows: [] }), null);

console.log('\n── 5. ★★★ 空の理由を1つに決める ──');
const er = (o) => v.logEmptyReason(Object.assign(
  { known: true, filter: { provider: '', outcome: '' }, totalBeforeFilter: 0 }, o || {}));
// ★★★ 対になる主張。同じ「0件」が、読めたかどうかで割れる
eq('★★ 読めていて0件 → 記録が無い', er({ known: true, totalBeforeFilter: 0 }), 'none');
eq('★★ 読めていなければ 読み込み中（★「ありません」と言わない）',
   er({ known: false, totalBeforeFilter: 0 }), 'loading');
// ★★★ もう一組。記録があるのに出ていない ＝ 絞り込みのせい
eq('★★ 記録があってサイトを選んでいる → そのサイトの記録が無い',
   er({ totalBeforeFilter: 9, filter: { provider: 'esutama', outcome: '' } }), 'site_empty');
eq('★★ 記録があって結果だけ絞っている → 絞り込みのせい',
   er({ totalBeforeFilter: 9, filter: { provider: '', outcome: 'failed' } }), 'filtered');
eq('★ 記録があって絞り込みが無いのに空 → 記録が無い扱い',
   er({ totalBeforeFilter: 0, filter: { provider: '', outcome: '' } }), 'none');
eq('★ 読めていなければ、絞り込みがあっても読み込み中が先',
   er({ known: false, totalBeforeFilter: 9, filter: { provider: 'ekichika', outcome: '' } }), 'loading');

console.log('\n── 5-2. 空のときの文 ──');
eq('none の文', v.logEmptyMessage('none', 'エステ魂'), 'まだ記録はありません。');
eq('★★ site_empty はサイト名を出す',
   v.logEmptyMessage('site_empty', 'エステ魂'), 'エステ魂の記録は、まだありません。');
eq('★★ filtered は外し方を書く',
   v.logEmptyMessage('filtered', '').includes('絞り込みを外すと'), true);
eq('loading の文', v.logEmptyMessage('loading', ''), '記録を読み込んでいます。');
eq('★ 知らない値は none の文', v.logEmptyMessage('なにか', ''), 'まだ記録はありません。');
// ★★ 読み込み中に「ありません」と書かない
eq('★★ loading の文に「ありません」を入れない',
   v.logEmptyMessage('loading', '').includes('ありません'), false);

console.log('\n── 6. もっと見る ──');
eq('50 の次は 200', v.nextLogLimit(50), 200);
eq('200 の次は 500', v.nextLogLimit(200), 500);
eq('★ 500 の次は無い（null）', v.nextLogLimit(500), null);
eq('★ 上限を超えていても null', v.nextLogLimit(9999), null);
eq('★ 壊れた値なら最初の段の次', v.nextLogLimit(NaN), 200);

console.log('\n── 7. ★★ サイトの表とラベルが一致しているか ──');
const sites = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaSites.js'));
const audit = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaAudit.js'));
// ★★ 表に足してラベルを足し忘れると、記録に 'esutama' と英字が出る
eq('★★ 4サイトすべてに記録用のラベルがある',
   sites.MEDIA_SITES.filter((s) => !audit.PROVIDER_LABELS[s.provider]).map((s) => s.provider), []);
eq('★★ ラベルの文字列が表の名前と一致している',
   sites.MEDIA_SITES.filter((s) => audit.PROVIDER_LABELS[s.provider] !== s.name).map((s) => s.provider), []);
eq('★ 知らない provider は英字のまま出る（ごまかさない）',
   audit.providerLabel('unknown-site'), 'unknown-site');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
