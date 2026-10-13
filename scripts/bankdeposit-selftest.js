// 番人: 入金明細と請求書の照らし合わせ（src/lib/bankDeposit.ts・第1437便）
const assert = require('assert');
const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'bankDeposit.js'));
assert.strictEqual(m.AUTO_MARK_PAID, false);
assert.strictEqual(m.normalizeName('振込 ｶ)ﾗﾋﾞﾘﾝｽ'), 'カ)ラビリンス');
assert.strictEqual(m.cleanPayerName('振込 ｶ)ﾗﾋﾞﾘﾝｽ'), 'カ)ラビリンス');
assert.ok(m.isNotPayment('預金利息'));
assert.ok(!m.isNotPayment('カ)ラビリンス'));
const inv = [
  { id: 1, total: 66000, transferName: 'カ)ラビリンス' },
  { id: 2, total: 66000, transferName: '' },
  { id: 3, total: 33000, transferName: '' },
];
// 金額が同じ請求書が2件・名義でしぼれる
assert.deepStrictEqual(m.suggestInvoice({ amount: 66000, content: '振込 ｶ)ﾗﾋﾞﾘﾝｽ' }, inv), { invoiceId: 1, reason: 'name' });
// 金額が同じ請求書が2件・名義が分からない → 決めない
assert.strictEqual(m.suggestInvoice({ amount: 66000, content: 'ﾔﾏﾀﾞﾀﾛｳ' }, inv), null);
// 金額が一致するのが1件だけ
assert.deepStrictEqual(m.suggestInvoice({ amount: 33000, content: 'ﾔﾏﾀﾞﾀﾛｳ' }, inv), { invoiceId: 3, reason: 'amount' });
// 金額が合わない
assert.strictEqual(m.suggestInvoice({ amount: 12345, content: 'ｶ)ﾗﾋﾞﾘﾝｽ' }, inv), null);
console.log('bankdeposit selftest OK');
