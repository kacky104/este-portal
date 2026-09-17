// コネックエフの今すぐ一括（src/lib/conecfImasugu.ts）の自己点検（第401便）。
//   使い方:  npm run check:conecfimasugu
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfImasugu.js'));
let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const M = (h, m = 0) => h * 60 + m;

console.log('── 1. 出勤時間の中か ──');
eq('同日の中', v.isOnDutyNow('12:00', '19:00', M(15)), true);
eq('★ 終了ちょうどは外', v.isOnDutyNow('12:00', '19:00', M(19)), false);
eq('開始ちょうどは中', v.isOnDutyNow('12:00', '19:00', M(12)), true);
eq('★ 日またぎ 深夜1時は中', v.isOnDutyNow('20:00', '02:00', M(1)), true);
eq('★ 日またぎ 夕方は外', v.isOnDutyNow('20:00', '02:00', M(17)), false);
eq('時刻なしは外', v.isOnDutyNow(null, '02:00', M(1)), false);

const C = (id, name, start, priority, lastOnAt) => ({ id, name, start, priority, lastOnAt });
const base = { orderMode: 'priority', rule: 'list', batchSize: 1, max: 5, nowMin: M(22), seed: 's' };

console.log('── 2. 選ぶ ──');
const cs = [C(1, 'あ', '20:00', 2, null), C(2, 'い', '18:00', 1, null), C(3, 'う', '21:00', null, null)];
eq('並べた順で1人', v.pickImasugu({ ...base, candidates: cs }), [2]);
eq('★ 最後に出した時刻が古い人から（回す）', v.pickImasugu({ ...base, candidates: [C(2, 'い', '18:00', 1, '2026-09-17T12:00:00Z'), C(1, 'あ', '20:00', 2, null)] }), [1]);
eq('先に出勤した人優先', v.pickImasugu({ ...base, rule: 'earlier', batchSize: 2, candidates: cs }), [2, 1]);
eq('後から出勤した人優先', v.pickImasugu({ ...base, rule: 'later', batchSize: 2, candidates: cs }), [3, 1]);
eq('★ 全員同時は上限まで', v.pickImasugu({ ...base, batchSize: 0, max: 2, candidates: cs }).length, 2);
eq('★ 人数は上限を超えない', v.pickImasugu({ ...base, batchSize: 5, max: 2, candidates: cs }).length, 2);
eq('候補0人', v.pickImasugu({ ...base, candidates: [] }), []);
const r1 = v.pickImasugu({ ...base, orderMode: 'random', batchSize: 3, candidates: cs, seed: 'x' });
const r2 = v.pickImasugu({ ...base, orderMode: 'random', batchSize: 3, candidates: cs, seed: 'x' });
eq('★ ランダムは同じ種なら同じ並び', r1, r2);
eq('ランダムでも全員そろう', [...r1].sort(), [1, 2, 3]);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った');
