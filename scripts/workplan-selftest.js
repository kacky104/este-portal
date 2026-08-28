// 出勤計画（src/lib/workPlan.ts）の自己点検（第43便）。
//
// ★★★ なぜ要るか
//   このプロジェクトにはテスト実行環境が無い。いっぽう workPlan.ts は
//   「時刻の向き直し」「消える方向の見張り」という **間違えても静かに通る** 判断を持つ。
//   → ★ 枠組みを増やさずに、素の node で回る点検を1本だけ置く。
//
//   使い方:  npm run check:workplan
//   （tsc で _tmpcheck/ へ落としてから node で回す。_tmpcheck/ は .gitignore の /_tmp*/ に入る）
//
// ★ 期待値を直すときは【なぜその値が正しいのか】をコメントに残すこと。
//   数字だけ書き換えると、見張りを外したことに気づけない。

const wp = require(require('path').join(__dirname, '..', '_tmpcheck', 'workPlan.js'));
const parse = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaWorkParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// ── 時刻の向き直し ──
eq('20:00-03:00 → 27:00', wp.toEkichikaEnd('20:00','03:00'), {ok:true, value:'27:00'});
eq('10:00-18:00 はそのまま', wp.toEkichikaEnd('10:00','18:00'), {ok:true, value:'18:00'});
eq('同じ時刻は送らない', wp.toEkichikaEnd('20:00','20:00').ok, false);
eq('日付の足し算(月跨ぎ)', wp.addDaysISO('2026-08-30', 3), '2026-09-02');

// ── ページの雛形（2人×7日）──
const days = (work, s, e) => Array.from({length:7}, () => ({start:s, end:e, work}));
const mkPage = (girls, labels) => ({
  csrfToken: 't', action: 'https://x/admin/girlswork/1/',
  dateLabels: labels, headerCounts: [0,0,0,0,0,0,0],
  girls, timeOptions: ['00:00','10:00','18:00','20:00','20:15','27:00','03:00'],
});
const labels = ['08/28(金)','08/29(土)','08/30(日)','08/31(月)','09/01(火)','09/02(水)','09/03(木)'];
const page = mkPage([
  {girlId:'111', name:'あ', days: days(false,'00:00','00:00')},
  {girlId:'222', name:'い', days: days(false,'00:00','00:00')},
  {girlId:'999', name:'駅ちかだけ', days: days(true,'10:00','18:00')},
], labels);
const castIdOf = new Map([[1,'111'],[2,'222']]);
const today = '2026-08-28';

// 1) ふつうに1日ぶん入れる
let plan = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf});
eq('① 変更1件だけ', plan.changes.length, 1);
eq('① 27:00 に直っている', plan.changes[0].cell, {start:'20:00', end:'27:00', work:true});
eq('① 送れる', plan.ok, true);
eq('① 駅ちかだけの子は触らない', plan.sent.find(g=>g.girlId==='999').days[0], {start:'10:00',end:'18:00',work:true});

// 2) 深夜またぎ（日付ずれ）は止める
plan = wp.buildWorkPlan({page, todayISO:'2026-08-29', shifts: [
  {therapistId:1, dateISO:'2026-08-29', active:true, start:'20:00', end:'03:00'},
], castIdOf});
eq('② 日付ずれで止まる', plan.blockers.map(b=>b.kind).includes('date_shifted'), true);

// 3) フクエスが空なら止める
plan = wp.buildWorkPlan({page, todayISO: today, shifts: [], castIdOf});
eq('③ 0件で止まる', plan.blockers.map(b=>b.kind).includes('no_schedule'), true);

// 4) 急減で止める（駅ちか10人出勤 → フクエス1人だけ）
const many = Array.from({length:10}, (_,i)=>({girlId:'g'+i, name:'x', days: days(true,'10:00','18:00')}));
const page2 = mkPage(many, labels);
const cast2 = new Map(many.map((g,i)=>[i+1, g.girlId]));
plan = wp.buildWorkPlan({page: page2, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'10:00', end:'18:00'},
], castIdOf: cast2});
eq('④ 急減で止まる', plan.blockers.map(b=>b.kind).includes('shrink_too_much'), true);
eq('④ 前後の人数', [plan.countsBefore[0], plan.countsAfter[0]], [10,1]);

// 5) 選択肢に無い時刻は触らずに止める
plan = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:07', end:'03:00'},
  {therapistId:2, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf});
eq('⑤ 選択肢外で止まる', plan.blockers.map(b=>b.kind).includes('time_not_selectable'), true);
eq('⑤ 触っていない子の日0は現在値のまま', plan.sent.find(g=>g.girlId==='111').days[0].work, false);

// 6) castId が無い子は notes に出る（静かにこぼさない）
plan = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
  {therapistId:77, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf});
eq('⑥ 番号が無い子を報告', plan.notes.some(n=>n.kind==='unmapped_therapist' && n.count===1), true);

// 7) 同じ内容なら変更0件
const page3 = mkPage([{girlId:'111', name:'あ', days: days(true,'20:00','27:00')}], labels);
plan = wp.buildWorkPlan({page: page3, todayISO: today, shifts:
  Array.from({length:7},(_,d)=>({therapistId:1, dateISO: wp.addDaysISO(today,d), active:true, start:'20:00', end:'03:00'})),
  castIdOf: new Map([[1,'111']])});
eq('⑦ 一致していれば変更0件', plan.changes.length, 0);
eq('⑦ それでも送れる状態', plan.ok, true);

// 8) 選択肢の読み取り
const html = '<form id="frmfix" action="https://ranking-deli.jp/admin/girlswork/1/">' +
  '<select name="girl_work[111][0][start_time]"><option value="00:00">0</option><option value="20:00" selected>20</option></select>' +
  '</form>';
eq('⑧ timeOptions を拾う', parse.parseWorkPage(html).timeOptions, ['00:00','20:00']);

console.log(fail === 0 ? '\n★ 全部通った' : '\n★ 失敗 ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
