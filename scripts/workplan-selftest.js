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

// ── ★★★ 30分刻みへ内側に寄せる（第73便・カッキーさんの決定 2026-08-31）──
//   ★ 2026-08-28 は「丸めない。送らない」だったが、エステラブ（同じ30分刻み）を足すとき
//     媒体ごとに違うと「駅ちかには出ないのにエステラブには出る」になる。★ 揃えた。
eq('寄せる必要が無ければそのまま', wp.toEkichikaRange('20:00','03:00'),
  {ok:true, start:'20:00', end:'27:00', snappedNote:null});
// ★ 開始は遅いほう・終了は早いほうへ（実際より長く出さない）
eq('20:15〜02:45 → 20:30〜26:30', [wp.toEkichikaRange('20:15','02:45').start, wp.toEkichikaRange('20:15','02:45').end],
  ['20:30','26:30']);
eq('★ 寄せたことを言葉で残す', wp.toEkichikaRange('20:15','02:45').snappedNote, '20:15〜26:45 → 20:30〜26:30');
// ★ 寄せると勤務が無くなるものは送らない（店舗が入れていない時間を足さない）
eq('20:15〜20:30 は送らない', wp.toEkichikaRange('20:15','20:30').ok, false);
eq('同じ時刻はこちらでも送らない', wp.toEkichikaRange('20:00','20:00').ok, false);
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
// ★ 決定（2026-08-28）: 選択肢に無い時刻は【その枠だけ送らない】。全体は止めない。
//   1人が 20:15 を入れただけで店舗ぜんぶの反映が止まると、道具として使えないため。
eq('⑤ 全体は止めない', plan.ok, true);
eq('⑤ 止める理由には入れない', plan.blockers.map(b=>b.kind).includes('time_not_selectable'), false);
eq('⑤ ★ 理由つきで報告する', plan.notes.map(n=>n.kind).includes('time_not_selectable'), true);
eq('⑤ 選択肢外の子は現在値のまま', plan.sent.find(g=>g.girlId==='111').days[0].work, false);
eq('⑤ ★ もう一人はちゃんと反映される', plan.sent.find(g=>g.girlId==='222').days[0], {start:'20:00', end:'27:00', work:true});

// 5b) ★★ 寄せた先がプルダウンにあれば、寄せて反映する（第73便）
{
  const page5b = {
    csrfToken:'t', action:'https://x/admin/girlswork/1/', dateLabels: labels,
    headerCounts:[0,0,0,0,0,0,0],
    girls: [
      {girlId:'111', name:'あ', days: days(false,'00:00','00:00')},
      {girlId:'222', name:'い', days: days(false,'00:00','00:00')},
    ],
    // ★ 20:30 と 26:30 を選べるページ
    timeOptions: ['00:00','10:00','18:00','20:00','20:30','26:30','27:00','03:00'],
  };
  const p5b = wp.buildWorkPlan({page: page5b, todayISO: today, shifts: [
    {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:15', end:'02:45'},
  ], castIdOf});
  eq('⑤b 寄せて反映される', p5b.sent.find(g=>g.girlId==='111').days[0], {start:'20:30', end:'26:30', work:true});
  // ★★ 店舗が入れた時刻を書き換えている。黙ってやらない
  eq('⑤b ★ 寄せたことを notes に出す', p5b.notes.map(n=>n.kind).includes('time_snapped'), true);
  eq('⑤b 件数も出す', p5b.notes.find(n=>n.kind==='time_snapped').count, 1);
  // ★ 寄せていない枠では出さない（毎回出ると意味が薄れる）
  const p5c = wp.buildWorkPlan({page: page5b, todayISO: today, shifts: [
    {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
  ], castIdOf});
  eq('⑤c 寄せていなければ出さない', p5c.notes.map(n=>n.kind).includes('time_snapped'), false);
}

// 6) castId が無い子は notes に出る（静かにこぼさない）
plan = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
  {therapistId:77, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf});
eq('⑥ 番号が無い子を報告', plan.notes.some(n=>n.kind==='unmapped_therapist' && n.count===1), true);

// 6b) ★ 突き合わせる相手が0人のときは「一致」と言わせない（第43便・実データで踏んだ穴）
//     castIdOf が空＝比べる相手が居ない。changes は 0 になるが、それは「一致」ではない。
plan = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf: new Map()});
eq('⑥b 対象0人', plan.targets, 0);
eq('⑥b 変更も0件', plan.changes.length, 0);
eq('⑥b ★ 「一致」と言わない', wp.summarizePlan(plan).summary.includes('一致'), false);

// 7) 同じ内容なら変更0件
const page3 = mkPage([{girlId:'111', name:'あ', days: days(true,'20:00','27:00')}], labels);
plan = wp.buildWorkPlan({page: page3, todayISO: today, shifts:
  Array.from({length:7},(_,d)=>({therapistId:1, dateISO: wp.addDaysISO(today,d), active:true, start:'20:00', end:'03:00'})),
  castIdOf: new Map([[1,'111']])});
eq('⑦ 一致していれば変更0件', plan.changes.length, 0);
eq('⑦ それでも送れる状態', plan.ok, true);
eq('⑦ 突き合わせた人数が記録される', plan.targets, 1);
eq('⑦ 一致の文には人数が入る', wp.summarizePlan(plan).summary.includes('1名を突き合わせ'), true);

// 8) 選択肢の読み取り
const html = '<form id="frmfix" action="https://ranking-deli.jp/admin/girlswork/1/">' +
  '<select name="girl_work[111][0][start_time]"><option value="00:00">0</option><option value="20:00" selected>20</option></select>' +
  '</form>';
