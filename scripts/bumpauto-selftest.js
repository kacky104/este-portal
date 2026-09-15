// 上位表示の自動実行（src/lib/bumpAuto.ts）の自己点検（第385便・2026-09-15）。
//
// ★★★ ここで危ないのは:
//   ・回数が「読めていない」を 0 として扱う → 上限を越えて押しに行く
//   ・手で押した直後に自動が重なる       → 回数を2つ使って並びは1つしか動かない
//   ・日またぎ（22:00〜翌2:00）の外を中と読む → 寝ている間じゅう押し続ける
//   ・残り0でも押しに行く                → 毎周エラーを返され、ログだけが増える
//
//   使い方:  npm run check:bumpauto

const B = require(require('path').join(__dirname, '..', '_tmpcheck', 'bumpAuto.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ★ JST の時刻を作る（引数は JST の時・分）
const jst = (d, h, mi) => new Date(Date.parse('2026-09-' + String(d).padStart(2, '0')
  + 'T' + String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':00+09:00'));

console.log('── 1. 回数の上限 ──');
eq('★ 土台は20回', B.bumpQuota(false), 20);
eq('★★ ワーク掲載店は40回', B.bumpQuota(true), 40);
eq('★ 数字は定数で持つ', [B.BUMP_QUOTA_BASE, B.BUMP_QUOTA_JOBS_BONUS], [20, 20]);

console.log('\n── 2. ★★★ 残り回数（朝6時区切り） ──');
{
  const now = jst(15, 15, 0);                       // 2026-09-15 15:00 JST → 営業日は 2026-09-15
  eq('★ 今日ぶんを5回使っていれば残り15', B.bumpRemaining({ now, jobsEnabled: false, bumpDay: '2026-09-15', bumpUsed: 5 }), 15);
  eq('★★ 昨日の記録は関係ない（満タン）', B.bumpRemaining({ now, jobsEnabled: false, bumpDay: '2026-09-14', bumpUsed: 20 }), 20);
  eq('★ 一度も押していなければ満タン', B.bumpRemaining({ now, jobsEnabled: true, bumpDay: null, bumpUsed: null }), 40);
  eq('★★ 使い切っていれば0（負にしない）', B.bumpRemaining({ now, jobsEnabled: false, bumpDay: '2026-09-15', bumpUsed: 25 }), 0);
  eq('★★★ 今日の記録なのに回数が読めない → null', B.bumpRemaining({ now, jobsEnabled: false, bumpDay: '2026-09-15', bumpUsed: null }), null);
  // ★ 朝6時前は「前日」あつかい（SQL 側 v_today と同じ切り方）
  eq('★★ 朝5時は前日ぶんの続き', B.bumpRemaining({ now: jst(16, 5, 0), jobsEnabled: false, bumpDay: '2026-09-15', bumpUsed: 7 }), 13);
  eq('★★ 朝6時で戻る', B.bumpRemaining({ now: jst(16, 6, 0), jobsEnabled: false, bumpDay: '2026-09-15', bumpUsed: 7 }), 20);
}

console.log('\n── 3. 設定の値 ──');
eq('★ 30分は選べる', B.isValidBumpInterval(30), true);
eq('★★ 7分は選べない', B.isValidBumpInterval(7), false);
eq('★ 文字列は選べない', B.isValidBumpInterval('30'), false);
eq('★ 0分は選べない', B.isValidBumpInterval(0), false);
eq('★ 0分（0:00）は時刻として有効', B.isValidMinuteOfDay(0), true);
eq('★ 1439（23:59）は有効', B.isValidMinuteOfDay(1439), true);
eq('★★ 1440は無効（こちらが引く線）', B.isValidMinuteOfDay(1440), false);
eq('★ 小数は無効', B.isValidMinuteOfDay(30.5), false);

console.log('\n── 4. 時刻の行き来 ──');
eq('★ 600 → 10:00', B.minuteLabel(600), '10:00');
eq('★ 0 → 00:00', B.minuteLabel(0), '00:00');
eq('★ 1439 → 23:59', B.minuteLabel(1439), '23:59');
eq('★ 10:00 → 600', B.minuteFromLabel('10:00'), 600);
eq('★ 9:05 → 545', B.minuteFromLabel('9:05'), 545);
eq('★★ 読めない文字は null（既定値で埋めない）', B.minuteFromLabel('あさ'), null);
eq('★★ 24:00 は null', B.minuteFromLabel('24:00'), null);
eq('★ 空文字は null', B.minuteFromLabel(''), null);

console.log('\n── 5. ★★★ 時間帯（日またぎ） ──');
eq('★ 10:00〜23:00 の 15:00 は中', B.bumpWindowContains(900, 600, 1380), true);
eq('★ 10:00〜23:00 の 09:59 は外', B.bumpWindowContains(599, 600, 1380), false);
eq('★ 開始ちょうどは中', B.bumpWindowContains(600, 600, 1380), true);
eq('★ 終了ちょうども中', B.bumpWindowContains(1380, 600, 1380), true);
eq('★ 23:01 は外', B.bumpWindowContains(1381, 600, 1380), false);
// ★★ 22:00〜翌2:00
eq('★★★ 日またぎ 23:00 は中', B.bumpWindowContains(1380, 1320, 120), true);
eq('★★★ 日またぎ 01:00 は中', B.bumpWindowContains(60, 1320, 120), true);
eq('★★★ 日またぎ 03:00 は外', B.bumpWindowContains(180, 1320, 120), false);
eq('★★★ 日またぎ 21:59 は外', B.bumpWindowContains(1319, 1320, 120), false);
eq('★★ 開始と終了が同じ＝その1分だけ（1日中と読まない）', [B.bumpWindowContains(600, 600, 600), B.bumpWindowContains(601, 600, 600)], [true, false]);

console.log('\n── 6. 時間帯の長さと本数 ──');
eq('★ 10:00〜23:00 は780分', B.bumpWindowLength(600, 1380), 780);
eq('★★ 22:00〜翌2:00 は240分', B.bumpWindowLength(1320, 120), 240);
eq('★ 30分ごとなら27回', B.bumpAutoMaxPerDay(600, 1380, 30), 27);
eq('★ 60分ごとなら14回', B.bumpAutoMaxPerDay(600, 1380, 60), 14);
eq('★★ 間隔が壊れていれば0回', B.bumpAutoMaxPerDay(600, 1380, 7), 0);

console.log('\n── 7. ★★★ 押すか押さないか ──');
{
  const base = {
    now: jst(15, 15, 0), enabled: true,
    startMin: 600, endMin: 1380, intervalMin: 30,
    lastBumpAt: null, remaining: 40,
  };
  const j = (over) => B.shouldAutoBump({ ...base, ...over });

  eq('★ 時間帯の中・一度も押していない → 押す', j({}).bump, true);
  eq('★ 理由は ok', j({}).reason, 'ok');
  eq('★★ 元栓が入っていなければ押さない', j({ enabled: false }).reason, 'off');
  eq('★★★ 回数が読めていなければ押さない（0と混ぜない）', j({ remaining: null }).reason, 'unknown');
  eq('★★★ 残り0なら押さない', j({ remaining: 0 }).reason, 'no_quota');
  eq('★★ 設定が壊れていれば押さない', j({ intervalMin: 7 }).reason, 'bad_setting');
  eq('★★ 時間帯の外なら押さない', j({ now: jst(15, 9, 0) }).reason, 'out_of_window');

  // ★★★ 間隔（手動も含めた最後の1回から数える）
  eq('★★★ 29分前に押していれば押さない', j({ lastBumpAt: jst(15, 14, 31).toISOString() }).reason, 'too_soon');
  eq('★★ あと1分だけ待つ', j({ lastBumpAt: jst(15, 14, 31).toISOString() }).waitMin, 1);
  eq('★★★ 30分ちょうど空いていれば押す', j({ lastBumpAt: jst(15, 14, 30).toISOString() }).bump, true);
  eq('★ 31分前なら押す', j({ lastBumpAt: jst(15, 14, 29).toISOString() }).bump, true);
  eq('★★ 未来の時刻（時計のずれ）は押さない', j({ lastBumpAt: jst(15, 16, 0).toISOString() }).reason, 'too_soon');
  eq('★★ 読めない時刻は押さない', j({ lastBumpAt: 'きのう' }).reason, 'unknown');

  // ★★ 止める順番（先に見るものが先に出る）
  eq('★★★ 元栓オフは、設定が壊れていても off', j({ enabled: false, intervalMin: 7 }).reason, 'off');
  eq('★★★ 残り0は、時間帯の外より先に no_quota', j({ remaining: 0, now: jst(15, 9, 0) }).reason, 'no_quota');

  // ★★ 日またぎの店（22:00〜翌2:00）
  const night = { ...base, startMin: 1320, endMin: 120 };
  eq('★★★ 深夜1時は押す', B.shouldAutoBump({ ...night, now: jst(16, 1, 0) }).bump, true);
  eq('★★★ 朝3時は押さない', B.shouldAutoBump({ ...night, now: jst(16, 3, 0) }).reason, 'out_of_window');
}

console.log('\n── 8. ★★ 画面の1行 ──');
{
  const on = { enabled: true, startMin: 600, endMin: 1380, intervalMin: 30, remaining: 40 };
  eq('★ 時間帯と間隔と本数を言う', B.bumpAutoNote(on),
    '10:00〜23:00 のあいだ 30分ごとに自動で上位表示します（1日最大 27回）。');
  eq('★★ 残りが本数より少なければ、途中で止まると言う', B.bumpAutoNote({ ...on, remaining: 10 }),
    '10:00〜23:00 のあいだ 30分ごとに自動で上位表示します（1日最大 27回）。 本日の残りは 10回なので、途中で止まります。');
  eq('★★★ 残り0なら、明朝6時に戻ると言う', B.bumpAutoNote({ ...on, remaining: 0 }),
    '10:00〜23:00 のあいだ 30分ごとに自動で上位表示します（1日最大 27回）。 本日の回数は使い切りました。明朝6時に戻ります。');
  eq('★ 回数が読めなければ、そこは言わない', B.bumpAutoNote({ ...on, remaining: null }),
    '10:00〜23:00 のあいだ 30分ごとに自動で上位表示します（1日最大 27回）。');
  eq('★★ 日またぎは（翌日）と添える', B.bumpAutoNote({ ...on, startMin: 1320, endMin: 120 }),
    '22:00〜02:00（翌日） のあいだ 30分ごとに自動で上位表示します（1日最大 9回）。');
  eq('★★ お休み中でも手動は押せると言う', B.bumpAutoNote({ ...on, enabled: false }),
    '自動実行はお休み中です。手動のボタンはいつでも押せます。');
  eq('★★ 設定が壊れていれば、それを言う', B.bumpAutoNote({ ...on, intervalMin: 7 }),
    '時間帯か間隔の設定を見直してください。');
  eq('★ 文言に「★」を混ぜない', /★/.test(B.bumpAutoNote(on)), false);
  eq('★ 内部の言葉を出さない', /bump|auto|null/i.test(B.bumpAutoNote(on)), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : `\n★★ ${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
