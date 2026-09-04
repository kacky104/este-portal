// 投稿先アドレスのドメイン見張り（src/lib/diaryAddressCheck.ts）の自己点検（第133-4便・2026-09-04）。
//
// ★★★ 実際に起きたこと（ラビリンス様・2026-08-31）
//   サラさんのアドレスだけ '@shame.rankg-deli.jpin'（正しくは '@shame.ranking-deli.jp'）。
//   ★ 'in' が真ん中から末尾へ移った打ち間違い。★ 文字数は同じ。
//   ★★ looksLikeEmail は【形】しか見ないので素通りした。
//
// ★★★ ここで守りたいのは2つ:
//   ① 1人だけ違うドメインは止める
//   ② ★ 分からないときは【通す】。★ 保存を止めるのは確信があるときだけ
//
//   使い方:  npm run check:diaryaddress

const path = require('path');
const A = require(path.join(__dirname, '..', '_tmpcheck', 'diaryAddressCheck.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const OK_DOMAIN = 'shame.ranking-deli.jp';
const many = (n) => Array.from({ length: n }, (_, i) => 'a' + i + '@' + OK_DOMAIN);

console.log('── 1. ドメインを取り出す ──');
eq('★ @ の後ろ', A.domainOf('abc@shame.ranking-deli.jp'), OK_DOMAIN);
eq('★ 大文字は小文字に揃える', A.domainOf('abc@SHAME.Ranking-Deli.JP'), OK_DOMAIN);
// ★ + や . を含む差出人名でも、最後の @ で切る
eq('★ 名前に @ は無いが、最後の @ で切る', A.domainOf('a@b@example.com'), 'example.com');
eq('★ @ が無ければ空', A.domainOf('abc'), '');
eq('★ @ で終わっていれば空', A.domainOf('abc@'), '');
eq('★ 空でも落ちない', A.domainOf(''), '');

console.log('\n── 2. ★★★ 実際に起きた打ち間違いを止める ──');
const bad = A.checkAddressDomain({ address: 'f8xx@shame.rankg-deli.jpin', others: many(36) });
eq('★★★ 1人だけ違うドメインは止める', bad.ok, false);
eq('★★ 多数派を名指しする', bad.majority, OK_DOMAIN);
eq('★★ 入力された方も出す', bad.got, 'shame.rankg-deli.jpin');
// ★ 「間違っています」と決めつけない。★ 打ち間違いの【可能性】として伝える
eq('★★ 断定しない言い方', bad.message.includes('可能性'), true);
eq('★ 逃げ道を書く（本当に合っているとき）', bad.message.includes('運営'), true);

console.log('\n── 3. ★ 同じドメインなら通す ──');
eq('★ 多数派と同じ', A.checkAddressDomain({ address: 'x@' + OK_DOMAIN, others: many(36) }).ok, true);
eq('★ 大文字で入れても通る',
   A.checkAddressDomain({ address: 'x@SHAME.RANKING-DELI.JP', others: many(36) }).ok, true);

console.log('\n── 4. ★★★ 分からないときは通す（保存を止めない）──');
// ★★ 比べる相手が少なすぎるときに止めると、1人目・2人目が登録できない
eq('★★★ 他が0人なら通す', A.checkAddressDomain({ address: 'x@example.com', others: [] }).ok, true);
eq('★★★ 他が2人でも通す（3人未満）',
   A.checkAddressDomain({ address: 'x@example.com', others: many(2) }).ok, true);
eq('★ 他がちょうど3人なら見る',
   A.checkAddressDomain({ address: 'x@example.com', others: many(3) }).ok, false);
// ★★ そもそも揃っていない店では多数派を決めない
eq('★★★ 半々の店では止めない', A.checkAddressDomain({
  address: 'x@c.example',
  others: ['a@a.example', 'b@a.example', 'c@b.example', 'd@b.example'],
}).ok, true);
// ★ 8割そろっていれば見る
eq('★ 8割そろっていれば止める', A.checkAddressDomain({
  address: 'x@z.example',
  others: ['a@a.example', 'b@a.example', 'c@a.example', 'd@a.example', 'e@b.example'],
}).ok, false);
// ★ 形が壊れているものは、ここの担当ではない（looksLikeEmail が見る）
eq('★ @ が無いアドレスは通す（形の検査は別の場所）',
   A.checkAddressDomain({ address: 'こわれている', others: many(36) }).ok, true);
// ★ 他の中に壊れたものが混じっていても数に入れない
eq('★ 壊れた他は数えない', A.checkAddressDomain({
  address: 'x@' + OK_DOMAIN, others: ['こわれ', 'こわれ2', ...many(3)],
}).ok, true);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
