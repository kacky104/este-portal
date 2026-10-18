// 第1557便: lib/mediaSort.ts の番人（並べ方・送る中身）。npm run check:mediasort
const m = require('../_tmpcheck/mediaSort.js');
let bad = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error('NG', name, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', name); };
// サイトにいる方を want の順に、サイトにしかいない方は今の順のまま後ろ
eq('並べ替え', m.planSiteOrder(['5', '1', '9', '2', '7'], ['2', '1', '3', '5']).order, ['2', '1', '5', '9', '7']);
eq('並べ替えの人数', m.planSiteOrder(['5', '1', '9', '2', '7'], ['2', '1', '3', '5']).matched, 3);
eq('もう同じなら changed=false', m.planSiteOrder(['2', '1', '5', '9'], ['2', '1', '5']).changed, false);
eq('want が空なら変えない', m.planSiteOrder(['2', '1'], []).changed, false);
eq('照合', m.orderFollowsWant(['2', '1', '5', '9'], ['2', '1', '5']), true);
eq('照合（崩れ）', m.orderFollowsWant(['1', '2', '5'], ['2', '1', '5']), false);
// 駅ちかの本文
eq('駅ちかの本文', m.buildEkichikaSortBody('tok', ['3', '1']), 'fuel_csrf_token=tok&girls_list_btn=' + encodeURIComponent('並び替え更新') + '&girls_list_action=&girls_id%5B3%5D=3&girls_id%5B1%5D=1');
let threw = false; try { m.buildEkichikaSortBody('', ['1']); } catch { threw = true; } eq('トークン無しは送らない', threw, true);
// エステ魂
const html = '<ul id="CastSortable"><li id="Cast_11"><input type="hidden" name="cast_id[]" value="11"><input type="hidden" name="cast_sort[]" value="1"></li>' +
  '<li id="Cast_22"><input type="hidden" name="cast_id[]" value="22"><input type="hidden" name="cast_sort[]" value="2"></li></ul>' +
  '<input type="hidden" id="csrf_footer" value="abcdefghijklmnop1234">';
const p = m.parseEsutamaCastSort(html);
eq('エステ魂の並び', p.castIds, ['11', '22']);
eq('エステ魂の ctk', p.ctk, 'abcdefghijklmnop1234');
eq('エステ魂の本文', m.buildEsutamaCastSortSaveRequest('c=1', 'abcdefghijklmnop1234', ['22', '11']).body,
  'cast_id%5B%5D=22&cast_sort%5B%5D=1&cast_id%5B%5D=11&cast_sort%5B%5D=2&ctk=abcdefghijklmnop1234');
eq('エステ魂の送り先', m.buildEsutamaCastSortSaveRequest('c=1', 'abcdefghijklmnop1234', ['22']).url, 'https://estama.jp/admin_post/cast_sort_edit');
if (bad > 0) { console.error(bad + ' 件 NG'); process.exit(1); }
console.log('mediasort: すべて ok');
