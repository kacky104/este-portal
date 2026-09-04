// 営業日（src/lib/dutyStatus.ts）の自己点検（第150便・2026-09-05）。
//
// ★★★ なぜ要るか
//   「1日の始まりは午前6時」はフクエス全体の決めごと（DAY_START_HOUR）。
//   ★ ところが他媒体へ送る段だけが `new Date(Date.now()+9h)`（＝暦日）を**その場で書いて**いた。
//   ★★ 2026-09-05 実測: エステ魂の表の1日目は営業日。深夜0:01〜5:01 の周が6回とも止まっていた。
//   → ★ 決め方を1本にし、その1本を機械で縛る。
//
//   使い方:  npm run check:dutystatus

const d = require(require('path').join(__dirname, '..', '_tmpcheck', 'dutyStatus.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const at = (iso) => d.businessDateJSTFrom(Date.parse(iso));

console.log('── ★★★ 境目は午前6時 ──');
eq('★★★ 5:59:59 は前の営業日', at('2026-09-05T05:59:59+09:00'), '2026-09-04');
eq('★★★ 6:00:00 ちょうどで当日', at('2026-09-05T06:00:00+09:00'), '2026-09-05');
eq('★★ 0:00 ちょうども前の営業日', at('2026-09-05T00:00:00+09:00'), '2026-09-04');
eq('★ 昼', at('2026-09-05T12:00:00+09:00'), '2026-09-05');
eq('★ 23:59', at('2026-09-05T23:59:59+09:00'), '2026-09-05');
eq('★ しきい値は 6', d.DAY_START_HOUR, 6);

console.log('\n── ★★ 月・年・うるう年をまたぐ ──');
eq('★★★ 月またぎ', at('2026-10-01T02:00:00+09:00'), '2026-09-30');
eq('★★★ 年またぎ', at('2027-01-01T03:00:00+09:00'), '2026-12-31');
eq('★★ うるう日', at('2028-03-01T01:00:00+09:00'), '2028-02-29');
eq('★★ うるう日そのもの', at('2028-02-29T10:00:00+09:00'), '2028-02-29');
eq('★ 3月1日の朝は3月1日', at('2027-03-01T07:00:00+09:00'), '2027-03-01');

console.log('\n── ★ 日付の足し引き ──');
eq('★ 翌日', d.addBusinessDays('2026-09-30', 1), '2026-10-01');
eq('★ 前日', d.addBusinessDays('2026-10-01', -1), '2026-09-30');
eq('★ 0日はそのまま', d.addBusinessDays('2026-09-05', 0), '2026-09-05');
eq('★★ 13日後（窓の最後）', d.addBusinessDays('2026-12-25', 13), '2027-01-07');

console.log('\n── ★★★ 実行環境の時間帯に左右されない ──');
// ★ 中で new Date() を読んでいないこと（★ 受け取った時刻だけで決まる）を、
//   同じ時刻を2つの書き方で渡して確かめる
eq('★★★ +09:00 と Z で同じ答え',
   at('2026-09-05T00:20:00+09:00'), d.businessDateJSTFrom(Date.parse('2026-09-04T15:20:00Z')));

console.log('\n── ★★★ 実測（salon_media_audit の date_shifted・第112便の記録）──');
// ★ 相手の1日目 = businessDateJSTFrom(その時刻) になっていること
const 実測 = [
  ['2026-09-04T15:20:07Z', '2026-09-04'],
  ['2026-09-03T20:01:06Z', '2026-09-03'],
  ['2026-09-03T19:01:06Z', '2026-09-03'],
  ['2026-09-03T18:01:05Z', '2026-09-03'],
  ['2026-09-03T17:01:06Z', '2026-09-03'],
  ['2026-09-03T16:01:06Z', '2026-09-03'],
  ['2026-09-03T15:01:07Z', '2026-09-03'],
];
for (const [iso, want] of 実測) {
  eq('★★★ ' + iso + ' の相手の1日目', d.businessDateJSTFrom(Date.parse(iso)), want);
}
// ★★ 落ちていない周（6:01）は当日になること。★ ここが前日になると直しすぎ
eq('★★★ 6:01 の周は当日（落ちていない）', at('2026-09-04T06:01:00+09:00'), '2026-09-04');

console.log('\n── ★★★ 媒体へ送る段に、暦日を書き戻さない（第151便）──');
// ★★ 直したのが【その場所だけ】で、同じ失敗が起きない形にしていない、を繰り返さない。
//   ★ 第150便の反省と同じ（第53便 auditsummary・第64便 relayhosts と同じ形の番人）。
//   ★★ ここで見るのは【媒体へ送る段】だけ。統計や取り込みの他ファイルは対象外
//     （★ そちらが暦日でよいかは、まだ確かめていない。★ 混ぜない）。
const fs2 = require('fs');
const path2 = require('path');
const root2 = path2.join(__dirname, '..');
const 見張るファイル = [
  'src/app/lib/media/relayFlow.ts',
  'src/lib/esutamaFlow.ts',
];
// ★ 「JST に9時間足して日付にする」＝暦日の書き方。★ 営業日の正本を通していない証拠
const CALENDAR_DAY = /9\s*\*\s*60\s*\*\s*60\s*\*\s*1000|32400000/;
for (const rel of 見張るファイル) {
  const src = fs2.readFileSync(path2.join(root2, rel), 'utf8');
  const 当たり = src.split('\n')
    .map((line, i) => ({ no: i + 1, line }))
    .filter((x) => CALENDAR_DAY.test(x.line) && !/^\s*(\/\/|\*|\/\*)/.test(x.line));
  eq('★★★ ' + rel + ' に暦日の書き方が無い', 当たり.map((x) => x.no + ': ' + x.line.trim().slice(0, 60)), []);
}
// ★ 正本のファイルには当然ある（★ 見張りが「どこにも無い」を確かめているだけになっていないこと）
{
  const src = fs2.readFileSync(path2.join(root2, 'src/lib/dutyStatus.ts'), 'utf8');
  eq('★★ 正本には計算が残っている（見張りが空振りしていない）', CALENDAR_DAY.test(src), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