eq('⑧ timeOptions を拾う', parse.parseWorkPage(html).timeOptions, ['00:00','20:00']);

// ⑨ 送る内容の詰め方（第46便）。★ 段をまたいで持ち回すので、戻せることが命。
const packed = parse.encodeGirlWork(page.girls);
const back = parse.decodeGirlWork(packed);
eq('⑨ 人数が戻る', back.length, page.girls.length);
eq('⑨ girlId が戻る', back.map(g=>g.girlId), page.girls.map(g=>g.girlId));
eq('⑨ セルが戻る', back[2].days[0], page.girls[2].days[0]);
eq('⑨ 名前は入れていない', back[0].name, '');
eq('⑨ 壊れた文字列は例外にする', (()=>{ try { parse.decodeGirlWork('111|10:00,18:00,1'); return 'throwなし'; } catch { return 'throw'; } })(), 'throw');

// ⑩ 承認の指紋（第46便）。★ 同じ変更なら同じ指紋・違えば違う指紋。
const planA = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf});
const planA2 = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf});
const planB = wp.buildWorkPlan({page, todayISO: today, shifts: [
  {therapistId:1, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
  {therapistId:2, dateISO:'2026-08-28', active:true, start:'20:00', end:'03:00'},
], castIdOf});
eq('⑩ 同じ計画は同じ指紋', wp.planFingerprint(planA), wp.planFingerprint(planA2));
eq('⑩ ★ 違う計画は違う指紋', wp.planFingerprint(planA) !== wp.planFingerprint(planB), true);
eq('⑩ 変更0件なら空の指紋', wp.planFingerprint(wp.buildWorkPlan({page: page3, todayISO: today, shifts:
  Array.from({length:7},(_,d)=>({therapistId:1, dateISO: wp.addDaysISO(today,d), active:true, start:'20:00', end:'03:00'})),
  castIdOf: new Map([[1,'111']])})), '');

// ⑪ ★★★ 無人（自動反映）のときは見張りが厳しくなる（第48便・設計メモ §56）。
//    ★ 「同じ入力で、手動は通る／自動は止まる」を1組で見る。
//      片方だけ書くと、厳しくしたつもりで何も変わっていないことに気づけない。
{
  // 駅ちか10人が7日とも出勤。フクエス側は8人ぶんだけ入っている（＝毎日2名減る）
  const shifts8 = [];
  for (let t = 1; t <= 8; t++)
    for (let d = 0; d < 7; d++)
      shifts8.push({therapistId:t, dateISO: wp.addDaysISO(today,d), active:true, start:'10:00', end:'18:00'});

  const manual = wp.buildWorkPlan({page: page2, todayISO: today, shifts: shifts8, castIdOf: cast2});
  const auto   = wp.buildWorkPlan({page: page2, todayISO: today, shifts: shifts8, castIdOf: cast2, unattended: true});

  // 10名 → 8名。減り2名は 手動のしきい値（3名以上かつ3割超）に届かない
  eq('⑪ 10→8 は手動なら通る', manual.blockers.map(b=>b.kind).includes('shrink_too_much'), false);
  // ★ 自動は 2名以上かつ1.5割超。2 > 10*0.15 = 1.5 なので止まる
  eq('⑪ ★ 同じ内容でも自動なら止まる', auto.blockers.map(b=>b.kind).includes('shrink_too_much'), true);
  eq('⑪ 前後の人数は同じ', [auto.countsBefore[0], auto.countsAfter[0]], [10,8]);
}

// ⑫ ★ 無人でも「減っていない」なら止めない。★ 厳しくするのは減る方向だけ
{
  const shifts10 = [];
  for (let t = 1; t <= 10; t++)
    for (let d = 0; d < 7; d++)
      shifts10.push({therapistId:t, dateISO: wp.addDaysISO(today,d), active:true, start:'10:00', end:'18:00'});
  const auto = wp.buildWorkPlan({page: page2, todayISO: today, shifts: shifts10, castIdOf: cast2, unattended: true});
  eq('⑫ 変更0なら自動でも止まらない', auto.blockers.length, 0);
  eq('⑫ 変更0件', auto.changes.length, 0);
}

// ⑬ ★★ 作り直し級の差分は、自動では送らない（change_too_large）
//    ★ 人数は変わらないので急減では拾えない。**別の見張りが要る**ことの確認
{
  const shiftsAll = [];
  for (let t = 1; t <= 10; t++)
    for (let d = 0; d < 7; d++)
      shiftsAll.push({therapistId:t, dateISO: wp.addDaysISO(today,d), active:true, start:'18:00', end:'27:00'});
  const manual = wp.buildWorkPlan({page: page2, todayISO: today, shifts: shiftsAll, castIdOf: cast2});
  const auto   = wp.buildWorkPlan({page: page2, todayISO: today, shifts: shiftsAll, castIdOf: cast2, unattended: true});
  eq('⑬ 70枠すべて時刻が変わる', auto.changes.length, 70);
  eq('⑬ 人数は減っていない', [auto.countsBefore[0], auto.countsAfter[0]], [10,10]);
  eq('⑬ 手動なら通る', manual.blockers.length, 0);
  eq('⑬ ★ 自動は差分が大きすぎて止まる', auto.blockers.map(b=>b.kind).includes('change_too_large'), true);
}

console.log(fail === 0 ? '\n★ 全部通った' : '\n★ 失敗 ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
