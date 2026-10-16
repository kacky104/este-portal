// CRM 予約カードの「新規／◯回目」（src/lib/crmBookingOrdinal.ts）の自己点検（第1514便・2026-10-16）。
//   使い方:  npm run check:crmordinal
const R = require(require('path').join(__dirname, '..', '_tmpcheck', 'crmBookingOrdinal.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const m = (rows) => Object.fromEntries([...R.crmBookingOrdinals(rows)].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

console.log('── 1. 数え方 ──');
eq('★ 入れた順（created_at）に 1,2,3', m([
  { id: 'c', customerId: 1, createdAt: '2026-10-03T00:00:00Z' },
  { id: 'a', customerId: 1, createdAt: '2026-10-01T00:00:00Z' },
  { id: 'b', customerId: 1, createdAt: '2026-10-02T00:00:00Z' },
]), { a: 1, b: 2, c: 3 });
eq('★★ キャンセルも数える（状態は見ない＝行があれば数える）', m([
  { id: 'cancelled', customerId: 7, createdAt: '2026-10-01T00:00:00Z' },
  { id: 'next', customerId: 7, createdAt: '2026-10-05T00:00:00Z' },
]), { cancelled: 1, next: 2 });
eq('★ 同じ時刻なら id の順', m([
  { id: 'y', customerId: 2, createdAt: '2026-10-01T00:00:00Z' },
  { id: 'x', customerId: 2, createdAt: '2026-10-01T00:00:00Z' },
]), { x: 1, y: 2 });
eq('★ お客様ごとに別々に数える', m([
  { id: 'p1', customerId: 1, createdAt: '2026-10-01T00:00:00Z' },
  { id: 'q1', customerId: 2, createdAt: '2026-10-02T00:00:00Z' },
  { id: 'p2', customerId: 1, createdAt: '2026-10-03T00:00:00Z' },
]), { p1: 1, p2: 2, q1: 1 });
eq('★★ customer_id なしは数えない', m([
  { id: 'n', customerId: null, createdAt: '2026-10-01T00:00:00Z' },
]), {});
eq('★ 日時が読めない行は入れない', m([
  { id: 'bad', customerId: 3, createdAt: 'x' },
  { id: 'ok', customerId: 3, createdAt: '2026-10-01T00:00:00Z' },
]), { ok: 1 });

console.log('\n── 2. 表示 ──');
eq('★★ 1件目は「新規」', R.crmOrdinalLabel(1), '新規');
eq('2件目は「2回目」', R.crmOrdinalLabel(2), '2回目');
eq('10件目は「10回目」', R.crmOrdinalLabel(10), '10回目');
eq('★★ 分からない（null）は出さない', R.crmOrdinalLabel(null), null);
eq('★ 0 は出さない', R.crmOrdinalLabel(0), null);
eq('★ 小数は出さない', R.crmOrdinalLabel(1.5), null);

console.log(fail ? `\n${fail} 件 NG` : '\nすべて ok');
process.exit(fail ? 1 : 0);
