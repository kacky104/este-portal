// コネックエフ「送り先サイト」（src/lib/conecfTargets.ts）の自己点検（第408便）。
//   使い方:  npm run check:conecftargets
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfTargets.js'));
let fail = 0;
const eq = (name, got, want) => { const a=JSON.stringify(got),b=JSON.stringify(want); if(a!==b){console.log('NG '+name+'\n   got  '+a+'\n   want '+b);fail++;}else console.log('ok '+name); };
const rows = [
  { therapist_id: 1, provider: 'ekichika', slot: 1, enabled: false },
  { therapist_id: 2, provider: 'ekichika', slot: 1, enabled: true },
  { therapist_id: 3, provider: 'ekichika', slot: 2, enabled: false },
  { therapist_id: '4', provider: 'esutama', slot: '1', enabled: false },
  { therapist_id: 5, provider: 'ekichika', slot: 1, enabled: null },
];
eq('★ 駅ちか枠1で送らないのは1だけ', [...v.offSetFrom(rows,'ekichika',1)], [1]);
eq('★ 枠が違えば別', [...v.offSetFrom(rows,'ekichika',2)], [3]);
eq('文字の id・枠も読む', [...v.offSetFrom(rows,'esutama',1)], [4]);
eq('★ enabled null は送る（既定 ON）', v.offSetFrom(rows,'ekichika',1).has(5), false);
eq('行が無ければ空', [...v.offSetFrom([],'ekichika',1)], []);
eq('★ フクエスは保存しない（外せない）', v.isSavableTarget('fukues'), false);
eq('駅ちかは保存する', v.isSavableTarget('ekichika'), true);
eq('文にサイト名', v.targetOffMessage('駅ちか').includes('「駅ちか」'), true);
if (fail) { console.log('\n★ '+fail+' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
