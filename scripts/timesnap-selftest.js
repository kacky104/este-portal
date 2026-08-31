// 出勤時刻を媒体の刻みへ内側に寄せる（src/lib/timeSnap.ts）の自己点検（第73便）。
//
// ★★★ なぜ要るか
//   これは【店舗が入れた時刻を書き換える】判定。1つ間違えると、
//   ・実際より長く出す → 客様が来て「いない」
//   ・勝手に時間を足す → 店舗が入れていない勤務を作る
//   ★ どちらも店舗の信用に直に響く。境界をここで全部固定する。
//
//   使い方:  npm run check:timesnap

const t = require(require('path').join(__dirname, '..', '_tmpcheck', 'timeSnap.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const M = (h, m) => h * 60 + (m || 0);

// ── 寄せる必要がないものは、そのまま ──
eq('ちょうどの時刻は動かさない', t.snapInward(M(20), M(27)), { ok: true, startMin: 1200, endMin: 1620, snapped: false });
eq('30分ちょうども動かさない', t.snapInward(M(20, 30), M(26, 30)).snapped, false);

// ── ★★ 内側へ寄せる（開始は遅いほう・終了は早いほう）──
eq('20:15〜26:45 → 20:30〜26:30',
  [t.snapInward(M(20, 15), M(26, 45)).startMin, t.snapInward(M(20, 15), M(26, 45)).endMin],
  [M(20, 30), M(26, 30)]);
eq('寄せたら snapped が立つ', t.snapInward(M(20, 15), M(26, 45)).snapped, true);
// ★ 外側に寄せない。20:15 を 20:00 にしない（まだ居ない時間に出してしまう）
eq('開始を早くしない', t.snapInward(M(20, 15), M(27)).startMin > M(20), true);
// ★ 終了を遅くしない（もう帰った時間に出してしまう）
eq('終了を遅くしない', t.snapInward(M(20), M(26, 45)).endMin < M(27), true);
eq('45分は30分へ下げる（終了）', t.snapInward(M(20), M(26, 45)).endMin, M(26, 30));
eq('45分は翌の刻みへ上げる（開始）', t.snapInward(M(20, 45), M(27)).startMin, M(21));

// ── ★★★ 寄せると勤務が無くなるものは送らない（時間を勝手に足さない）──
eq('20:15〜20:30 は送らない', t.snapInward(M(20, 15), M(20, 30)).ok, false);
eq('その理由に元と後の両方を書く',
  t.snapInward(M(20, 15), M(20, 30)).reason,
  '刻みに合わせると勤務時間が無くなります（20:15〜20:30 → 20:30〜20:30）');
eq('20:15〜20:45 も送らない（30分に満たない）', t.snapInward(M(20, 15), M(20, 45)).ok, false);
// ★ ちょうど1コマ残るなら送る
eq('20:15〜21:00 は 20:30〜21:00 で送る',
  [t.snapInward(M(20, 15), M(21)).startMin, t.snapInward(M(20, 15), M(21)).endMin], [M(20, 30), M(21)]);

// ── 深夜跨ぎ（24時超え表記のまま扱う）──
eq('20:00〜翌3:15 → 20:00〜翌3:00', t.snapInward(M(20), M(27, 15)).endMin, M(27));
eq('翌5:45 終わりは翌5:30 へ', t.snapInward(M(20), M(29, 45)).endMin, M(29, 30));

// ── 壊れた入力は判定しない ──
eq('終了が開始と同じなら送らない', t.snapInward(M(20), M(20)).ok, false);
eq('終了が開始より前なら送らない', t.snapInward(M(20), M(19)).ok, false);
eq('数でなければ送らない', t.snapInward(NaN, M(20)).ok, false);
eq('刻みが0なら送らない', t.snapInward(M(20), M(21), 0).ok, false);

// ── 寄せたことは必ず言葉にする（黙って書き換えない）──
eq('寄せていなければ言わない',
  t.snapNote(M(20), M(27), { startMin: M(20), endMin: M(27), snapped: false }), null);
eq('寄せたら元と後を並べて言う',
  t.snapNote(M(20, 15), M(26, 45), { startMin: M(20, 30), endMin: M(26, 30), snapped: true }),
  '20:15〜26:45 → 20:30〜26:30');
eq('24時超えはそのまま表記する', t.minutesLabel(M(27, 30)), '27:30');

// ── フクエスの入力（"HH:MM"）を、保存の前に寄せる（第75便）──
// ★ 4サイトとも30分刻みだったので、入口で揃える
eq('30分ちょうどはそのまま', t.snapClockPair('20:00', '03:00'), { ok: true, start: '20:00', end: '03:00', changed: false });
eq('20:15〜02:45 → 20:30〜02:30', t.snapClockPair('20:15', '02:45'), { ok: true, start: '20:30', end: '02:30', changed: true });
eq('昼の枠も寄る', t.snapClockPair('12:15', '21:45'), { ok: true, start: '12:30', end: '21:30', changed: true });
// ★ 日跨ぎでも長さを取り違えない（02:30 は翌日として測る）
eq('日跨ぎの長さを取り違えない', t.snapClockPair('20:15', '02:45').end, '02:30');
// ★★ 寄せると勤務が無くなる枠は【寄せない】。勝手に30分に伸ばさない
eq('12:15〜12:30 は寄せない', t.snapClockPair('12:15', '12:30').ok, false);
eq('同じ時刻も寄せない', t.snapClockPair('12:00', '12:00').ok, false);
eq('形が読めなければ寄せない', t.snapClockPair('1215', '12:30').ok, false);
// ★ 23:45 は 24:00＝00:00 へ回す（フクエスは素の時刻で持つ）
eq('23:45 開始は 00:00 へ回る', t.snapClockPair('23:45', '05:00').start, '00:00');

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
