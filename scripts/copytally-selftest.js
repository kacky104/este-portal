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
// ★ 第122便で文言を強めたので、点検も追随させた（★ 片方だけ古くならないように）
eq('★★ 「Aなのに（ながら）B」の対比を戒めていること',
   C.SYSTEM_PROMPT.includes('「Aなのに（ながら）B」の対比'), true);
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

console.log('\n── 8. ★★★ 第122便: 体型の要約と、キャッチのサイズ表現 ──');
// ★★★ 戒めた語の代わりに次の語が入るのを止める（第121便で実際に起きた）
eq('★★★ BODY_SUMMARY_WORDS が system に載っている',
   C.BODY_SUMMARY_WORDS.filter((w) => !C.SYSTEM_PROMPT.includes(w)), []);
eq('★★ 「体型を【一言でまとめない】」が system に載っている',
   C.SYSTEM_PROMPT.includes('体型を【一言でまとめない】'), true);
// ★ BODY_SUMMARY_WORDS はお手本に無くても出てくる語。★ BORROWED_PHRASES と混ぜない
eq('★ BODY_SUMMARY_WORDS と BORROWED_PHRASES は重ならない',
   C.BODY_SUMMARY_WORDS.filter((w) => C.BORROWED_PHRASES.some((p) => p.includes(w) || w.includes(p))), []);
eq('★ WATCHED_WORDS は3つの一覧を全部含む',
   [...C.CLICHE_WORDS, ...C.BORROWED_PHRASES, ...C.BODY_SUMMARY_WORDS]
     .filter((w) => !C.WATCHED_WORDS.includes(w)), []);
// ★★★ 実際に出た言い回しを【全部つかまえる】こと（2026-09-03 20:57 と 22:09 の試し打ち）
//   ★ 語尾を変えて逃げられないよう、一覧の語は短くしてある（第123便）
eq('★★★ 実際に出た体型の要約を全部つかまえる',
   ['手足がすらりと長く見えるバランスの良いスタイル',
    '華奢なのにバランスの取れたスタイル',
    '全身で織りなすバランスの美しさは一度会えば忘れられません',
    '思わず目を奪われる女性らしい曲線がしっかりと刻まれています',
    '細身ながら女性らしい曲線を持つシルエットが目を惹きます',
    'しっかりとメリハリのあるボディラインが魅力的',
    '細身なのに女性らしいラインがしっかりあるスタイル']
     .filter((t) => C.findForbiddenInText(t).length === 0), []);

console.log('\n── 8-3. ★★★ 第123便: 使わないと決めた語をコードで弾く ──');
// ★★★ CLICHE_WORDS は【弾かない】。★ 「確かなときだけ使ってよい」語（第114便の判断）
//   ★ 禁止すると、本当にスレンダーな人から語が消えて、こんどは逆に嘘になる
eq('★★★ CLICHE_WORDS は禁止語に入れない',
   C.CLICHE_WORDS.filter((w) => C.FORBIDDEN_IN_TEXT.includes(w)), []);
eq('★★ 透明感・色白は弾かない（確かなら使ってよい）',
   [C.findForbiddenInText('透明感のある雰囲気'), C.findForbiddenInText('色白の肌')], [[], []]);
// ★ 禁止語＝お手本由来＋体型の要約の2つだけ
eq('★ FORBIDDEN_IN_TEXT は2つの一覧の合計',
   C.FORBIDDEN_IN_TEXT.length, C.BORROWED_PHRASES.length + C.BODY_SUMMARY_WORDS.length);
// ★★ 入っていた語を【そのまま返す】。★ 黙って直さない
// ★ 返る順は FORBIDDEN_IN_TEXT の並び（お手本由来 → 体型の要約）。★ 並びを固定する
eq('★★ 入っていた語を名指しで返す',
   C.findForbiddenInText('バランスの取れた体で、女性らしい曲線が魅力'),
   ['バランスの', '女性らしい曲線']);
