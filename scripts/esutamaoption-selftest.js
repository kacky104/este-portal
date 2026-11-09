// エステ魂【オプション】（src/lib/esutamaOption.ts）の自己点検（第1799便・2026-11-09）。使い方: npm run check:esutamaoption
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaOption.js'));
let fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a !== b) { console.log('NG ' + n + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + n); };
const jst = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h - 9, mi));
const CTK = 'a'.repeat(16) + 'B'.repeat(16);
const csrf = `<input type="hidden" id="csrf_footer" value="${CTK}">`;

console.log('── 1. ご案内状況（集客ブースト）');
{
  const html = `<p>本日の残り回数<span class="js-go_now_limit_last">4</span>回</p>
  <form id="ShopWaitSettingForm"><input type="hidden" name="check_go_now_edit" value="1">
  <select name="current_work[cast][738089][current_work_status]"><option value="0">未設定</option><option value="1" selected>今すぐ</option></select>
  <input type="text" name="dummy" value=""><select name="current_work[cast][1][current_work_status]"><option value="0">未設定</option></select>
  <input type="text" name="dummy" value="x"><input type="hidden" name="post_data" value="start"><input type="hidden" name="brws_shop_id" value="43555"></form>${csrf}`;
  const p = m.parseGoNowPage(html);
  eq('残り4・ctk・問題なし', [p.remaining, p.ctk, p.problems], [4, CTK, []]);
  eq('フォームの中身（同じ名前は最初の1つ・選ばれた値）', p.fields, [['check_go_now_edit', '1'], ['current_work[cast][738089][current_work_status]', '1'], ['dummy', ''], ['current_work[cast][1][current_work_status]', '0'], ['post_data', 'start'], ['brws_shop_id', '43555']]);
  const r = m.buildGoNowBoostRequest('c=1', CTK, p.fields);
  eq('本文の最後は type=1 と ctk', r.body.endsWith('&type=1&ctk=' + CTK), true);
  eq('送り先', r.url, 'https://estama.jp/admin/go_now/post_shop_wait/');
  eq('応答 OK', m.goNowBoostAccepted('{"0":"OK","1":"<h3>x</h3>"}'), true);
  eq('応答 OUT', m.goNowBoostAccepted('{"0":"OUT"}'), false);
}

console.log('── 2. セラピストアピール');
{
  const row = (id, name, time, last) => `<tr><td>${name}</td><td>${time}</td><td>セラピスト一覧 9位</td><td><a class="send-easy_post2" data-post="single_appeal_exec" data-row="cast,cast_appeal,${id}">アピールする</a><p class="l-appeal_last_update">最終アピール ${last}</p></td></tr>`;
  const html = `<p>本日の残り回数1回</p><table>${row('651234', 'りな', '12:00～27:00', '11/06 23:20')}${row('1000600', 'りく', '15:00～29:00', '-')}${row('979450', 'まゆゆ', '10:00～17:00', '11/08 17:20')}${row('813333', 'うる', '', '10/22 19:20')}</table>${csrf}`;
  const now = jst(2026, 11, 9, 0, 28);
  const p = m.parseCastAppealPage(html, now);
  eq('残り1・4人', [p.remaining, p.rows.length], [1, 4]);
  eq('りな 12:00～27:00', [p.rows[0].name, p.rows[0].startMin, p.rows[0].endMin], ['りな', 720, 1620]);
  eq('★ 0:28 は翌日扱い → 出勤時間内で一度もない「りく」', m.pickCastToAppeal(p.rows, now).castId, '1000600');
  const day = jst(2026, 11, 9, 13, 0);
  const q = m.parseCastAppealPage(html, day);
  eq('13:00 なら りな・まゆゆ・(りく外) → 古いのは りな', m.pickCastToAppeal(q.rows, day).castId, '651234');
  eq('出勤時間外だけなら null', m.pickCastToAppeal([q.rows[3]], day), null);
  eq('本文', m.buildCastAppealRequest('c=1', CTK, '1000600').body, 'post_data=cast%2Ccast_appeal%2C1000600&ctk=' + CTK);
}

