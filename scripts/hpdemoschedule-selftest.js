// サンプル店舗（デモ）の出勤の判定・組み立て（src/lib/hpDemoSchedule.ts）の自己点検（第295便）。
//
// ★★★ なぜ要るか
//   「残り7日を切ったら作り直す」は、放っておくと【1週間待たないと確かめられない】。
//   ★ today を引数にしてあるのは、そのため。★ 境目（7日ちょうど・6日・切れた日）を **いま** 作って見る。
//
//   使い方:  npm run check:hpdemoschedule
//
// ★ 期待値を直すときは【なぜその値が正しいのか】をコメントに残すこと。

const a = require(require('path').join(__dirname, '..', '_tmpcheck', 'hpDemoSchedule.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// ── 日付の足し算 ─────────────────────────────────────
eq('翌日',            a.addDaysYmd('2026-09-12', 1),  '2026-09-13');
eq('0日は同じ日',      a.addDaysYmd('2026-09-12', 0),  '2026-09-12');
eq('月をまたぐ',       a.addDaysYmd('2026-09-30', 1),  '2026-10-01');
eq('年をまたぐ',       a.addDaysYmd('2026-12-31', 1),  '2027-01-01');
// ★ うるう年（2028-02-29 がある）
eq('うるう年の2月',    a.addDaysYmd('2028-02-28', 1),  '2028-02-29');
eq('読めない日は null', a.addDaysYmd('いつか', 1),      null);

// ── 日数の差 ────────────────────────────────────────
eq('差は b - a',       a.diffDaysYmd('2026-09-12', '2026-09-19'), 7);
eq('同じ日は0',        a.diffDaysYmd('2026-09-12', '2026-09-12'), 0);
eq('過去なら負',       a.diffDaysYmd('2026-09-12', '2026-09-10'), -2);
eq('月またぎも数える', a.diffDaysYmd('2026-09-28', '2026-10-05'), 7);

// ── 作り直すかの判定 ─────────────────────────────────
const T = '2026-09-12';
// ★ 残り7日ちょうど＝【まだ足りている】。★ 「切ったら」なので 7 は含まない
eq('残り7日ちょうどは作らない', a.shouldReseedDemoSchedule(T, '2026-09-19'),
  { reseed: false, reason: 'enough', remainDays: 7 });
// ★ 残り6日＝7日を切った＝作り直す
eq('残り6日で作り直す', a.shouldReseedDemoSchedule(T, '2026-09-18'),
  { reseed: true, reason: 'running_out', remainDays: 6 });
// ★ 最終日が今日＝今日で切れる
eq('最終日が今日なら作り直す', a.shouldReseedDemoSchedule(T, '2026-09-12'),
  { reseed: true, reason: 'running_out', remainDays: 0 });
// ★ とっくに切れている（最終日が過去）
eq('切れていたら作り直す', a.shouldReseedDemoSchedule(T, '2026-09-01'),
  { reseed: true, reason: 'running_out', remainDays: -11 });
// ★ 1件も無い＝まだ作っていない。★ 「足りている」と混ぜない
eq('1件も無ければ作る', a.shouldReseedDemoSchedule(T, null),
  { reseed: true, reason: 'no_schedule', remainDays: null });
// ★★ 読めない日付は【作る側】に倒す（上書きで済む側だから）。★ 黙って「足りている」にしない
eq('読めない日付は作る側へ', a.shouldReseedDemoSchedule(T, 'こわれた'),
  { reseed: true, reason: 'unreadable', remainDays: null });
// ★ 14日分を作った直後は、当然まだ足りている（残り13日）
eq('作った直後は足りている', a.shouldReseedDemoSchedule(T, a.addDaysYmd(T, 13)),
  { reseed: false, reason: 'enough', remainDays: 13 });
// ★ しきい値は差し替えられる
eq('しきい値を3日にすると残り6日は足りている', a.shouldReseedDemoSchedule(T, '2026-09-18', 3),
  { reseed: false, reason: 'enough', remainDays: 6 });

// ── 出勤行の組み立て ─────────────────────────────────
const IDS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
const rows = a.buildDemoScheduleRows(IDS, T);
eq('14日 × 8人 = 112行', rows.length, 14 * 8);
eq('1日目は今日',        rows[0].schedule_date, T);
eq('最終日は13日後',      rows[rows.length - 1].schedule_date, a.addDaysYmd(T, 13));
// ★ 同じ（人・日）が2つ出ない＝upsert が衝突しない
eq('重複なし', new Set(rows.map((r) => r.therapist_id + '@' + r.schedule_date)).size, rows.length);
// ★ 出勤の人数は日替わりで揺れる（8人なら枠5・端数は偶数日だけ）
const onCount = (d) => rows.filter((r) => r.schedule_date === a.addDaysYmd(T, d) && r.is_active).length;
eq('偶数日は5人', onCount(0), 5);
eq('奇数日は4人', onCount(1), 4);
// ★ 休みの行は時間を持たない（★ 休みなのに時間が残っていると画面が誤解する）
eq('休みは時間が null', rows.filter((r) => !r.is_active).every((r) => r.start_time === null && r.end_time === null), true);
eq('出勤は時間を持つ',  rows.filter((r) => r.is_active).every((r) => !!r.start_time && !!r.end_time), true);
// ★ 少人数でも枠は最少3（★ 2人しかいなければ全員出勤になる）
const few = a.buildDemoScheduleRows(['t1', 't2'], T);
eq('2人でも14日分できる', few.length, 28);
eq('2人なら毎日2人とも出勤', few.filter((r) => r.is_active).length, 28);
// ★ 0人なら1行も作らない（★ 空の行を書きに行かない）
eq('0人なら0行', a.buildDemoScheduleRows([], T).length, 0);
// ★ 起点が読めないなら1行も作らない（★ 中途半端に書かない）
eq('起点が読めなければ0行', a.buildDemoScheduleRows(IDS, 'いつか').length, 0);
// ★ 日数は差し替えられる
eq('7日ぶんも作れる', a.buildDemoScheduleRows(IDS, T, 7).length, 7 * 8);

console.log(fail === 0 ? '\nすべて通りました' : `\n${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