// ★★★ 普通の文を誤って弾かない（弾きすぎると作り直しが無駄に走る）
eq('★★★ 具体的に書かれた文は通す',
   ['ふわりと結んだ髪から覗く繊細な首筋、シアーな袖が揺れるたびに見え隠れする華奢な肩。',
    '肩まで流れる艶やかな黒髪が印象的で、身長166cmのすらりとした体型です。',
    '胸元のカーブと華奢なネックレス、そして柔らかく巻かれた髪。']
     .map((t) => C.findForbiddenInText(t)), [[], [], []]);
eq('★ 空文字は何も返さない', C.findForbiddenInText(''), []);
// ★ 空白・改行をまたいでも見つける（字数の数え方と揃える）
eq('★★ 空白をまたいでも見つける', C.findForbiddenInText('バランス の 取れた'), ['バランスの']);

console.log('\n── 8-2. キャッチのサイズ表現 ──');
// ★ 第122便でカッキーさんが決めた: キャッチには入れない（紹介文は可）
eq('★★★ カップ表現を見つける',
   ['小柄な体に溢れる笑顔とEカップ', 'Ｅカップの魅力', 'E カップが目を引く'].map(C.hasSizeExpression),
   [true, true, true]);
eq('★★ スリーサイズ・身長を見つける',
   ['T160の美脚', 'B90の存在感', '149cmの小さな体', '149センチの笑顔'].map(C.hasSizeExpression),
   [true, true, true, true]);
eq('★★ 「巨乳」なども見つける', ['巨乳の癒し系', 'バスト自慢'].map(C.hasSizeExpression), [true, true]);
// ★★★ 普通のキャッチを誤って弾かないこと（弾きすぎると作り直しが無駄に走る）
eq('★★★ 普通のキャッチは通す',
   ['真っ直ぐな瞳で見つめられる瞬間', '胸元のネックレスに視線が泳ぐ',
    '照れ笑いから始まる絶妙な距離感', 'クールビューティなモデル体型'].map(C.hasSizeExpression),
   [false, false, false, false]);
eq('★ 空文字は false', C.hasSizeExpression(''), false);

console.log('\n── 9. ★★★ 戒めた語を数える（countWatchedWords）──');
// ★★★ tallyPhrases が取りこぼした形。★ 「バランスの良い」と「バランスの取れた」は別の語
const B3 = [
  '手足がすらりと長く見えるバランスの良いスタイル',
  '華奢なのにバランスの取れたスタイル',
  'バランスの取れた曲線的なスタイルは存在感抜群',
];
const w = T.countWatchedWords(B3, ['バランスの良い', 'バランスの取れた', 'スレンダー']);
eq('★★★ 語ごとに何人に出たかを数える',
   w.出た.map((x) => [x.phrase, x.count]), [['バランスの取れた', 2], ['バランスの良い', 1]]);
// ★★★ 出なかった語も返す。★ 一覧が既知なので「0人」と言い切れる（行が無い＝0人ではない）
eq('★★★ 出なかった語は名指しで返る', w.出なかった, ['スレンダー']);
eq('★ 母数は3', w.母数, 3);
// ★ 1人が2回使っても1（tallyPhrases と数え方を揃える）
eq('★★ 1人が2回使っても1と数える',
   T.countWatchedWords(['スレンダーでスレンダー'], ['スレンダー']).出た[0].count, 1);
eq('★ 空の人は母数に入らない', T.countWatchedWords([null, ''], ['スレンダー']).母数, 0);
eq('★ 空の語は数えない', T.countWatchedWords(['あいうえお'], ['']).出た, []);
// ★★ 実際の戒めの一覧をそのまま当てられること（型の食い違いが無い）
// ★★ 第123便で 'バランスの' 1語にまとめたので、3人とも同じ語として数えられる
//   ★ これが第122便で取りこぼしていたもの（語尾違いを別々の語として数えていた）
eq('★★ WATCHED_WORDS をそのまま渡せる',
   T.countWatchedWords(B3, C.WATCHED_WORDS).出た.map((x) => [x.phrase, x.count]),
   [['バランスの', 3]]);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
