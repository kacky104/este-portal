// 番人: コラム自動リライトの歯止め（src/lib/columnRefreshGuard.ts）。カッキーさん決定 2026-10-16。
// 各ルールの OK / NG を確かめる。npm run check:columnrefresh から呼ばれる。
const assert = require('assert');
const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'columnRefreshGuard.js'));

// 比較のベースになる「元の本文」: 内部リンク2つ・## 見出し2つ・金額「3,000円」・十分な長さ。
const ORIG = [
  'これは元の本文です。読者に向けてしっかりとした説明の段落が続きます。',
  '[店舗型](/jobs/glossary/tenpo-gata)についても触れておきます。',
  '',
  '## 見出し1',
  '最初のまとまりです。内容をていねいに書いていきます。目安は3,000円くらいです。',
  '',
  '## 見出し2',
  '次のまとまりです。[出張型](/jobs/glossary/shuccho-gata)も参考にしてください。最後にまとめの段落を置きます。',
].join('\n');

// --- 部品の確認 ---
assert.strictEqual(m.MIN_RATIO, 0.7);
assert.strictEqual(m.MAX_RATIO, 1.5);
assert.strictEqual(m.charCount('あいう'), 3);
assert.strictEqual(m.charCount('😀あ'), 2);
assert.deepStrictEqual(m.internalLinks(ORIG), ['](/jobs/glossary/tenpo-gata)', '](/jobs/glossary/shuccho-gata)']);
assert.deepStrictEqual(m.moneyAmounts('3,000円と5000円'), ['3,000円', '5000円']);
assert.strictEqual(m.headingCount(ORIG), 2);
assert.strictEqual(m.headingCount('### 小見出し\n## ふつうの見出し'), 1); // ### は数えない
assert.ok(m.hasPhoneLike('電話は03-1234-5678です'));
assert.ok(m.hasPhoneLike('0312345678'));
assert.ok(!m.hasPhoneLike('2026-07-24 に更新しました')); // 0始まりでない日付は拾わない

// --- OK ケース: 元のまま（全ルール通過） ---
let r = m.checkRefresh(ORIG, ORIG);
assert.ok(r.ok, `OK のはずが NG: ${r.reason}`);

// 見出しを1つ増やし、言い回しを変えた健全な書き直し（リンク・金額・見出し数は維持）→ OK
const GOOD = ORIG + '\n\n## まとめ\n今の季節に合わせて、無理なく楽しむのがおすすめです。';
r = m.checkRefresh(ORIG, GOOD);
assert.ok(r.ok, `OK のはずが NG: ${r.reason}`);

// --- NG ケース: ルールごと ---
function ng(next, keyword, label) {
  const res = m.checkRefresh(ORIG, next);
  assert.ok(!res.ok, `${label}: NG のはずが OK`);
  assert.ok(res.reason.includes(keyword), `${label}: 理由に「${keyword}」が無い（実際: ${res.reason}）`);
}

ng('', '空', '空');
ng('---\nslug: x\n---\n本文', 'frontmatter', 'frontmatter 混入');
ng('みじかい。', '短すぎる', '短すぎる');
ng(ORIG + ORIG + ORIG, '長すぎる', '長すぎる');
ng(ORIG.replace('[店舗型](/jobs/glossary/tenpo-gata)', '店舗型'), '内部リンク', '内部リンク消失');
ng(ORIG + '\n詳しくは https://example.com を見てください。', 'http', '外部リンク');
ng(ORIG + '\nお問い合わせは03-9999-8888まで。', '電話', '電話番号');
ng(ORIG + '\n特別価格で9,800円のコースもあります。', '金額', '新しい金額');
ng(ORIG.replace('## 見出し2', '見出し2'), '見出し', '見出し減少');
ng(ORIG + '\n本番のサービスはありません。', '禁止語', '禁止語');

console.log('✔ columnrefresh ok');
