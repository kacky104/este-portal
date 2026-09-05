// 枠の状態を店舗様の言葉にする（src/lib/articleSlotAdvice.ts）の自己点検（第158便・2026-09-05）。
//
// ★★★ ここで危ないのは:
//   ① 「分からない」を「使える」へ倒す → ★ 送ってから「出ていません」になる（2026-09-05 に実際に起きた）
//   ② 「記事が無い」と「読めていない」を混ぜる → ★ 店舗様が駅ちかを触りに行く理由を間違える
//   ③ 非表示の枠を「使えない」にしてしまう → ★ 送ること自体はできる。決めるのは店舗様
//   ④ 読めた枠だけ返す → ★ 画面が枠を見失う（★ 必ず5つ返す）
//
//   使い方:  npm run check:articleslot

const path = require('path');
const A = require(path.join(__dirname, '..', '_tmpcheck', 'articleSlotAdvice.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const row = (o) => Object.assign(
  { slot: 1, label: '速報NEWS', hasArticle: true, visible: true, title: 'いまの記事', updatedAt: '2026-09-05 13:40:43' },
  o || {},
);

console.log('── 0. ★★★ 読めていないときに「使える」と言わない ──');
{
  const a = A.articleSlotAdvice(2, null);
  eq('★★★ 状態は「分からない」', a.state, 'unknown');
  eq('★★★ 送ってよいとは言わない', a.canPost, false);
  eq('★ 枠の名前は決め打ちのラベルで埋める', a.label, '新人速報');
  eq('★★ 「記事がありません」と書かない（読めていないだけ）', /記事がありません|記事が無い/.test(a.note), false);
  eq('★ 何をすれば分かるかを書く', /読む/.test(a.note), true);
}
eq('★★ undefined も同じ（★ null と分けない）', A.articleSlotAdvice(2, undefined).state, 'unknown');

console.log('\n── 1. ★★★ 記事が無い枠 ──');
{
  const a = A.articleSlotAdvice(2, row({ slot: 2, label: '新人速報', hasArticle: false, visible: null, title: '' }));
  eq('★★★ 状態は「カラ」（★ 「分からない」ではない。読めている）', a.state, 'empty');
  eq('★★★ ここへは送れない（上書きするものが無い）', a.canPost, false);
  eq('★ 相手の言葉のカテゴリー名を使う', a.label, '新人速報');
  eq('★★ 何をすれば使えるようになるかを書く', /駅ちかの管理画面/.test(a.note), true);
  eq('★ いまのタイトルは空', a.currentTitle, '');
}

console.log('\n── 2. ★★★ 非表示の枠 ──');
{
  const a = A.articleSlotAdvice(5, row({ slot: 5, label: '緊急出勤速報', visible: false, title: 'さら緊急出勤' }));
  eq('★★★ 状態は「出ない」', a.state, 'hidden');
  eq('★★★ それでも送ること自体はできる（決めるのは店舗様）', a.canPost, true);
  eq('★★★ 公開ページに出ないことを必ず書く', /公開ページには出ません/.test(a.note), true);
  eq('★★★ フクエスからは切り替えないと書く', /フクエスからは切り替えません/.test(a.note), true);
  eq('★ いまの記事のタイトルを持つ', a.currentTitle, 'さら緊急出勤');
}

console.log('\n── 3. ★★★ 公開状態が読めなかった枠 ──');
{
  const a = A.articleSlotAdvice(1, row({ visible: null }));
  eq('★★★ 「出ている」と言い切らない', a.state, 'unknown');
  eq('★★ 送ること自体はできる', a.canPost, true);
  eq('★★★ 「非表示です」とも言わない（0と不明を混ぜない）', /非表示です/.test(a.note), false);
  eq('★ 分からないと書く', /分かりません/.test(a.note), true);
}

console.log('\n── 4. 使える枠 ──');
{
  const a = A.articleSlotAdvice(1, row({ title: '本日も営業中' }));
  eq('★ 使える', [a.state, a.canPost], ['usable', true]);
  eq('★★★ 「置き換わる」ことを必ず書く（★ 前の記事は消える）', /置き換わります/.test(a.note), true);
  eq('★ いま入っている記事の名前を出す', a.note.indexOf('本日も営業中') >= 0, true);
}
eq('★★ タイトルが空でも「置き換わる」は書く',
   /置き換わります/.test(A.articleSlotAdvice(1, row({ title: '' })).note), true);

console.log('\n── 5. ★★★ 必ず5つ返す ──');
{
  const all = A.articleSlotAdviceAll([row({ slot: 1 }), row({ slot: 4, label: 'イベント速報' })]);
  eq('★★★ 読めた枠が2つでも5つ返す', all.length, 5);
  eq('★★★ 並びは 1〜5 で固定', all.map((a) => a.slot), [1, 2, 3, 4, 5]);
  eq('★★ 写しに無い枠は「分からない」', all.map((a) => a.state), ['usable', 'unknown', 'unknown', 'usable', 'unknown']);
  eq('★ 写しに無い枠も名前は出る', all.map((a) => a.label),
     ['速報NEWS', '新人速報', '激アツ割引情報', 'イベント速報', '緊急出勤速報']);
}
eq('★★ 空でも5つ返す', A.articleSlotAdviceAll([]).length, 5);
eq('★★ null でも5つ返す', A.articleSlotAdviceAll(null).length, 5);
eq('★ 配列でなくても落ちない', A.articleSlotAdviceAll('x').length, 5);

console.log('\n── 6. ★★★ 画面の上の1行 ──');
eq('★★★ まだ読んでいないときに数を言わない',
   A.articleSlotSummary(null), '駅ちかの新着情報をまだ読み取っていません。「いまの状態を読む」を押すと、どの枠が使えるか分かります。');
eq('★★ 空配列も同じ（★ 「0枠使えます」と言わない）',
   A.articleSlotSummary([]).indexOf('まだ読み取っていません') >= 0, true);
{
  // ★ 2026-09-05 のラビリンス様の実際の姿
  const real = [
    row({ slot: 1, label: '速報NEWS', title: '本日も営業中' }),
    row({ slot: 2, label: '新人速報', hasArticle: false, visible: null, title: '' }),
    row({ slot: 3, label: '激アツ割引情報', title: '割引中' }),
    row({ slot: 4, label: 'イベント速報', title: '昼割のお知らせ' }),
    row({ slot: 5, label: '緊急出勤速報', hasArticle: false, visible: null, title: '' }),
  ];
  eq('★ 実際の姿（使える3・カラ2）',
     A.articleSlotSummary(real), 'いますぐ使える枠は 3 つです。まだ記事が無い枠が 2 つあります（駅ちかで1本作ると使えます）。');
  eq('★★ 非表示が無ければ、非表示の話をしない', /非表示/.test(A.articleSlotSummary(real)), false);
}
{
  const withHidden = [row({ slot: 1 }), row({ slot: 2, label: '新人速報', visible: false })];
  eq('★★ 非表示があれば必ず言う', /非表示の枠が 1 つ/.test(A.articleSlotSummary(withHidden)), true);
}

console.log('\n── 7. ★ 文言に内部の記号を混ぜない ──');
{
  const all = [null, ...[1, 2, 3, 4, 5].map((s) => row({ slot: s }))]
    .flatMap((r) => [true, false].flatMap((h) => [true, false, null].map((v) =>
      A.articleSlotAdvice(1, r === null ? null : Object.assign({}, r, { hasArticle: h, visible: v })))));
  eq('★★ 文言に「★」を混ぜない', all.filter((a) => a.note.indexOf('★') >= 0 || a.headline.indexOf('★') >= 0).length, 0);
  eq('★ 英語の内部の状態名を出さない',
     all.filter((a) => /usable|hidden|empty|unknown|null|undefined/.test(a.note + a.headline)).length, 0);
  eq('★ 空の文言を返さない', all.filter((a) => !a.note.trim() || !a.headline.trim()).length, 0);
  eq('★★ 「枠1」のような内部の言い方をしない', all.filter((a) => /枠\d/.test(a.note + a.headline)).length, 0);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
