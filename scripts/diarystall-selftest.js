// 写メ日記の巡回の見張り（src/lib/diaryStall.ts）の自己点検（第100便）。
//
// ★★★ この点検の芯は2つ。
//   ① 【2本の時計が直列であること】を数で固定する。
//      ★ 両方古いときに2件鳴らしてはいけない。★ 原因は1つ（積んでいない）だから。
//      ★ 2件鳴らすと、運営は relay.sh を見に行く。★ 本当に見るべきは crontab。
//   ② 【第99便の一本線に繋がっていること】を数で固定する。
//      ★ 入口が 'benry' の店を見張ってはいけない（回さないのが正しい状態なので）。
//      ★ 前便の穴は「口ごとに条件を書いた」こと。★ ここでも書かない。
//
//   使い方:  npm run check:diarystall

const s = require(require('path').join(__dirname, '..', '_tmpcheck', 'diaryStall.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const NOW = new Date('2026-09-01T14:00:00Z');            // 23:00 JST（★ 第99便の夜）
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();

const base = (o) => Object.assign({
  provider: 'ekichika', slot: 1,
  diarySource: 'ekichika',
  isEnabled: true, hasConsent: true,
  queuedAt: hoursAgo(0.2),        // 12分前（15分ごとなので正常）
  listedAt: hoursAgo(0.2),
  intervalMin: 15,
  createdAt: hoursAgo(24 * 30),
  now: NOW,
}, o || {});
const kinds = (r) => r.map((f) => f.clock + ':' + f.reason);

console.log('── 1. ★★★ 2本の時計は【直列】。両方古くても1件しか鳴らさない ──');
{
  const 両方古い = s.judgeDiaryStall(base({ queuedAt: hoursAgo(9), listedAt: hoursAgo(9) }));
  eq('★★★ 両方古くても鳴るのは1件', 両方古い.length, 1);
  eq('★★★ 鳴るのは上流（積んだ側）', kinds(両方古い), ['queued:stale']);
  eq('★ 下流（読めた側）は鳴らない', 両方古い.filter((f) => f.clock === 'listed').length, 0);
  eq('★ 次に見る場所が crontab になる', 両方古い[0].hint.indexOf('crontab') > 0, true);
  eq('★ relay.sh を見に行かせない', 両方古い[0].hint.indexOf('relay.sh') >= 0, false);
}
{
  // ★ 積んではいるが読めていない＝relay.sh か ログインの側
  const 読めていない = s.judgeDiaryStall(base({ queuedAt: hoursAgo(0.2), listedAt: hoursAgo(9) }));
  eq('★★ 積んだのは新しく、読めたのが古ければ listed が鳴る', kinds(読めていない), ['listed:stale']);
  eq('★ 次に見る場所が relay.sh になる', 読めていない[0].hint.indexOf('relay.sh') > 0, true);
  eq('★ crontab を見に行かせない', 読めていない[0].hint.indexOf('crontab') >= 0, false);
  eq('★ 文言が「積まれていますが」と断る', 読めていない[0].message.indexOf('積まれていますが') > 0, true);
}
eq('正常なら何も出ない', s.judgeDiaryStall(base()), []);

console.log('\n── 2. ★★★ 第99便の一本線に繋がっていること（入口で見張りを切る）──');
eq('入口が benry なら黙る', s.judgeDiaryStall(base({ diarySource: 'benry', queuedAt: hoursAgo(72), listedAt: hoursAgo(72) })), []);
eq('入口が fukues なら黙る', s.judgeDiaryStall(base({ diarySource: 'fukues', queuedAt: hoursAgo(72), listedAt: hoursAgo(72) })), []);
eq('★ 知らない値でも黙る（既定へ読み替えない）', s.judgeDiaryStall(base({ diarySource: 'EKICHIKA', queuedAt: hoursAgo(72) })), []);
eq('★ 空でも黙る', s.judgeDiaryStall(base({ diarySource: null, queuedAt: hoursAgo(72) })), []);
eq('★ 前後の空白は別の値', s.judgeDiaryStall(base({ diarySource: ' ekichika ', queuedAt: hoursAgo(72) })), []);
eq('★ 入口が ekichika のときだけ鳴る（数で）',
  ['benry', 'ekichika', 'fukues', 'unknown', null]
    .map((v) => s.judgeDiaryStall(base({ diarySource: v, queuedAt: hoursAgo(72), listedAt: hoursAgo(72) })).length)
    .reduce((a, b) => a + b, 0), 1);

console.log('\n── 3. 意図して止めているものを警告にしない ──');
eq('鍵が無効なら黙る', s.judgeDiaryStall(base({ isEnabled: false, queuedAt: hoursAgo(72) })), []);
eq('ご同意が無ければ黙る', s.judgeDiaryStall(base({ hasConsent: false, queuedAt: hoursAgo(72) })), []);
eq('★ 起点が1つも無ければ黙る（分からないことは分からないまま）',
  s.judgeDiaryStall(base({ queuedAt: null, listedAt: null, createdAt: null })), []);
eq('★ 未来の時刻（時計のずれ）では鳴らさない',
  s.judgeDiaryStall(base({ queuedAt: hoursAgo(-5), listedAt: hoursAgo(-5) })), []);

console.log('\n── 4. never と stale を混ぜない ──');
{
  const 一度も = s.judgeDiaryStall(base({ queuedAt: null, listedAt: null, createdAt: hoursAgo(30) }));
  eq('★ 一度も積まれていなければ queued:never', kinds(一度も), ['queued:never']);
  eq('★ 起点は鍵の登録時刻', 一度も[0].sinceISO, hoursAgo(30));
  eq('★ 文言が「まだ一度も」と言う', 一度も[0].message.indexOf('まだ一度も') > 0, true);
  eq('★ 文言が「鍵の登録から」と起点を言う', 一度も[0].message.indexOf('鍵の登録から') > 0, true);
}
{
  const 読めた事なし = s.judgeDiaryStall(base({ queuedAt: hoursAgo(0.2), listedAt: null, createdAt: hoursAgo(30) }));
  eq('★ 積んではいるが一度も読めていなければ listed:never', kinds(読めた事なし), ['listed:never']);
  eq('★ 起点は鍵の登録時刻', 読めた事なし[0].sinceISO, hoursAgo(30));
}
eq('★ never は4通りとも別の文言になる（一緒くたにしない）',
  new Set([
    s.judgeDiaryStall(base({ queuedAt: null, listedAt: null, createdAt: hoursAgo(30) }))[0].message,
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(0.2), listedAt: null, createdAt: hoursAgo(30) }))[0].message,
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(9), listedAt: hoursAgo(9) }))[0].message,
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(0.2), listedAt: hoursAgo(9) }))[0].message,
  ]).size, 4);

