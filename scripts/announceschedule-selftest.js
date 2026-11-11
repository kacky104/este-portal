// お知らせを「決めた時刻」で自動投稿する判定（src/lib/announceSchedule.ts）の自己点検（第1965便）。
//   使い方:  npm run check:announceschedule
// ★ 時刻が来ないと出ない判定なので、now を作って確かめる（announceauto-selftest.js と同じ考え方）。

const a = require(require('path').join(__dirname, '..', '_tmpcheck', 'announceSchedule.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const jst = (s) => new Date(s + '+09:00');
const iso = (s) => jst(s).toISOString();

// ── 1日の上限 ──
eq('ふつうの店は5回', a.announceDailyLimit(false), 5);
eq('時刻を設定して ON の店は10回', a.announceDailyLimit(true), 10);

// ── 設定の確かめ ──
const timer = { enabled: true, startMin: 600, endMin: 1320, intervalMin: 120, times: null };   // 10:00〜22:00・120分ごと
eq('10:00〜22:00・120分ごとは7回', a.announceSchedulePerDay(timer), 7);
eq('7回は保存できる', a.validateAnnounceSchedule(timer), null);
// 10:00〜22:00 を60分ごと＝13回。10回を超えるので保存させない
eq('13回になる設定は断る', typeof a.validateAnnounceSchedule({ ...timer, intervalMin: 60 }), 'string');
// 10:00〜19:00 を60分ごと＝ちょうど10回
eq('ちょうど10回は保存できる', a.validateAnnounceSchedule({ ...timer, endMin: 1140, intervalMin: 60 }), null);
eq('間隔5分は断る', typeof a.validateAnnounceSchedule({ ...timer, intervalMin: 5 }), 'string');
eq('始まりと終わりが同じ時刻は断る', typeof a.validateAnnounceSchedule({ ...timer, endMin: 600 }), 'string');
const times = { enabled: true, startMin: 600, endMin: 1320, intervalMin: 120, times: [540, 720, 1080] };   // 9:00・12:00・18:00
eq('時刻3つは3回', a.announceSchedulePerDay(times), 3);
eq('時刻3つは保存できる', a.validateAnnounceSchedule(times), null);
eq('時刻11個は断る', typeof a.validateAnnounceSchedule({ ...times, times: [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600] }), 'string');

// ── DB の行から ──
eq('行が無ければ null', a.announceScheduleFromRow(null), null);
eq('行から設定を作る', a.announceScheduleFromRow({ enabled: true, start_min: 600, end_min: 1320, interval_min: 120, times: null }), timer);
eq('読めない値の行は null', a.announceScheduleFromRow({ enabled: true, start_min: 'x', end_min: 1320, interval_min: 120, times: null }), null);

// ── 出すか ──
const base = { setting: timer, slotDoneAt: null, autoTargetCount: 3, usedToday: 0, rotationIndex: null };
eq('時間帯の前は出さない', a.shouldSchedulePost({ ...base, now: jst('2026-11-12T09:50:00') }), { post: false, reason: 'out_of_window' });
eq('10:00 の回・10:03 の見回りで出す（0本目から）',
  a.shouldSchedulePost({ ...base, now: jst('2026-11-12T10:03:00') }), { post: true, reason: null, slotAt: iso('2026-11-12T10:00:00'), index: 0 });
// 同じ回（10:00〜11:59）ではもう出さない
eq('同じ回では2度出さない',
  a.shouldSchedulePost({ ...base, now: jst('2026-11-12T10:13:00'), slotDoneAt: iso('2026-11-12T10:00:00'), rotationIndex: 0 }), { post: false, reason: 'done_this_slot' });
eq('次の回（12:00）で次の1本',
  a.shouldSchedulePost({ ...base, now: jst('2026-11-12T12:03:00'), slotDoneAt: iso('2026-11-12T10:00:00'), rotationIndex: 0 }), { post: true, reason: null, slotAt: iso('2026-11-12T12:00:00'), index: 1 });
// 設定を 10:40 に保存した（slot_done_at ＝ 保存した時刻）→ いまの回は飛ばして、次の回から
eq('保存した回は出さない',
  a.shouldSchedulePost({ ...base, now: jst('2026-11-12T10:43:00'), slotDoneAt: iso('2026-11-12T10:40:00') }), { post: false, reason: 'done_this_slot' });
eq('最後の回（22:00）は出す',
  a.shouldSchedulePost({ ...base, now: jst('2026-11-12T22:03:00'), slotDoneAt: iso('2026-11-12T20:00:00'), rotationIndex: 2 }), { post: true, reason: null, slotAt: iso('2026-11-12T22:00:00'), index: 0 });
eq('時間帯のあとは出さない', a.shouldSchedulePost({ ...base, now: jst('2026-11-12T23:00:00') }), { post: false, reason: 'out_of_window' });
// ★ 手で投稿した日も止めない（合わせて10回まで）
eq('今日9回出していても出す', a.shouldSchedulePost({ ...base, now: jst('2026-11-12T10:03:00'), usedToday: 9 }).post, true);
eq('今日10回出していたら出さない', a.shouldSchedulePost({ ...base, now: jst('2026-11-12T10:03:00'), usedToday: 10 }), { post: false, reason: 'limit' });
eq('回数が読めないときは止めない', a.shouldSchedulePost({ ...base, now: jst('2026-11-12T10:03:00'), usedToday: null }).post, true);
eq('止めている店は出さない', a.shouldSchedulePost({ ...base, setting: { ...timer, enabled: false }, now: jst('2026-11-12T10:03:00') }), { post: false, reason: 'off' });
eq('印の付いたお知らせが0件', a.shouldSchedulePost({ ...base, autoTargetCount: 0, now: jst('2026-11-12T10:03:00') }), { post: false, reason: 'no_targets' });
eq('本数が読めていない（0件と混ぜない）', a.shouldSchedulePost({ ...base, autoTargetCount: null, now: jst('2026-11-12T10:03:00') }), { post: false, reason: 'unknown' });
eq('設定が読めていない', a.shouldSchedulePost({ ...base, setting: null, now: jst('2026-11-12T10:03:00') }), { post: false, reason: 'unknown' });

// ── 時刻指定 ──
const tb = { ...base, setting: times };
eq('時刻指定: 12:00 の回を 12:07 の見回りで出す',
  a.shouldSchedulePost({ ...tb, now: jst('2026-11-12T12:07:00') }), { post: true, reason: null, slotAt: iso('2026-11-12T12:00:00'), index: 0 });
eq('時刻指定: 出した回は出さない',
  a.shouldSchedulePost({ ...tb, now: jst('2026-11-12T12:17:00'), slotDoneAt: iso('2026-11-12T12:00:00') }), { post: false, reason: 'done_this_slot' });
// 過ぎてから30分より前の時刻は、あとから出さない
eq('時刻指定: 40分過ぎた時刻は出さない', a.shouldSchedulePost({ ...tb, now: jst('2026-11-12T12:40:00') }), { post: false, reason: 'out_of_window' });
eq('時刻指定: 時刻の前は出さない', a.shouldSchedulePost({ ...tb, now: jst('2026-11-12T11:55:00') }), { post: false, reason: 'out_of_window' });

// ── 画面の1行 ──
eq('タイマーの1行', a.announceScheduleMessage(timer, 4), 'タイマー更新（10:00〜22:00・120分ごと）で、1日7回・順番に自動投稿します（自動投稿設定4件）');
eq('時刻指定の1行', a.announceScheduleMessage(times, 2), '時刻指定更新（09:00・12:00・18:00）で、1日3回・順番に自動投稿します（自動投稿設定2件）');

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
