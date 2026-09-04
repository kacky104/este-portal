// 送った印の状態から再挑戦を決める（src/lib/esutamaDiaryRetry.ts）の自己点検（第137便・2026-09-05）。
//
// ★★★ ここで守りたいのは3つ。
//   ① 送れたものは二度と送らない
//   ② ★★ 分からないもの・途中で落ちたものは【二度と送らない】（消せない相手なので）
//   ③ 失敗はやり直すが、★ すぐには試さない・★ 何度も試さない
//
//   使い方:  npm run check:esutamadiaryretry

const path = require('path');
const R = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaDiaryRetry.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const NOW = new Date('2026-09-05T12:00:00Z');
const minAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();
const d = (o) => R.decideDiaryRetry({ state: 'failed', attempts: 1, updatedAt: minAgo(60), ...o }, NOW);

console.log('── 1. ★★★ 送ったものは二度と送らない ──');
eq('★★★ sent は送らない', d({ state: 'sent' }).send, false);
eq('★ 理由も分かる', d({ state: 'sent' }).reason, 'sent');

console.log('\n── 2. ★★★ 分からないものは二度と送らない（消せない相手）──');
// ★★★ エステ魂は店舗側から消せない。★ 受け取られたかもしれないものを送り直さない
eq('★★★ unknown は送らない', d({ state: 'unknown' }).send, false);
eq('★★ 媒体側で確認、と書く', d({ state: 'unknown' }).message.includes('媒体側でご確認'), true);
// ★★★ 送信の直前に立てた印が残っている＝送られている可能性がある
eq('★★★ pending も送らない', d({ state: 'pending' }).send, false);
eq('★★ 途中で終わったと書く', d({ state: 'pending' }).message.includes('途中で終わって'), true);

console.log('\n── 3. ★★ 失敗はやり直す。★ ただし条件つき ──');
eq('★ 30分以上たった失敗は試す', d({ attempts: 1, updatedAt: minAgo(60) }).send, true);
eq('★ 回数が増える', d({ attempts: 1, updatedAt: minAgo(60) }).attempts, 2);
// ★★ すぐには試さない。★ 相手を叩き続けない
eq('★★★ 直後は試さない', d({ attempts: 1, updatedAt: minAgo(5) }).send, false);
eq('★ その理由は cooling', d({ attempts: 1, updatedAt: minAgo(5) }).reason, 'cooling');
eq('★ ちょうど30分では試す', d({ attempts: 1, updatedAt: minAgo(30) }).send, true);
// ★★ 何度も試さない。★ 3回で駄目なものはやり方が間違っている
eq('★★★ 3回目に達したら試さない', d({ attempts: 3, updatedAt: minAgo(600) }).send, false);
eq('★ その理由は gave_up', d({ attempts: 3, updatedAt: minAgo(600) }).reason, 'gave_up');
eq('★ 2回目までは試す', d({ attempts: 2, updatedAt: minAgo(600) }).send, true);
// ★ 未来の時刻（時計のずれ）は「経っていない」扱い
eq('★★ 未来の時刻でも暴走しない',
   R.decideDiaryRetry({ state: 'failed', attempts: 1, updatedAt: '2099-01-01T00:00:00Z' }, NOW).send, false);
// ★ 時刻が読めないなら待たずに試す（★ 永久に送られないほうが困る）
eq('★ 時刻が無ければ試す', d({ updatedAt: null }).send, true);
eq('★ 壊れた時刻でも試す', d({ updatedAt: 'こわれている' }).send, true);

console.log('\n── 4. ★ 知らない値は送らない側へ倒す ──');
// ★★★ 状態が読めないものを「まだ送っていない」と決めつけない
eq('★★★ 知らない状態は unknown 扱い', R.toDiaryMarkState('へんな値'), 'unknown');
eq('★ null も unknown', R.toDiaryMarkState(null), 'unknown');
eq('★★★ だから送らない', d({ state: 'へんな値' }).send, false);
// ★ 回数が壊れていても落ちない
eq('★ 回数が読めなければ1回として扱う', d({ attempts: 'abc', updatedAt: minAgo(60) }).attempts, 2);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
