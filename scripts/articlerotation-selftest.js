// 新着を「1日◯回・順番に」出す判定（src/lib/articleRotation.ts）の自己点検（第154便・2026-09-05）。
//
// ★★★ ここで危ないのは:
//   ・「数えられていない」を 0 として扱う → 印が0本なのか読めていないのか分からないまま出す
//   ・回数を守らない → 枠は5つで上書きなので、出しすぎると読まれる前に消える
//   ・手で出したぶんを数えない → 1日4回のはずが5回6回になる
//
//   使い方:  npm run check:articlerotation

const R = require(require('path').join(__dirname, '..', '_tmpcheck', 'articleRotation.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const SALON = 6;                                   // ★ ラビリンス様
const at = (iso) => new Date(Date.parse(iso));

console.log('── 1. 回数の設定 ──');
eq('既定は1日4回', R.ARTICLE_POSTS_PER_DAY_DEFAULT, 4);
eq('1回は有効', R.isValidPostsPerDay(1), true);
eq('12回は有効', R.isValidPostsPerDay(12), true);
eq('★★ 0回は無効', R.isValidPostsPerDay(0), false);
eq('★★ 13回は無効（★ こちらが引く線。相手の決まりではない）', R.isValidPostsPerDay(13), false);
eq('★ 小数は無効', R.isValidPostsPerDay(2.5), false);
eq('★ 文字列は無効', R.isValidPostsPerDay('4'), false);

console.log('\n── 2. 時刻の割り当て ──');
{
  const m4 = R.articlePostMinutes(SALON, 4);
  eq('★ 4回ぶん出る', m4.length, 4);
  eq('★★ 昇順', m4.slice().sort((a, b) => a - b), m4);
  eq('★ すべて0〜1439', m4.every((x) => x >= 0 && x < 1440), true);
  // ★ 等間隔（1440÷4 = 360分）
  const gaps = m4.slice(1).map((x, i) => x - m4[i]);
  eq('★★ 間隔は360分ずつ', gaps, [360, 360, 360]);
  eq('★ 1回なら1つ', R.articlePostMinutes(SALON, 1).length, 1);
  eq('★★ 回数が範囲外なら null', R.articlePostMinutes(SALON, 0), null);
  eq('★★ 店舗IDが壊れていれば null', R.articlePostMinutes(NaN, 4), null);
}
{
  const labels = R.articlePostTimeLabels(SALON, 4);
  eq('★ 時刻の形', labels.every((s) => /^\d{2}:\d{2}$/.test(s)), true);
  eq('★ 4つ', labels.length, 4);
  // ★★ 店舗が違えば時刻も違う（★ 全店が同じ時刻に集中しない）
  eq('★★★ 店舗ごとにばらける', R.articlePostMinutes(6, 4)[0] === R.articlePostMinutes(7, 4)[0], false);
}

{
  // ★★ 実際に何時に出るのか（★ 区切りが朝6時なので、4本目は翌暦日の深夜になる）
  const labels = R.articlePostTimeLabels(SALON, 4);
  eq('★★★ ラビリンス様（店舗6）の4回の時刻', labels, ['09:42', '15:42', '21:42', '03:42']);
  eq('★★ 1日1回なら1つだけ', R.articlePostTimeLabels(SALON, 1), ['15:42']);
  // ★★★ 回数を増やしても、1日1回のときの時刻が必ず含まれる（★ 起点が同じだから）
  eq('★★★ 回数を増やしても元の時刻を含む', labels.includes(R.articlePostTimeLabels(SALON, 1)[0]), true);
  eq('★ 2回でも含む', R.articlePostTimeLabels(SALON, 2).includes('15:42'), true);
}

console.log('\n── 3. ★★★ 出すか出さないか ──');
const base = { now: at('2026-09-05T12:00:00+09:00'), salonId: SALON, timesPerDay: 4, targetCount: 3, postedToday: 0, rotationIndex: 0 };
const call = (o) => R.shouldPostArticle(Object.assign({}, base, o));

// ★ 数えられていない × 3。★ 0件と混ぜない
eq('★★★ 本数が読めていなければ unknown', call({ targetCount: null }).reason, 'unknown');
eq('★★★ 出した回数が読めていなければ unknown', call({ postedToday: null }).reason, 'unknown');
eq('★★ 時刻が壊れていれば unknown', call({ now: new Date('こわれてる') }).reason, 'unknown');
// ★ 0本は「無い」とはっきり言う
eq('★★★ 印が0本なら no_targets（unknown と分ける）', call({ targetCount: 0 }).reason, 'no_targets');
eq('★★ 回数の設定が変なら bad_times', call({ timesPerDay: 99 }).reason, 'bad_times');

{
  // ★ その店の1本目の時刻の前後で確かめる
  const mins = R.articlePostMinutes(SALON, 4);
  const dayStart = Date.parse('2026-09-05T06:00:00+09:00');
  const firstDue = dayStart + mins[0] * 60000;
  eq('★★★ 1本目の時刻の1分前は not_yet',
     R.shouldPostArticle(Object.assign({}, base, { now: new Date(firstDue - 60000) })).reason, 'not_yet');
  const okNow = R.shouldPostArticle(Object.assign({}, base, { now: new Date(firstDue) }));
  eq('★★★ 1本目の時刻ちょうどで出す', okNow.post, true);
  eq('★ 何本目かを返す', okNow.nth, 1);
  eq('★ どのテンプレートかを返す', okNow.index, 0);
  eq('★★ not_yet のときも次の時刻を返す（画面に出せる）',
     typeof R.shouldPostArticle(Object.assign({}, base, { now: new Date(firstDue - 60000) })).dueAtISO, 'string');
}

// ★ 出しきった
eq('★★★ 4回出したら done_today', call({ postedToday: 4, now: at('2026-09-05T23:00:00+09:00') }).reason, 'done_today');
eq('★★ 5回（数え間違い）でも done_today', call({ postedToday: 5 }).reason, 'done_today');

console.log('\n── 3-2. ★★★ 手で出したぶんも数える ──');
// ★ 「1日4回まで。手で出したぶんも数えます」——説明が1つで済む形
{
  // ★★★ 「23:59 なら4本目も過ぎている」は【間違い】だった（2026-09-05）。
  //   ★ 区切りが朝6時なので、この店舗の4本目は 03:42（翌暦日・同じ営業日）。
  //   ★ 暦の日で考えると外す。★ 時刻は【計算した予定】から取ること。
  const mins = R.articlePostMinutes(SALON, 4);
  const dayStart = Date.parse('2026-09-05T06:00:00+09:00');
  const past = (i) => new Date(dayStart + mins[i] * 60000);
  eq('★ 0回なら出す（1本目の時刻を過ぎている）',
     R.shouldPostArticle(Object.assign({}, base, { now: past(0), postedToday: 0 })).post, true);
  eq('★ 3回なら まだ出す（4本目の時刻を過ぎている）',
     R.shouldPostArticle(Object.assign({}, base, { now: past(3), postedToday: 3 })).post, true);
  eq('★★★ 手動を含めて4回なら出さない',
     R.shouldPostArticle(Object.assign({}, base, { now: past(3), postedToday: 4 })).reason, 'done_today');
  // ★★ 4本目は翌暦日の 03:42 だが、営業日はまだ 09-05
  eq('★★★ 4本目の営業日は 09-05 のまま',
     R.shouldPostArticle(Object.assign({}, base, { now: past(3), postedToday: 3 })).dayKey, '2026-09-05');
}

console.log('\n── 4. ローテの位置 ──');
{
  const mins = R.articlePostMinutes(SALON, 4);
  const late = new Date(Date.parse('2026-09-05T06:00:00+09:00') + mins[0] * 60000);   // ★ 1本目の時刻ちょうど
  const idx = (i, n) => R.shouldPostArticle(Object.assign({}, base, { now: late, rotationIndex: i, targetCount: n })).index;
  eq('0本目', idx(0, 3), 0);
  eq('2本目', idx(2, 3), 2);
  eq('★★ 本数を超えたら先頭へ戻る', idx(3, 3), 0);
  eq('★★ うんと先でも戻る', idx(100, 3), 1);
  eq('★★★ 本数が減っても外に出ない', idx(9, 2), 1);
  eq('★ マイナスでも外に出ない', idx(-1, 3), 2);
  eq('★ 位置が無ければ0本目', idx(null, 3), 0);
}

console.log('\n── 5. 一巡の説明（店舗様の言葉）──');
eq('★★ 数えられていなければ何も言わない', R.rotationCycleMessage(null, 4), '');
eq('★★★ 0本なら、そう言う', /まだありません/.test(R.rotationCycleMessage(0, 4)), true);
eq('★ 12本を1日4回なら3日', /3日/.test(R.rotationCycleMessage(12, 4)), true);
eq('★ 10本を1日4回なら2.5日', /2\.5日/.test(R.rotationCycleMessage(10, 4)), true);
eq('★★ 本数が回数より少なければ「1日に何回まわるか」を言う', /1日に/.test(R.rotationCycleMessage(2, 4)), true);
eq('★ 回数の設定が変なら何も言わない', R.rotationCycleMessage(5, 99), '');
eq('★★★ 説明に「★」を混ぜない',
   [R.rotationCycleMessage(0, 4), R.rotationCycleMessage(12, 4), R.rotationCycleMessage(2, 4)]
     .some((t) => t.indexOf('★') >= 0), false);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