console.log('── 3. 押すかの判断');
{
  const s = { startMin: 360, endMin: 1800, intervalMin: 60 };
  const now = jst(2026, 11, 9, 12, 0);
  const st = (lastMin, rem, readMin) => ({ lastAt: lastMin == null ? null : new Date(now.getTime() - lastMin * 60000).toISOString(), remaining: rem, readAt: readMin == null ? null : new Date(now.getTime() - readMin * 60000).toISOString() });
  eq('初めて → 押す', m.shouldPressEsutamaOpt({ key: 'shop_boost', setting: s, state: st(null, null, null), now }).press, true);
  eq('30分前に押した → 待つ', m.shouldPressEsutamaOpt({ key: 'shop_boost', setting: s, state: st(30, 5, 30), now }).reason, 'interval');
  eq('58分前 → 押す（3分の遊び）', m.shouldPressEsutamaOpt({ key: 'shop_boost', setting: s, state: st(58, 5, 58), now }).press, true);
  eq('今日0回を読んだ → 押さない', m.shouldPressEsutamaOpt({ key: 'shop_boost', setting: s, state: st(120, 0, 120), now }).reason, 'no_quota');
  eq('0回を読んだのが朝6時前 → また見に行く', m.shouldPressEsutamaOpt({ key: 'shop_boost', setting: s, state: st(400, 0, 400), now }).press, true);
  eq('時間帯の外 → 押さない', m.shouldPressEsutamaOpt({ key: 'shop_boost', setting: { ...s, startMin: 780 }, state: st(null, null, null), now }).reason, 'outside_hours');
  const js = { ...s, timesMin: [604, 1206, 1320] };
  eq('求人: 12:00 で 10:04 分がまだ → 押す', m.shouldPressEsutamaOpt({ key: 'job_appeal', setting: js, state: st(null, 9, null), now }).press, true);
  eq('求人: 10:05 に押した → 次は 20:06 まで待つ', m.shouldPressEsutamaOpt({ key: 'job_appeal', setting: js, state: st(115, 8, 115), now }).reason, 'done_for_time');
  const early = jst(2026, 11, 9, 9, 0);
  eq('求人: 9:00 はまだ最初の時刻の前', m.shouldPressEsutamaOpt({ key: 'job_appeal', setting: js, state: { lastAt: null, remaining: null, readAt: null }, now: early }).reason, 'before_first_time');
  eq('求人の本文', m.buildJobAppealRequest('c=1', CTK, 'shop_job_exp,job_appeal').body, 'post_data=shop_job_exp%2Cjob_appeal&ctk=' + CTK);
  eq('セラピスト: 20分前に読んだ → 待つ', m.shouldPressEsutamaOpt({ key: 'cast_appeal', setting: s, state: st(null, 1, 20), now }).reason, 'recent_read');
}
console.log('── 本日体験入店（第1823便）');
{
  const on = m.parseJobNowPage(`<h2>本日体験入店できるお店</h2><span class="input-view"> 11月10日 00時00分（<strong>掲載中</strong>） </span><a class="btn send-easy_post2" data-post="job_now" data-row="stop">掲載停止</a>${csrf}`);
  eq('掲載中', [on.listed, on.startRow, on.problems], [true, null, []]);
  const off = m.parseJobNowPage(`<h2>本日体験入店できるお店</h2><p>掲載していません</p><a class="btn send-easy_post2" data-post="job_now" data-row="start">掲載開始</a>${csrf}`);
  eq('止まっている（掲載開始の値は画面から）', [off.listed, off.startRow, off.problems], [false, 'start', []]);
  const r = m.buildJobNowStartRequest('c=1', CTK, 'start');
  eq('押す中身', [r.url, new URLSearchParams(r.body).get('post_data')], ['https://estama.jp/admin_post/job_now', 'start']);
  let threw = false; try { m.buildJobNowStartRequest('c=1', CTK, 'stop'); } catch { threw = true; }
  eq('停止は押さない', threw, true);
  const st = m.ESUTAMA_OPT_DEFAULT.job_now;
  eq('1時間に1回まで見る', m.shouldPressEsutamaOpt({ key: 'job_now', setting: st, state: { lastAt: null, remaining: null, readAt: jst(2026, 11, 10, 0, 30).toISOString() }, now: jst(2026, 11, 10, 0, 59) }).reason, 'recent_read');
  eq('0時すぎに見る', m.shouldPressEsutamaOpt({ key: 'job_now', setting: st, state: { lastAt: null, remaining: null, readAt: jst(2026, 11, 9, 23, 30).toISOString() }, now: jst(2026, 11, 10, 0, 34) }).press, true);
}

console.log(fail === 0 ? '\n全部 ok' : `\n${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
