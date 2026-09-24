// 請求書の計算（src/lib/billing.ts）の自己点検（第816便）。  使い方: npm run check:billing
const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'billing.js'));
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; } else console.log('ok ' + name);
};
eq('掲載料だけ', m.calcTotals([{ label: '掲載料', unit_price: 60000, quantity: 1 }], 10), { subtotal: 60000, tax: 6000, total: 66000 });
eq('割引あり', m.calcTotals([{ label: '掲載料', unit_price: 60000, quantity: 1 }, { label: '割引', unit_price: -10000, quantity: 1 }], 10), { subtotal: 50000, tax: 5000, total: 55000 });
eq('税は切り捨て', m.calcTotals([{ label: 'x', unit_price: 1234, quantity: 1 }], 10), { subtotal: 1234, tax: 123, total: 1357 });
eq('マイナスは税0', m.calcTotals([{ label: '割引', unit_price: -100, quantity: 1 }], 10), { subtotal: -100, tax: 0, total: -100 });
eq('数量', m.calcTotals([{ label: 'バナー', unit_price: 5000, quantity: 3 }], 10), { subtotal: 15000, tax: 1500, total: 16500 });
const L = [
  { label: '掲載料', unit_price: 60000, quantity: 1, start_month: '2026-10-01', end_month: null, sort_order: 0 },
  { label: '割引', unit_price: -10000, quantity: 1, start_month: '2026-10-01', end_month: '2026-12-01', sort_order: 9 },
  { label: 'CRM', unit_price: 5000, quantity: 1, start_month: '2027-01-01', end_month: null, sort_order: 5 },
];
eq('10月', m.linesForMonth(L, '2026-10-01').map((l) => l.label), ['掲載料', '割引']);
eq('12月（割引の最後の月）', m.linesForMonth(L, '2026-12-01').map((l) => l.label), ['掲載料', '割引']);
eq('1月（割引が終わりCRMが始まる）', m.linesForMonth(L, '2027-01-01').map((l) => l.label), ['掲載料', 'CRM']);
eq('9月（まだ）', m.linesForMonth(L, '2026-09-01').length, 0);
eq('addMonths 年またぎ', m.addMonths('2026-12-01', 1), '2027-01-01');
eq('addMonths 戻る', m.addMonths('2027-01-01', -1), '2026-12-01');
eq('monthOf', m.monthOf('2026-10-17'), '2026-10-01');
eq('isMonth', [m.isMonth('2026-10-01'), m.isMonth('2026-10-02'), m.isMonth('2026-13-01')], [true, false, false]);
eq('期限（11月分は10月25日）', m.dueDateOf('2026-11-01', 25), '2026-10-25');
eq('期限（1月分は前年12月25日）', m.dueDateOf('2027-01-01', 25), '2026-12-25');
eq('10月1日に発行するのは11月分', m.billingMonthForIssueDay('2026-10-01'), '2026-11-01');
eq('12月に発行するのは翌年1月分', m.billingMonthForIssueDay('2026-12-15'), '2027-01-01');
eq('月末', [m.monthEnd('2026-11-01'), m.monthEnd('2027-02-01'), m.monthEnd('2028-02-01')], ['2026-11-30', '2027-02-28', '2028-02-29']);
eq('請求番号', m.invoiceNo('2026-10-01', 7), 'FK-202610-0007');
eq('次の番号', m.nextInvoiceSeq('2026-10-01', ['FK-202610-0001', 'FK-202610-0003', 'FK-202609-0009', null]), 4);
eq('次の番号（まだ無い）', m.nextInvoiceSeq('2026-10-01', []), 1);
eq('表示', [m.monthLabel('2026-10-01'), m.dateLabel('2026-10-25'), m.yen(66000)], ['2026年10月分', '2026年10月25日', '66,000']);
console.log(fail ? `\n★ NG ${fail} 件` : '\n★ すべて通った');
process.exit(fail ? 1 : 0);
