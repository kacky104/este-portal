// コネックエフ「最初に1回だけ取り込む」（src/lib/conecfFirstImport.ts）の自己点検（第406便）。
//   使い方:  npm run check:conecffirstimport
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfFirstImport.js'));
let fail = 0;
const eq = (name, got, want) => { const a=JSON.stringify(got),b=JSON.stringify(want); if(a!==b){console.log('NG '+name+'\n   got  '+a+'\n   want '+b);fail++;}else console.log('ok '+name); };
const T = '2026-09-17T10:00:00Z';

console.log('── 1. 段階 ──');
eq('押していない', v.firstImportPhase({requestedAt:null,startedAt:null,doneAt:null}), 'none');
eq('順番待ち', v.firstImportPhase({requestedAt:T,startedAt:null,doneAt:null}), 'waiting');
eq('取り込み中', v.firstImportPhase({requestedAt:T,startedAt:T,doneAt:null}), 'running');
eq('完了', v.firstImportPhase({requestedAt:T,startedAt:T,doneAt:T}), 'done');
eq('★ requested が無ければ done があっても none', v.firstImportPhase({requestedAt:null,startedAt:T,doneAt:T}), 'none');

console.log('── 2. targets の動き ──');
eq('待ち→渡す', v.targetsStep('waiting'), 'hand');
eq('★ 中→終わりにする（次の周）', v.targetsStep('running'), 'finish');
eq('完了→何もしない', v.targetsStep('done'), 'skip');
eq('none→何もしない', v.targetsStep('none'), 'skip');

console.log('── 3. ingest の受け入れ ──');
const s = {enabledAt:T,requestedAt:T,startedAt:T,doneAt:null,provider:'ekichika'};
eq('渡し済み・未完了は受ける', v.acceptsFirstImport(s), true);
eq('★ 切り替え前は受けない', v.acceptsFirstImport({...s,enabledAt:null}), false);
eq('★ 渡す前は受けない', v.acceptsFirstImport({...s,startedAt:null}), false);
eq('★ 完了後は受けない', v.acceptsFirstImport({...s,doneAt:T}), false);
eq('★ 駅ちか以外は受けない', v.acceptsFirstImport({...s,provider:'esutama'}), false);

console.log('── 4. 出勤 ──');
const inc = [
  {date:'2026-09-17',status:'work',start:'12:00',end:'20:00'},
  {date:'2026-09-18',status:'work',start:'13:00',end:'21:00'},
  {date:'2026-09-19',status:'off',start:null,end:null},
];
const r1 = v.pickFirstImportSchedule({incoming:inc, existing:[{date:'2026-09-18',importedAt:null},{date:'2026-09-17',importedAt:T}], therapistActive:true});
eq('★ 人が入れた日(18)は残す', r1.rows.map(x=>x.date), ['2026-09-17','2026-09-19']);
eq('残した数', r1.kept, 1);
eq('前に取り込んだ日(17)は上書き', r1.rows[0], {date:'2026-09-17',isActive:true,start:'12:00',end:'20:00'});
eq('休みは休み', r1.rows[1], {date:'2026-09-19',isActive:false,start:null,end:null});
const r2 = v.pickFirstImportSchedule({incoming:inc, existing:[], therapistActive:false});
eq('★ 非公開の子は出勤を入れない（全部休み）', r2.rows.every(x=>!x.isActive && x.start===null), true);

console.log('── 5. 年齢・サイズ ──');
eq('空なら埋める', v.fillEmptyProfile({age:null,bodyType:null},{age:'22',bodyType:'T160 B85(D)'}), {age:'22',body_type:'T160 B85(D)'});
eq('★ 入っていれば触らない', v.fillEmptyProfile({age:'25',bodyType:'x'},{age:'22',bodyType:'y'}), {});
eq('取れなかった値は入れない', v.fillEmptyProfile({age:null,bodyType:null},{age:null,bodyType:null}), {});

if (fail) { console.log('\n★ '+fail+' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
