// コネックエフの DB ロックの文言（src/lib/conecfLock.ts）の自己点検（第407便）。
//   使い方:  npm run check:conecflock
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfLock.js'));
let fail = 0;
const eq = (name, got, want) => { const a=JSON.stringify(got),b=JSON.stringify(want); if(a!==b){console.log('NG '+name+'\n   got  '+a+'\n   want '+b);fail++;}else console.log('ok '+name); };
const tail = '（画面が古い場合は再読み込みしてください）';
eq('ロックの文を取り出す', v.conecfLockMessage({ message: 'CONECF_LOCKED: 出勤はコネックエフの週間スケジュールで編集してください' }), '出勤はコネックエフの週間スケジュールで編集してください' + tail);
eq('文字列でも', v.conecfLockMessage('CONECF_LOCKED: x'), 'x' + tail);
eq('★ 文が無ければ既定', v.conecfLockMessage('CONECF_LOCKED'), 'この店舗はコネックエフで編集します' + tail);
eq('★ ほかのエラーは null', v.conecfLockMessage({ message: 'duplicate key value' }), null);
eq('null は null', v.conecfLockMessage(null), null);
if (fail) { console.log('\n★ '+fail+' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
