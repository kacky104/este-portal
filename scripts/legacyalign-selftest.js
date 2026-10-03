// 以前のバッジ・改行なしの紹介文を今の決まりに揃える（src/lib/legacyAlign.ts）の自己点検（第1125便・2026-10-03）。
//
// ★★★ ここで危ないのは【店舗様のものを壊すこと】。
//   ・今あるバッジを勝手に消す（外してよいのは、6個に収めるための外見・タイプだけ）
//   ・紹介文の文字を変える（入れてよいのは改行だけ）
//   ★ この2つを点検で固定する。
//
//   使い方:  npm run check:legacyalign

const path = require('path');
const L = require(path.join(__dirname, '..', '_tmpcheck', 'legacyAlign.js'));
const B = require(path.join(__dirname, '..', '_tmpcheck', 'therapistBadges.js'));
const P = require(path.join(__dirname, '..', '_tmpcheck', 'therapistBadgePrompt.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const cat = (b) => B.getBadgeCategory(b);

console.log('── 1. 対象の店 ──');
eq('★★★ 揃えてよい店はアイリス(3)と AROMA-May(12) だけ', L.LEGACY_ALIGN_SALON_IDS, [3, 12]);

console.log('── 2. バッジ: 触らない場合 ──');
eq('★★★ 空は触らない（自動の口の仕事）', L.alignLegacyBadges(100, []).changed, false);
eq('★ null も触らない', L.alignLegacyBadges(100, null).changed, false);
{
  const r = L.alignLegacyBadges(100, ['経験者', 'キレイ', '癒し系', '施術上手']);
  eq('★ 雰囲気もスキルもあれば変えない', [r.changed, r.after], [false, ['経験者', 'キレイ', '癒し系', '施術上手']]);
}

console.log('── 3. バッジ: 足す ──');
for (const id of [49, 187, 322, 656]) {
  const r = L.alignLegacyBadges(id, ['清楚', 'モデル系', '高身長']);
  eq(`★★★ id ${id}: くじは自動の口と同じ語`, r.added, [P.pickMoodBadge(id), P.pickSkillBadge(id)]);
  eq(`★ id ${id}: 今あるバッジは全部残る`, ['清楚', 'モデル系', '高身長'].filter((b) => !r.after.includes(b)), []);
  eq(`★ id ${id}: 保存の形（カテゴリ順・6個以内）`, r.after, B.sanitizeBadges(r.after));
  eq(`★★ id ${id}: もう一度流しても変わらない`, L.alignLegacyBadges(id, r.after).changed, false);
}
{
  const r = L.alignLegacyBadges(49, ['清楚', 'モデル系', '丁寧な施術', '高身長', '美脚']);
  eq('★ スキルがあれば雰囲気だけ足す', [r.added.length, cat(r.added[0]), r.dropped, r.after.length], [1, 'mood', [], 6]);
}
{
  const r = L.alignLegacyBadges(322, ['経験者', 'キレイ', 'かわいい', 'モデル系', '美脚', '癒し系']);
  eq('★ 6個で雰囲気あり・スキルなし → 外見の後ろ（美脚）を外してスキルを足す', [r.dropped, r.added.map(cat), r.after.length], [['美脚'], ['skill'], 6]);
  eq('★★★ 経験・キャリアは残す', r.after.includes('経験者'), true);
}
{
  const r = L.alignLegacyBadges(7, ['清楚', 'キレイ', 'スレンダー', '美脚', '低身長', '巨乳']);
  eq('★★ 外すのは数値で決まらない外見から（低身長・巨乳は残る）', [r.dropped, r.after.includes('低身長'), r.after.includes('巨乳')], [['美脚', 'スレンダー'], true, true]);
  eq('★ 雰囲気とスキルが1つずつ入る', [r.after.filter((b) => cat(b) === 'mood').length, r.after.filter((b) => cat(b) === 'skill').length, r.after.length], [1, 1, 6]);
}
{
  const r = L.alignLegacyBadges(7, ['プレミア', '指名多数', '経験者', 'ベテラン', 'OL', '低身長']);
  eq('★ 外見が数値の語しか無ければ、それを外して1つ足し、残りは足さない', [r.dropped, r.added.length, r.skipped.length, r.after.length], [['低身長'], 1, 1, 6]);
  eq('★★★ ランク・経験は1つも消えない', ['プレミア', '指名多数', '経験者', 'ベテラン', 'OL'].filter((b) => !r.after.includes(b)), []);
}
{
  const r = L.alignLegacyBadges(7, ['NO.1', 'プレミア', '指名多数', '経験者', 'ベテラン', 'OL']);
  eq('★★★ 外せる外見が無ければ何も変えない（黙って消さない）', [r.changed, r.after, r.skipped.length], [false, ['NO.1', 'プレミア', '指名多数', '経験者', 'ベテラン', 'OL'], 2]);
}
{
  // どの id でも: 消えるのは外見だけ・足すのは雰囲気とスキルだけ
  let bad = 0;
  for (let id = 1; id <= 700; id++) {
    const base = B.sanitizeBadges(['未経験', '女子大生', 'アイドル系', 'かわいい', 'スレンダー', '明るい', '美脚'].slice(id % 3));
    const r = L.alignLegacyBadges(id, base);
    if (r.dropped.some((b) => cat(b) !== 'look')) bad++;
    if (r.added.some((b) => cat(b) !== 'mood' && cat(b) !== 'skill')) bad++;
    if (r.after.length > B.MAX_BADGES) bad++;
    if (base.some((b) => !r.after.includes(b) && !r.dropped.includes(b))) bad++;
  }
  eq('★★★ id 1〜700: 外すのは外見だけ・足すのは雰囲気とスキルだけ・6個以内', bad, 0);
}

console.log('── 4. 紹介文: 文に分ける ──');
const T1 = '整った綺麗な顔立ちに自然と惹かれる愛嬌、落ち着いたお姉さんらしい雰囲気で、「こんな年上の彼女がいたら」と思わせてくれるセラピスト。スラリと美しいモデル体型で、選んで正解だったと会った瞬間に確信できるはず。優しく丁寧な施術に身を委ねれば時間が過ぎるのも忘れ、帰りたくない気持ちに変わっていきます。綺麗さと心まで包み込む癒しを兼ね備えた一人です。';
const T2 = '初めて会うと「スタイル良っ！可愛い！」と思わず声が出てしまう、スラリとしたスタイルに施術着がよく似合うセラピスト。本当の魅力はそこからです。とにかく明るい。話していると元気が出ます！！ぜひ会いに来てください♪お待ちしています。';
eq('★ 文の数（T1）', L.splitSentences(T1).length, 4);
eq('★★ かっこの中の ！ では切らない・！！ と ♪ は1文の終わり（T2）', L.splitSentences(T2).map((s) => s.slice(-6)),
   ['セラピスト。', 'こからです。', 'かく明るい。', 'が出ます！！', 'てください♪', 'しています。']);
eq('★★★ つなげば元の文章に戻る', [L.splitSentences(T1).join('') === T1, L.splitSentences(T2).join('') === T2], [true, true]);
eq('★ 終わりに記号が無い文も落とさない', L.splitSentences('一つめ。二つめ').length, 2);
eq('★ 絵文字が続くときは絵文字までが1文', L.splitSentences('楽しみです！✨次の文。'), ['楽しみです！✨', '次の文。']);
eq('★ 「。」のあとの ☆ や …、絵文字2つも同じ文に入る', L.splitSentences('一つめ。☆二つめ！…三つめ♪✨💕四つめ。'), ['一つめ。☆', '二つめ！…', '三つめ♪✨💕', '四つめ。']);
eq('★ かっこが閉じた直後では切らない（「…！」と続く文）', L.splitSentences('「可愛い！」と声が出ます。次の文。'), ['「可愛い！」と声が出ます。', '次の文。']);

console.log('── 5. 紹介文: 段落に分ける ──');
const S = (n, len) => Array.from({ length: n }, () => 'あ'.repeat(len - 1) + '。');
eq('★ 3文以下は分けない', [1, 2, 3].map((n) => L.paragraphSizes(S(n, 10))), [[1], [2], [3]]);
eq('★ 4文 → 2+2', L.paragraphSizes(S(4, 10)), [2, 2]);
eq('★ 5文（同じ長さ）→ 2+3（前を短く）', L.paragraphSizes(S(5, 10)), [2, 3]);
eq('★ 6〜9文 → 3段落', [6, 7, 8, 9].map((n) => L.paragraphSizes(S(n, 10)).length), [3, 3, 3, 3]);
eq('★ 10文 → 4段落', L.paragraphSizes(S(10, 10)).length, 4);
eq('★★ どの文の数でも1段落は2〜3文', (() => {
  let bad = 0;
  for (let n = 4; n <= 40; n++) {
    const z = L.paragraphSizes(S(n, 5 + (n % 7)));
    if (z.reduce((a, b) => a + b, 0) !== n || z.some((x) => x < 2 || x > 3)) bad++;
  }
  return bad;
})(), 0);
eq('★ 長さで決める: 前の2文が長ければ 2+3', L.paragraphSizes(['あ'.repeat(60), 'あ'.repeat(60), 'あ'.repeat(10), 'あ'.repeat(10), 'あ'.repeat(10)]), [2, 3]);
eq('★ 長さで決める: 後ろの2文が長ければ 3+2', L.paragraphSizes(['あ'.repeat(10), 'あ'.repeat(10), 'あ'.repeat(10), 'あ'.repeat(60), 'あ'.repeat(60)]), [3, 2]);

console.log('── 6. 紹介文: 全体 ──');
{
  const r = L.alignLegacyParagraphs(T1);
  eq('★ T1 は2段落（段落の間は1行あける）', [r.changed, r.sizes, r.after.split('\n\n').length, /\n{3,}/.test(r.after)], [true, [2, 2], 2, false]);
  eq('★★★ 文字は1字も変えない（改行を除けば元と同じ）', r.after.replace(/\n/g, ''), T1);
  eq('★★ もう一度流しても変わらない', [L.alignLegacyParagraphs(r.after).changed, L.alignLegacyParagraphs(r.after).reason], [false, '改行あり']);
}
{
  const r = L.alignLegacyParagraphs(T2);
  eq('★ T2 は6文 → 3段落', [r.sentences, r.sizes], [6, [2, 2, 2]]);
  eq('★★★ T2 も文字は変えない', r.after.replace(/\n/g, ''), T2);
}
eq('★★★ 改行がある文章は触らない', (() => { const t = '一行め。\n二行め。三つめ。四つめ。五つめ。'; const r = L.alignLegacyParagraphs(t); return [r.changed, r.after === t, r.reason]; })(), [false, true, '改行あり']);
eq('★ 空・null は触らない', [L.alignLegacyParagraphs('').reason, L.alignLegacyParagraphs(null).reason, L.alignLegacyParagraphs('  ').reason], ['空', '空', '空']);
eq('★ 3文以下は触らない', (() => { const r = L.alignLegacyParagraphs('一つめ。二つめ。三つめ。'); return [r.changed, r.reason]; })(), [false, '文が3つ以下']);
eq('★ 文の間の空白は段落の切れ目では落とす・段落の中では残す', L.alignLegacyParagraphs('一つめ。 二つめ。 三つめ。 四つめ。').after, '一つめ。 二つめ。\n\n三つめ。 四つめ。');
eq('★ 前後の空白・末尾の改行だけの文章は「改行なし」として扱う', L.alignLegacyParagraphs('一つめ。二つめ。三つめ。四つめ。\n').after, '一つめ。二つめ。\n\n三つめ。四つめ。');

console.log(fail === 0 ? '\n全部 ok' : `\n★★★ NG ${fail} 件`);
process.exit(fail === 0 ? 0 : 1);
