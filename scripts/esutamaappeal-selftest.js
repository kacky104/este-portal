// エステ魂の集客ワンクリックアピール（src/lib/esutamaAppeal.ts）の自己点検（第1314便・2026-10-08）。
//
// ★★★ 見張っているのは:
//   ① 画面（/admin/guest/appeal/）の【店舗情報の行だけ】から、残り回数・最終アピールを読むこと（クーポン・体験談の行と混ぜない）
//   ② 送る本文が画面の $.ajax と同じ（post_data=shop,guest_appeal・ctk）。★ 店舗情報以外の行を押さない
//   ③ 押せたかは読み直しで決める（残り回数が減った／最終アピールが新しくなった）
//   ④ 年の無い日時（'10/08 16:01'）を、年またぎも含めて正しく読む
//   使い方:  npm run check:esutamaappeal
const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaAppeal.js'));
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; } else console.log('ok ' + name);
};
const jst = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h - 9, mi));
const CTK = 'a'.repeat(16) + 'B'.repeat(16);
const row = (rowKey, num, last) => `
  <tr><th><a href="/x">店舗情報</a></th>
    <td class="td-limit_num"><p class="l-appeal_limit_num"><span>残り</span><strong class="big tg_num">${num}</strong><span>回</span></p></td>
    <td class="l-appeal_display_order"><div class="l-appeal_display_order_rank"><a><span class="rank__label">トップページ</span><span>位<span class="num">2</span></span></a></div></td>
    <td class="l-appeal_btns_wrap"><a class="send-easy_post2 btn btn-primary" data-post="single_appeal_exec" data-row="${rowKey}" onclick="gtag('event')">アピールする</a>
      <p class="l-appeal_last_update">最終アピール ${last}</p></td></tr>`;
const page = (shopNum, shopLast) => `<html><body><table>
  ${row('shop,guest_appeal', shopNum, shopLast)}
  ${row('shop_coupon,guest_appeal', 10, '10/08 01:13')}
  ${row('shop_exp,guest_appeal', 10, '10/08 01:13')}
  </table><input type="hidden" id="csrf_footer" name="ctk" value="${CTK}"></body></html>`;

console.log('── 1. ★★★ 店舗情報の行だけを読む ──');
{
  const now = jst(2026, 10, 8, 16, 5);
  const p = m.parseEsutamaAppealPage(page(7, '10/08 16:01'), now);
  eq('残り7・最終アピール 10/08 16:01・ctk', [p.remaining, p.lastAt, p.ctk, p.problems], [7, jst(2026, 10, 8, 16, 1).toISOString(), CTK, []]);
  eq('押せる材料がそろっている', m.esutamaAppealUsable(p), true);
  const noShop = page(7, '10/08 16:01').replace('data-row="shop,guest_appeal"', 'data-row="x"');
  const q = m.parseEsutamaAppealPage(noShop, now);
  eq('★ 店舗情報の行が無ければ、クーポンの行の数字を使わない（押さない）', [q.remaining, m.esutamaAppealUsable(q)], [null, false]);
  const noCtk = m.parseEsutamaAppealPage(page(7, '10/08 16:01').replace(/<input[^>]*csrf_footer[^>]*>/, ''), now);
  eq('ctk が無ければ押さない', m.esutamaAppealUsable(noCtk), false);
  const never = m.parseEsutamaAppealPage(page(10, ''), now);
  eq('一度も押していない（日付なし）は null で問題なし', [never.lastAt, never.problems], [null, []]);
}

console.log('\n── 2. ★★ 年の無い日時 ──');
eq('10/08 16:01（10/8 に読む）', m.parseEsutamaAppealTime('最終アピール 10/08 16:01', jst(2026, 10, 8, 16, 5)), jst(2026, 10, 8, 16, 1).toISOString());
eq('★ 年またぎ: 12/31 23:50 を 1/1 0:10 に読む → 前の年', m.parseEsutamaAppealTime('12/31 23:50', jst(2027, 1, 1, 0, 10)), jst(2026, 12, 31, 23, 50).toISOString());
eq('読めない形は null', [m.parseEsutamaAppealTime('-', new Date()), m.parseEsutamaAppealTime('13/40 25:00', new Date())], [null, null]);

console.log('\n── 3. ★★★ 送る本文（画面の $.ajax と同じ）──');
{
  const r = m.buildEsutamaAppealPostRequest('sid=1', CTK);
  eq('POST /admin_post/single_appeal_exec', [r.method, r.url], ['POST', 'https://estama.jp/admin_post/single_appeal_exec']);
  eq('★ 本文は post_data=shop,guest_appeal ＋ ctk だけ（店舗情報だけを押す）', r.body, 'post_data=shop%2Cguest_appeal&ctk=' + CTK);
  eq('JS 送信と同じ見た目', [r.headers['x-requested-with'], r.headers['content-type'].startsWith('application/x-www-form-urlencoded')], ['XMLHttpRequest', true]);
  let threw = 0;
  try { m.buildEsutamaAppealPostRequest('', CTK); } catch { threw++; }
  try { m.buildEsutamaAppealPostRequest('sid=1', 'short'); } catch { threw++; }
  eq('Cookie・ctk が無ければ組み立てない', threw, 2);
}

console.log('\n── 4. ★★★ 押せたかは読み直しで決める ──');
{
  const now = jst(2026, 10, 8, 16, 10);
  const before = { remaining: 7, lastAt: jst(2026, 10, 8, 16, 1).toISOString() };
  eq('残り 7 → 6 なら押せた', m.esutamaAppealPressed(before, m.parseEsutamaAppealPage(page(6, '10/08 16:09'), now)), true);
  eq('残りが変わらなくても最終アピールが新しければ押せた', m.esutamaAppealPressed(before, m.parseEsutamaAppealPage(page(7, '10/08 16:09'), now)), true);
  eq('★ どちらも変わらなければ押せていない', m.esutamaAppealPressed(before, m.parseEsutamaAppealPage(page(7, '10/08 16:01'), now)), false);
}

console.log('\n── 5. ★★ ソースの見張り ──');
{
  const flow = fs.readFileSync(path.join(__dirname, '..', 'src/lib/esutamaAppealFlow.ts'), 'utf8');
  eq('★ 押せたかを応答で決めていない（読み直しの段がある）', [/esutama_appeal_verify/.test(flow), /esutamaAppealPressed\(/.test(flow)], [true, true]);
  const retry = fs.readFileSync(path.join(__dirname, '..', 'src/lib/relayRetry.ts'), 'utf8');
  const noRetry = retry.slice(retry.indexOf('NO_RETRY_PURPOSES'));
  eq('★ esutama_appeal_set は送り直さない側', /'esutama_appeal_set'/.test(noRetry), true);
  const lib = fs.readFileSync(path.join(__dirname, '..', 'src/lib/esutamaAppeal.ts'), 'utf8');
  eq('★ クーポン・体験談の行を押す本文を作っていない', /shop_coupon|shop_exp/.test(lib.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), false);
}

console.log(fail === 0 ? '\n全部 ok' : `\n${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
