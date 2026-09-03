// 紹介文の頻出フレーズを数える（src/lib/therapistCopyTally.ts）の自己点検（第121便・2026-09-03）。
//
// ★★★ ここで守りたいのは2つ。
//   ① BORROWED_PHRASES が【本当にお手本の中にある】こと。
//      ★ お手本を差し替えた日に、戒めだけ古くなるのを防ぐ（第114便の CLICHE_WORDS と同じ筋）。
//   ② 数え方が【毎回同じ結果】を返すこと。★ 数え直しがブレると「直ったか」が分からない。
//
//   使い方:  npm run check:copytally

const path = require('path');
const T = require(path.join(__dirname, '..', '_tmpcheck', 'therapistCopyTally.js'));
const C = require(path.join(__dirname, '..', '_tmpcheck', 'therapistCopyPrompt.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 戒めがお手本と食い違っていないこと（いちばん大事）──');
// ★★★ BORROWED_PHRASES は「お手本の中にある言い回し」。★ 無い語を戒めても意味が無い
const notInSamples = C.BORROWED_PHRASES.filter((p) => !C.SYSTEM_PROMPT.includes(p));
eq('★★★ BORROWED_PHRASES は全部お手本の中にある', notInSamples, []);
// ★★ 戒めが system プロンプトに載っていること（定数を作っただけで使い忘れない）
eq('★★ CLICHE_WORDS が system に載っている',
   C.CLICHE_WORDS.filter((w) => !C.SYSTEM_PROMPT.includes(w)), []);
eq('★★ 「言い換えて回避しない」が system に載っている',
   C.SYSTEM_PROMPT.includes('言い換えて回避しない'), true);
eq('★★ 「対比でまとめない」が system に載っている',
   C.SYSTEM_PROMPT.includes('の対比でまとめない'), true);
// ★ 2つの一覧は役割が違う。★ 同じ語を両方に入れない（どちらを直すか迷わないため）
eq('★ CLICHE_WORDS と BORROWED_PHRASES は重ならない',
   C.BORROWED_PHRASES.filter((p) => C.CLICHE_WORDS.includes(p)), []);
eq('★ BORROWED_PHRASES は空でない', C.BORROWED_PHRASES.length > 0, true);

console.log('\n── 2. ★★★ 実際に出た偏り（2026-09-03・AROMAMay 様の試し打ち3人）──');
// ★ 3人の紹介文から、問題の一文だけを取ったもの（実データ）
const A3 = [
  'スレンダーなのに女性らしいラインがしっかりあるスタイルも見逃せないポイント。',
  '細身ながら女性らしいラインがしっかりあるスタイルで、立ち姿の美しさは思わず見惚れてしまうほど。',
  '小柄ながら女性らしい曲線美を備えたスタイルで、程よい距離感で接してくれる落ち着きも魅力。',
];
const r3 = T.tallyPhrases(A3);
eq('★ 母数は3', r3.母数, 3);
// ★★★ これが見つけたかったもの。★ 2人に出ている＝並ぶ前に気づける
eq('★★★ お手本由来の言い回しが1位に出る',
   [r3.頻出[0].phrase, r3.頻出[0].count, r3.頻出[0].ratio],
   ['女性らしいラインがしっかりあるスタイル', 2, 67]);
// ★ 3人目は「曲線美」で言い回しが違うので3人には届かない（★ 揃っていないものを揃ったと言わない）
eq('★ 全員に共通する言い回しは無い', T.allSharedPhrases(r3), []);

console.log('\n── 3. 数え方 ──');
const same = ['今日はとても良い天気ですね', '今日はとても良い天気だったよ', '今日はとても良い天気らしい'];
eq('★★ 全員に出た言い回しは名指しで返る', T.allSharedPhrases(T.tallyPhrases(same)), ['今日はとても良い天気']);
// ★★★ 1人の中で何回出ても1。★ 見たいのは「店の全員に並ぶこと」であって文章の癖ではない
eq('★★★ 1人が2回使っても1と数える',
   T.tallyPhrases(['あいうえおかきくけこ、そしてあいうえおかきくけこ。']).頻出, []);
eq('★ 2人が1回ずつ使えば2と数える',
   T.tallyPhrases(['あいうえおかきくけこ。', 'それからあいうえおかきくけこ。']).頻出[0].count, 2);
// ★★ 空白・改行は字数と同じ扱いで落とす（isLongEnough と揃える）
eq('★★ 空白をまたいでも同じ言い回しと数える',
   T.tallyPhrases(['あいうえお かきくけこ', 'あいうえお\nかきくけこ']).頻出[0].phrase, 'あいうえおかきくけこ');

console.log('\n── 4. ★ 0件と分からないを混ぜない ──');
eq('★ 空の配列は母数0', T.tallyPhrases([]), { 母数: 0, 平均字数: 0, 頻出: [] });
// ★★ null・空文字は【母数に入れない】。★ 入れると平均字数が薄まって嘘になる
eq('★★ null と空文字は母数に入らない', T.tallyPhrases([null, undefined, '', '   ']).母数, 0);
eq('★★ 空の人を混ぜても母数は書けている人だけ',
   T.tallyPhrases(['あいうえおかきくけこ', null, 'あいうえおかきくけこ']).母数, 2);
eq('★ 平均字数は空白を除いて数える', T.tallyPhrases(['あい うえ お']).平均字数, 5);
// ★★★ 1人では「揃っている」と言えない
eq('★★★ 母数1なら共通の言い回しは返さない', T.allSharedPhrases(T.tallyPhrases(['あいうえおかきくけこ'])), []);

console.log('\n── 5. ★★ 包含の吸収 ──');
// ★★ 同じ人数なら長いほうだけ残す（「女性らしいライン」と「〜がしっかりある」を二重に出さない）
const nest = T.tallyPhrases(['あいうえおかきくけこさしすせそ。', 'あいうえおかきくけこさしすせそ！']);
eq('★★ 同じ人数の短い言い回しは長いほうに吸収される',
   nest.頻出.map((x) => x.phrase), ['あいうえおかきくけこさしすせそ']);
// ★★★ 人数が違えば両方残す。★ 別の情報なので黙って消さない
const both = T.tallyPhrases([
  'あいうえおかきくけこさしすせそ',
  'あいうえおかきくけこさしすせそ',
  'あいうえおかきくけこたちつてと',
]);
eq('★★★ 人数が違う言い回しは両方残る',
   both.頻出.map((x) => [x.phrase, x.count]),
   [['あいうえおかきくけこ', 3], ['あいうえおかきくけこさしすせそ', 2]]);

console.log('\n── 6. 調整の効き ──');
eq('★ minCount を上げると落ちる', T.tallyPhrases(A3, { minCount: 3 }).頻出, []);
eq('★ top で件数を絞れる', T.tallyPhrases(A3, { top: 1 }).頻出.length, 1);
// ★ 短い語を拾うと「セラピスト」だらけになるので既定は8
eq('★ minLen を下げると短い言い回しも拾う',
   T.tallyPhrases(['あいうえお', 'あいうえお'], { minLen: 5 }).頻出[0].phrase, 'あいうえお');
eq('★ 既定の minLen では5文字は拾わない', T.tallyPhrases(['あいうえお', 'あいうえお']).頻出, []);
// ★ おかしな指定でも落ちない（maxLen < minLen は minLen に寄せる）
eq('★ maxLen が minLen より小さくても落ちない',
   T.tallyPhrases(['あいうえおかきくけこ', 'あいうえおかきくけこ'], { minLen: 8, maxLen: 2 }).頻出.length > 0, true);
eq('★ minCount 0 を渡しても1未満にならない', T.tallyPhrases(['あいうえおかきくけこ'], { minCount: 0 }).頻出[0].count, 1);

console.log('\n── 7. ★ 毎回同じ結果になること（点検で固定できる形）──');
eq('★★ 同じ入力なら同じ並び',
   JSON.stringify(T.tallyPhrases(A3)) === JSON.stringify(T.tallyPhrases(A3)), true);
// ★ 入力の並びが変わっても結果は変わらない（人の並び順に結果が左右されない）
eq('★★ 入力の順番を変えても同じ結果',
   JSON.stringify(T.tallyPhrases(A3).頻出) === JSON.stringify(T.tallyPhrases([A3[2], A3[0], A3[1]]).頻出), true);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
