// 番人: 請求書の自動催促の決めごと（src/lib/invoiceAutoRemind.ts・第1433便）
const assert = require('assert');
const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'invoiceAutoRemind.js'));
const P = (o, today) => m.planInvoiceRemind({ status: 'issued', due_date: '2026-10-25', auto_remind1_at: null, auto_remind2_at: null, ...o }, today);
// 期限の当日までは送らない・翌日に1回目
assert.strictEqual(P({}, '2026-10-24'), null);
assert.strictEqual(P({}, '2026-10-25'), null);
assert.strictEqual(P({}, '2026-10-26'), 'first');
// 入金済み・取り消し・期限なしは送らない
assert.strictEqual(P({ status: 'paid' }, '2026-10-30'), null);
assert.strictEqual(P({ status: 'void' }, '2026-10-30'), null);
assert.strictEqual(P({ due_date: null }, '2026-10-30'), null);
// 1回目を 10/26 10:00 JST に送った → 2回目は 10/31 から
const r1 = '2026-10-26T01:00:00Z';
assert.strictEqual(P({ auto_remind1_at: r1 }, '2026-10-30'), null);
assert.strictEqual(P({ auto_remind1_at: r1 }, '2026-10-31'), 'second');
assert.strictEqual(P({ auto_remind1_at: r1, auto_remind2_at: '2026-10-31T01:00:00Z' }, '2026-11-20'), null);
// 1回目が遅れた（11/10 に送った）→ 2回目は 11/15 から
const late = '2026-11-10T01:00:00Z';
assert.strictEqual(P({ auto_remind1_at: late }, '2026-11-14'), null);
assert.strictEqual(P({ auto_remind1_at: late }, '2026-11-15'), 'second');
// 日本時間の日付（UTC 15:30 は翌日の 0:30）
assert.strictEqual(m.jstYmdOf('2026-10-25T15:30:00Z'), '2026-10-26');
console.log('invoiceremind selftest OK');