console.log('\n── 5. しきい値（間隔から作る）──');
eq('15分なら4時間', s.diaryStallHours(15), 4);
eq('60分なら16時間', s.diaryStallHours(60), 16);
eq('★ 1分でも下限の4時間（過敏にしない）', s.diaryStallHours(1), 4);
eq('★ 空なら15分とみなす', s.diaryStallHours(null), 4);
eq('★ 文字や0は15分とみなす', [s.diaryStallHours(0), s.diaryStallHours(-5)], [4, 4]);
eq('3.9時間では鳴らない', s.judgeDiaryStall(base({ queuedAt: hoursAgo(3.9), listedAt: hoursAgo(3.9) })), []);
eq('4.1時間で鳴る', kinds(s.judgeDiaryStall(base({ queuedAt: hoursAgo(4.1), listedAt: hoursAgo(4.1) }))), ['queued:stale']);
eq('★ 間隔を60分にすると4.1時間では鳴らない',
  s.judgeDiaryStall(base({ intervalMin: 60, queuedAt: hoursAgo(4.1), listedAt: hoursAgo(4.1) })), []);
eq('★ 点検用の hours が優先される',
  kinds(s.judgeDiaryStall(base({ hours: 1, queuedAt: hoursAgo(1.5), listedAt: hoursAgo(1.5) }))), ['queued:stale']);

console.log('\n── 6. ★★ 「起きたこと」と「次にやること」を1つにしない ──');
{
  const all = [
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(9), listedAt: hoursAgo(9) }))[0],
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(0.2), listedAt: hoursAgo(9) }))[0],
    s.judgeDiaryStall(base({ queuedAt: null, listedAt: null, createdAt: hoursAgo(30) }))[0],
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(0.2), listedAt: null, createdAt: hoursAgo(30) }))[0],
  ];
  eq('★ 4通りとも見ている', all.length, 4);
  eq('★ message に「次に見る場所」を混ぜない',
    all.some((f) => /crontab|relay\.sh|import\.log|heartbeat/.test(f.message)), false);
  eq('★ hint は時計ごとに違う（2通り）', new Set(all.map((f) => f.hint)).size, 2);
  eq('★ message に英語の状態名を混ぜない',
    all.some((f) => /never|stale|queued|listed/.test(f.message)), false);
  eq('★ message に内部の記号（★）を混ぜない', all.some((f) => f.message.indexOf('★') >= 0), false);
  eq('★ 経過は切り捨てて言う（実際より長く言わない）',
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(9.9), listedAt: hoursAgo(9.9) }))[0].message.indexOf('9時間') > 0, true);
  eq('★ 48時間を超えたら日で言う',
    s.judgeDiaryStall(base({ queuedAt: hoursAgo(72), listedAt: hoursAgo(72) }))[0].message.indexOf('3日') > 0, true);
  eq('★ 枠が分かる形で言う',
    all.every((f) => f.message.indexOf('駅ちか（枠1）') === 0), true);
}
eq('★ 経過時間そのものも返す（数で見られるように）',
  Math.round(s.judgeDiaryStall(base({ queuedAt: hoursAgo(9), listedAt: hoursAgo(9) }))[0].elapsedHours), 9);
eq('★ しきい値の周の数は importStall と同じ', s.DIARY_STALL_CYCLES, 16);
eq('★ 下限は4時間', s.DIARY_STALL_MIN_HOURS, 4);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
