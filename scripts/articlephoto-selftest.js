// 新着情報の写真の選び方（src/lib/articlePhotoPick.ts）の自己点検（第172便・2026-09-06）。
//
// ★★★ ここで危ないのは:
//   ① 0枚を「1枚目」に倒す      → ★ 選んでいないのに写真が変わる
//   ② 直前と同じ1枚を出す        → ★ 2枚しか選んでいないと2回に1回が同じ＝「壊れて見える」
//   ③ 1枚だけのときに回そうとする → ★ 推しの子を上げ続けたいのに変わってしまう
//   ④ さいころが壊れたときに落ちる → ★ 送信そのものが止まる
//
//   使い方:  npm run check:articlephoto

const path = require('path');
const P = require(path.join(__dirname, '..', '_tmpcheck', 'articlePhotoPick.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 選ばれていなければ、写真に触らない ──');
{
  eq('★★★ 空なら keep', P.pickArticlePhoto([], null, 0.5).kind, 'keep');
  eq('★★ 配列でなくても keep（★ 落ちない）', P.pickArticlePhoto(null, null, 0.5).kind, 'keep');
  eq('★★ 数でないものだけなら keep', P.pickArticlePhoto(['a', 0, -3], null, 0.5).kind, 'keep');
}

console.log('\n── 2. ★★★ 1枚だけなら、ずっとそれ ──');
//
// ★ 「新人で推しの子を2週間お知らせで上げ続ける」（カッキーさん）
{
  for (const r of [0, 0.3, 0.99]) {
    eq('★ さいころの目に関わらず同じ（r=' + r + '）', P.pickArticlePhoto([7], null, r), { kind: 'fixed', id: 7 });
  }
  eq('★★★ 直前と同じでも変えない（★ それが望み）',
     P.pickArticlePhoto([7], 7, 0.5), { kind: 'fixed', id: 7 });
}

console.log('\n── 3. ★★★ 複数なら回す。★ 直前と同じは避ける ──');
{
  eq('★ 先頭', P.pickArticlePhoto([1, 2, 3], null, 0), { kind: 'rotate', id: 1 });
  eq('★ まん中', P.pickArticlePhoto([1, 2, 3], null, 0.5), { kind: 'rotate', id: 2 });
  eq('★ 末尾', P.pickArticlePhoto([1, 2, 3], null, 0.99), { kind: 'rotate', id: 3 });

  // ★★★ ここが第172便のいちばん大事なところ
  eq('★★★ 2枚のとき、直前と同じは出ない（r=0）', P.pickArticlePhoto([1, 2], 1, 0).id, 2);
  eq('★★★ 2枚のとき、直前と同じは出ない（r=0.99）', P.pickArticlePhoto([1, 2], 1, 0.99).id, 2);
  eq('★★★ 逆も同じ', P.pickArticlePhoto([1, 2], 2, 0.99).id, 1);

  // ★★ どの目でも直前は出ない
  const bad = [];
  for (let i = 0; i < 100; i++) {
    const got = P.pickArticlePhoto([4, 5, 6], 5, i / 100).id;
    if (got === 5) bad.push(i);
  }
  eq('★★★ 100通りの目で試して、直前の1枚は1度も出ない', bad, []);

  // ★★ 直前が候補に入っていないときは、ふつうに全部から選ぶ
  eq('★★ 直前が候補に無ければ、そのまま全部から', P.pickArticlePhoto([1, 2], 99, 0).id, 1);
}

console.log('\n── 4. ★ 並びを整える ──');
{
  eq('★ 同じ人を2回入れない', P.normalizeArticlePhotoIds([3, 3, 4]), [3, 4]);
  eq('★ 0以下は落とす', P.normalizeArticlePhotoIds([0, -1, 5]), [5]);
  eq('★ 数でないものは落とす', P.normalizeArticlePhotoIds(['a', null, undefined, 6]), [6]);
  eq('★ 小数は切る', P.normalizeArticlePhotoIds([2.7]), [2]);
  eq('★ 文字の数字は受ける', P.normalizeArticlePhotoIds(['8']), [8]);
  eq('★★ 上限は10枚（★ ベンリーと同じ）', P.ARTICLE_PHOTO_MAX, 10);
  eq('★★ 11枚渡しても10枚に切る',
     P.normalizeArticlePhotoIds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).length, 10);
  eq('★ 順番は入れた順のまま', P.normalizeArticlePhotoIds([9, 1, 5]), [9, 1, 5]);
  eq('★ 配列でなければ空', P.normalizeArticlePhotoIds('123'), []);
}

console.log('\n── 5. ★★ さいころが壊れても送信を止めない ──');
//
// ★★★ ここで例外を投げると、★ 写真のせいで【文章そのものが出なくなる】。
//   ★ 写真は飾り。★ 飾りのために本体を止めない。
{
  for (const r of [NaN, Infinity, -Infinity, -1, 2, 1]) {
    const got = P.pickArticlePhoto([1, 2, 3], null, r);
    eq('★ r=' + String(r) + ' でも1枚返す', [1, 2, 3].includes(got.id), true);
  }
}

console.log('\n── 6. ★ 画面に出す1行 ──');
{
  eq('★★ 0枚なら何も言わない（★ 空文字と分ける）', P.articlePhotoNote(0), null);
  eq('★ 1枚', P.articlePhotoNote(1), 'この写真がずっと入ります。');
  eq('★★ 複数なら、直前を避けることまで言う',
     P.articlePhotoNote(3), '3枚選んでいます。出すたびに、この中から1枚が入ります（直前と同じ写真は避けます）。');
  eq('★ 文言に「★」を混ぜない', /★/.test(String(P.articlePhotoNote(3))), false);
  eq('★ 内部の言葉を出さない',
     /keep|fixed|rotate|null/.test(String(P.articlePhotoNote(1)) + String(P.articlePhotoNote(5))), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
