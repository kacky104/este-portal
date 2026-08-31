// お知らせの自動配信・押し直しの判定（src/lib/announceAuto.ts）の自己点検（第67便）。
//
// ★★★ なぜ要るか
//   この判定は【時刻が来ないと出ない】。手で確かめようとすると「明日の14:20」を待つことになり、
//   結局「たぶん出るはず」で済ませてしまう。★ now を引数にしてあるのは、そのため。
//   → 朝5:59 と 6:00、手動があった日、押し直しの30分、を **いま** 作って確かめる。
//
//   使い方:  npm run check:announceauto
//
// ★ 期待値を直すときは【なぜその値が正しいのか】をコメントに残すこと。

const a = require(require('path').join(__dirname, '..', '_tmpcheck', 'announceAuto.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// JST の時刻を作る（JST = UTC+9）
const jst = (s) => new Date(s + '+09:00');

// ── 1日の区切り（朝6:00 JST）──────────────────────────────
// ★ 0時ではなく6時で切る。深夜営業の店で「朝5時の手動」が昨日ぶんになるほうが感覚に合う
eq('05:59 は前日',        a.dayKeyJST(jst('2026-08-31T05:59:59')), '2026-08-30');
eq('06:00 ちょうどで当日', a.dayKeyJST(jst('2026-08-31T06:00:00')), '2026-08-31');
eq('06:00:01 も当日',      a.dayKeyJST(jst('2026-08-31T06:00:01')), '2026-08-31');
eq('深夜1時は前日',        a.dayKeyJST(jst('2026-08-31T01:00:00')), '2026-08-30');
eq('23:59 は当日',         a.dayKeyJST(jst('2026-08-31T23:59:00')), '2026-08-31');
// ★ 読めない時刻を推測で埋めない
eq('読めない時刻は null',  a.dayKeyJST(new Date('いつか')), null);

// 区切りの始まりは JST 06:00 ちょうど
eq('区切りの始まりは JST06:00',
  new Date(a.dayStartMs('2026-08-31')).toISOString(), '2026-08-30T21:00:00.000Z');

// ── 自動配信の時刻は店舗IDから決まる（保存しない）────────────
// ★ 同じIDなら何度呼んでも同じ（固定枠でないと分散が崩れる・§192）
eq('同じIDは同じ分',  a.autoPostMinuteOfDay(7), a.autoPostMinuteOfDay(7));
// ★ 連番の店が同じ時間帯に固まらない。337分（約5時間37分）離れる
eq('ID+1 は337分ずれる',
  (a.autoPostMinuteOfDay(8) - a.autoPostMinuteOfDay(7) + 1440) % 1440, 337);
eq('0〜1439 に収まる',
  [0, 1, 5, 100, 1439, 4321].every((id) => {
    const m = a.autoPostMinuteOfDay(id);
    return m >= 0 && m <= 1439;
  }), true);
eq('数でなければ null', a.autoPostMinuteOfDay(NaN), null);
// 表示用のラベル（区切り6:00 からの分を時刻に直す）
eq('ID1 の時刻ラベル', a.autoPostTimeLabel(1), '11:37');   // 6:00 + 337分 = 11:37
eq('ID0 の時刻ラベル', a.autoPostTimeLabel(0), '06:00');   // 6:00 + 0分

// ── 本文の指紋 ────────────────────────────────────────────
eq('同じ本文は同じ指紋',
  a.announceFingerprint('割引', '本文') === a.announceFingerprint('割引', '本文'), true);
eq('題が違えば別の指紋',
  a.announceFingerprint('割引', '本文') === a.announceFingerprint('割引2', '本文'), false);
eq('本文が違えば別の指紋',
  a.announceFingerprint('割引', '本文') === a.announceFingerprint('割引', '本文2'), false);
eq('null は空として扱う',
  a.announceFingerprint(null, null) === a.announceFingerprint('', ''), true);

// ── 守り2：自動は1日1回 ───────────────────────────────────
// ID1 の自動時刻は 11:37（上で確かめた）
const base = {
  salonId: 1,
  autoTargetCount: 3,
  lastAutoDay: null,
  lastManualAt: null,
  rotationIndex: null,
};
const judge = (o) => a.shouldAutoPost(Object.assign({}, base, o));

// ★★ 材料が読めていないときに「0件だから出さない」と言わない（作法3-5・§210の六度目）
eq('本数が数えられていない → unknown',
  judge({ now: jst('2026-08-31T12:00:00'), autoTargetCount: null }).reason, 'unknown');
eq('本数0件 → no_targets（unknown と別）',
  judge({ now: jst('2026-08-31T12:00:00'), autoTargetCount: 0 }).reason, 'no_targets');

eq('時刻前は出さない',
  judge({ now: jst('2026-08-31T11:36:59') }).post, false);
eq('時刻前の理由は not_yet',
  judge({ now: jst('2026-08-31T11:36:59') }).reason, 'not_yet');
eq('時刻ちょうどで出す',
  judge({ now: jst('2026-08-31T11:37:00') }).post, true);
eq('時刻を過ぎていれば出す（取りこぼした分も拾う）',
  judge({ now: jst('2026-08-31T23:00:00') }).post, true);

eq('今日ぶんを出したあとは出さない',
  judge({ now: jst('2026-08-31T23:00:00'), lastAutoDay: '2026-08-31' }).reason, 'done_today');
// ★ 翌朝6:00 でリセットされる（ローリングではなく日付で切る・§192）
eq('翌朝6時を過ぎれば、また出せる日になる',
  judge({ now: jst('2026-09-01T11:37:00'), lastAutoDay: '2026-08-31' }).post, true);
// ★ 5:59 はまだ前日。前日の自動は済んでいるので出さない
eq('翌朝5:59 はまだ前日',
  judge({ now: jst('2026-09-01T05:59:00'), lastAutoDay: '2026-08-31' }).reason, 'done_today');

// ── 手動があった日は、自動をお休みする（順番も進めない）──────
eq('同じ区切りに手動があれば出さない',
  judge({ now: jst('2026-08-31T12:00:00'), lastManualAt: jst('2026-08-31T09:00:00').toISOString() }).reason,
  'manual_today');
// ★ 前日（区切り前）の手動は関係ない
eq('区切りの前の手動は効かない',
  judge({ now: jst('2026-08-31T12:00:00'), lastManualAt: jst('2026-08-31T05:00:00').toISOString() }).post,
  true);
// ★ 自動が出たあとの手動は、その日の自動をもう止められない（§192の例）
eq('自動のあとの手動は、翌日の自動を止めない',
  judge({ now: jst('2026-09-01T11:37:00'), lastAutoDay: '2026-08-31',
          lastManualAt: jst('2026-08-31T21:00:00').toISOString() }).post, true);

// ── ローテの位置 ──────────────────────────────────────────
eq('位置が無ければ0本目', a.nextRotationIndex(null, 3), 0);
eq('0の次は1',            a.nextRotationIndex(0, 3), 1);
eq('最後の次は先頭へ戻る', a.nextRotationIndex(2, 3), 0);
// ★ 本数が減っていても必ず範囲に収める（お知らせを削除しても壊れない）
eq('本数が減っても範囲に収まる', a.nextRotationIndex(9, 3), 1);
eq('0本のときは0',        a.nextRotationIndex(5, 0), 0);
eq('出すときの位置が入る',
  judge({ now: jst('2026-08-31T12:00:00'), rotationIndex: 1 }).index, 2);

// ── 出さなかった理由は、店舗が読める1行になる ─────────────
eq('出したときは言わない', a.autoSkipMessage(judge({ now: jst('2026-08-31T12:00:00') })), null);
eq('unknown の文', a.autoSkipMessage(judge({ now: jst('2026-08-31T12:00:00'), autoTargetCount: null })),
  'お知らせの本数を数えられていないため、自動配信の判定をしていません');
eq('no_targets の文', a.autoSkipMessage(judge({ now: jst('2026-08-31T12:00:00'), autoTargetCount: 0 })),
  '「自動で回す」に印を付けたお知らせが1本もありません');

// ── 画面に出す1行は、判定と同じ結果から作る ─────────────
// ★ 画面が「今日は出ます」と言い、周は出さない、が起きうる形にしない
const st = (o) => a.autoStateMessage(judge(o), a.autoPostTimeLabel(1));
eq('時刻前は、何時ごろかを言う', st({ now: jst('2026-08-31T09:00:00') }),
  '今日は 11:37ごろに、1本を自動で出します');
eq('時刻を過ぎて未実行なら、まもなくと言う', st({ now: jst('2026-08-31T12:00:00') }),
  'まもなく、この日のぶんが1本、自動で出ます（11:37ごろ）');
eq('済みなら明日を言う', st({ now: jst('2026-08-31T12:00:00'), lastAutoDay: '2026-08-31' }),
  '今日のぶんは出しました（次は明日 11:37ごろ）');
eq('手動があった日はお休みと言う',
  st({ now: jst('2026-08-31T12:00:00'), lastManualAt: jst('2026-08-31T09:00:00').toISOString() }),
  '今日は手動で出したので、自動配信はお休みです（順番も進めません）');
eq('0件はお休みと言う', st({ now: jst('2026-08-31T12:00:00'), autoTargetCount: 0 }),
  '「自動で回す」に印を付けたお知らせがないため、自動配信はお休みです');
// ★ 分からないときは「お休み」と言わない（0件と混ぜない）
eq('読めていないときは、読めていないと言う',
  st({ now: jst('2026-08-31T12:00:00'), autoTargetCount: null }),
  'いまは自動配信の状態を読み取れていません');

// ── 守り3：押し直しは30分に1回。新しく書いたものは即 ────────
const FP_A = a.announceFingerprint('A', '本文A');
const FP_B = a.announceFingerprint('B', '本文B');
const NOW = jst('2026-08-31T12:00:00');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();
const manual = (o) => a.judgeManualPost(Object.assign({ now: NOW, fingerprint: FP_A }, o));

// ★ 書いたものが出ないのは、オーナー様から見て「壊れている」。新規に待ち時間は置かない
eq('新しく書いたものは即出す（1分前に別のを出していても）',
  manual({ fingerprint: FP_B, lastFingerprint: FP_A, lastBumpAt: minutesAgo(1) }).bumpFukues, true);
eq('新しく書いたものの種別は new',
  manual({ fingerprint: FP_B, lastFingerprint: FP_A, lastBumpAt: minutesAgo(1) }).kind, 'new');
eq('一度も出していなければ即出す',
  manual({ lastFingerprint: null, lastBumpAt: null }).bumpFukues, true);

eq('同じものを1分後に押し直し → 動かさない',
  manual({ lastFingerprint: FP_A, lastBumpAt: minutesAgo(1) }).bumpFukues, false);
eq('押し直しの種別は repost',
  manual({ lastFingerprint: FP_A, lastBumpAt: minutesAgo(1) }).kind, 'repost');
eq('あと何分かを切り上げで言う（29分残り）',
  manual({ lastFingerprint: FP_A, lastBumpAt: minutesAgo(1) }).waitMinutes, 29);
// ★ 切り上げ。「あと0分」と言って上がらないのが最悪
eq('29分30秒後の押し直しは、あと1分',
  a.judgeManualPost({ now: NOW, fingerprint: FP_A, lastFingerprint: FP_A,
    lastBumpAt: new Date(NOW.getTime() - 29.5 * 60000).toISOString() }).waitMinutes, 1);
eq('30分ちょうどで動く',
  manual({ lastFingerprint: FP_A, lastBumpAt: minutesAgo(30) }).bumpFukues, true);
eq('30分を過ぎれば動く',
  manual({ lastFingerprint: FP_A, lastBumpAt: minutesAgo(31) }).bumpFukues, true);

// ★ 止める根拠が無いときは止めない（いつ動かしたか分からない＝待たせる理由が無い）
eq('前回時刻が読めなければ動かす',
  manual({ lastFingerprint: FP_A, lastBumpAt: 'いつか' }).bumpFukues, true);
// ★ 時計のずれ（未来の時刻）で人を待たせない
eq('前回が未来でも動かす',
  manual({ lastFingerprint: FP_A, lastBumpAt: new Date(NOW.getTime() + 600000).toISOString() }).bumpFukues, true);

// ★ 点検で短くできること（30分は仮の数字・1か所の定数）
eq('cooldown は差し替えられる',
  a.judgeManualPost({ now: NOW, fingerprint: FP_A, lastFingerprint: FP_A,
    lastBumpAt: minutesAgo(5), cooldownMinutes: 3 }).bumpFukues, true);

// ── ★★ 黙って何も起きないのが最悪。両方の結果を必ず言葉にする ──
eq('駅ちかOK・フクエスも出た',
  a.manualPostMessage(manual({ lastFingerprint: null, lastBumpAt: null }), 'ok'),
  '駅ちかへ送りました。\nフクエスの新着にも出ました。');
eq('駅ちかOK・フクエスは待ち',
  a.manualPostMessage(manual({ lastFingerprint: FP_A, lastBumpAt: minutesAgo(1) }), 'ok'),
  '駅ちかへ送りました。\nフクエスの新着は、あと29分で上がります。');
// ★ できなかったことも、できない理由といっしょに出す（作法3-7）
eq('駅ちかNGも言葉にする',
  a.manualPostMessage(manual({ lastFingerprint: null, lastBumpAt: null }), 'ng'),
  '駅ちかへは送れませんでした（連携の記録をご確認ください）。\nフクエスの新着にも出ました。');
// ★★ 送る先になっていないときは、その行を出さない。
//   お知らせの駅ちか書き込みはまだ無い（§195 の5）。毎回「送れませんでした」と出すと
//   壊れているように見える。★ 起きていないことを、失敗として書かない
eq('駅ちかが送り先でなければ言わない',
  a.manualPostMessage(manual({ lastFingerprint: null, lastBumpAt: null }), 'none'),
  'フクエスの新着にも出ました。');
eq('駅ちか無し・待ちのときも1行だけ',
  a.manualPostMessage(manual({ lastFingerprint: FP_A, lastBumpAt: minutesAgo(1) }), 'none'),
  'フクエスの新着は、あと29分で上がります。');

// ── 守り1：新着ブロックは1店舗1件 ────────────────────────
// ★ 並べ替えない。新しい順のまま、2件目以降を落とすだけ
const n = (id, salonId) => ({ id: id, salonId: salonId });
eq('同じ店が続いても1件だけ残る',
  a.pickOnePerSalon([n('a', 1), n('b', 1), n('c', 1), n('d', 2), n('e', 3)], 5).map((x) => x.id),
  ['a', 'd', 'e']);
eq('残るのは新しいほう（先頭）',
  a.pickOnePerSalon([n('新', 1), n('古', 1)], 5).map((x) => x.id), ['新']);
eq('枠の数で切る',
  a.pickOnePerSalon([n('a', 1), n('b', 2), n('c', 3)], 2).map((x) => x.id), ['a', 'b']);
// ★ 読んだ範囲が1店で埋まっていたら、枠を空けたまま出す。
//   数を合わせるために古い記事を混ぜない（§210 と同じ作法）
eq('足りなければ空けたまま出す',
  a.pickOnePerSalon([n('a', 1), n('b', 1), n('c', 1)], 5).length, 1);
eq('0件は0件', a.pickOnePerSalon([], 5), []);
eq('枠0なら何も出さない', a.pickOnePerSalon([n('a', 1)], 0), []);

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
