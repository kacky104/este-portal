// コネックエフの週間スケジュール（src/lib/conecfSchedule.ts）の自己点検（第399便）。
//   使い方:  npm run check:conecfschedule
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfSchedule.js'));
let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const days = ['2026-09-17', '2026-09-18'];

console.log('── 1. 選択肢 ──');
const st = v.startTimeOptions();
eq('開始は06:00から', st[0], { value: '06:00', label: '06:00' });
eq('開始の最後は翌05:30', st[st.length - 1], { value: '05:30', label: '翌05:30' });
eq('開始は48個', st.length, 48);
const en = v.endTimeOptions('20:00');
eq('終了は開始の30分後から', en[0], { value: '20:30', label: '20:30' });
eq('★ 日をまたぐと翌', en.find((o) => o.value === '02:00').label, '翌02:00');
eq('深夜開始（翌01:00）の終了は翌の続き', v.endTimeOptions('01:00')[0], { value: '01:30', label: '翌01:30' });

console.log('── 2. 表示 ──');
eq('日またぎ', v.shiftLabel({ isActive: true, start: '20:00', end: '02:00' }), '20:00〜翌02:00');
eq('同日', v.shiftLabel({ isActive: true, start: '12:00', end: '19:00' }), '12:00〜19:00');
eq('休み', v.shiftLabel({ isActive: false, start: null, end: null }), '');

console.log('── 3. 確かめ ──');
eq('ふつう', v.normalizeShifts([{ date: days[0], isActive: true, start: '20:00', end: '02:00' }, { date: days[1], isActive: false }], days),
   { ok: true, shifts: [{ date: days[0], isActive: true, start: '20:00', end: '02:00' }, { date: days[1], isActive: false, start: null, end: null }] });
eq('★ 範囲外の日付は断る', v.normalizeShifts([{ date: '2026-09-30', isActive: false }], days).ok, false);
eq('★ 同じ日付2つは断る', v.normalizeShifts([{ date: days[0], isActive: false }, { date: days[0], isActive: false }], days).ok, false);
eq('★ 出勤なのに時刻なしは断る', v.normalizeShifts([{ date: days[0], isActive: true, start: null, end: null }], days).ok, false);
eq('★ 15分は断る', v.normalizeShifts([{ date: days[0], isActive: true, start: '12:15', end: '19:00' }], days).ok, false);
eq('★ 同じ時刻は断る', v.normalizeShifts([{ date: days[0], isActive: true, start: '12:00', end: '12:00' }], days).ok, false);
eq('★ 休みは時刻を捨てる', v.normalizeShifts([{ date: days[0], isActive: false, start: '12:00', end: '13:00' }], days).shifts[0], { date: days[0], isActive: false, start: null, end: null });

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った');
