// エステ魂【オプション】の投稿（src/lib/esutamaPost.ts）の自己点検（第1811便・2026-11-09）。使い方: npm run check:esutamapost
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaPost.js'));
let fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w); if (a !== b) { console.log('NG ' + n + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + n); };
const jst = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h - 9, mi));
const CTK = 'a'.repeat(16) + 'B'.repeat(16);

console.log('── 1. 新規投稿の画面');
const html = `<input type="hidden" id="brws_shop_id" name="brws_shop_id" value="43555">
<form id="form-realtime_edit" class="go_step_1"><input type="text" name="title" value=""><textarea name="body"></textarea>
<input type="hidden" name="default_img" value="https://static-v3.estama.jp/assets/shop_realtime/43555/main.jpg?f=webp&amp;x=1">
<input type="hidden" name="image_delete_0" value="0"><input type="checkbox" name="add_template" value="1">
<input type="hidden" name="page" value="shop"><input type="hidden" name="auto_set" value="0"><input type="hidden" name="table" value="shop"><input type="hidden" name="real_type" value="shop"></form>
<input type="hidden" id="csrf_footer" value="${CTK}">`;
const p = m.parseRealtimeEditPage(html);
eq('問題なし・shopId', [p.problems, p.shopId, p.ctk], [[], '43555', CTK]);
eq('並び（テンプレート保存は付いていない）', p.fields.map((f) => f[0]), ['title', 'body', 'default_img', 'image_delete_0', 'page', 'auto_set', 'table', 'real_type']);
const r = m.buildRealtimePostRequest('c=1', p, '本日限定割引', '2000円OFF\nです☆');
const q = new URLSearchParams(r.body);
eq('送り先', r.url, 'https://estama.jp/admin_post/realtime_edit');
eq('title・body が入る', [q.get('str[0][name]'), q.get('str[0][value]'), q.get('str[1][value]')], ['title', '本日限定割引', '2000円OFF\nです☆']);
eq('default_img はそのまま（&amp; を戻す）', q.get('str[2][value]'), 'https://static-v3.estama.jp/assets/shop_realtime/43555/main.jpg?f=webp&x=1');
eq('最後に brws_shop_id・ctk', [q.get('brws_shop_id'), q.get('ctk')], ['43555', CTK]);
let threw = false; try { m.buildRealtimePostRequest('c=1', p, 'x'.repeat(31), 'b'); } catch { threw = true; }
eq('31文字のタイトルは送らない', threw, true);
eq('フォームが無い画面', m.parseRealtimeEditPage('<p>x</p>').problems.length > 0, true);

console.log('── 2. 応答');
eq('OUT は受け付けられていない', m.realtimePostResponse('{"0":"OUT","1":"<p>タイトルを入力してください</p>"}'), { accepted: false, error: 'タイトルを入力してください' });
eq('REDIRECT は受け付け', m.realtimePostResponse('["REDIRECT","/admin/guest/realtime/"]').accepted, true);
eq('JSON でない', m.realtimePostResponse('<html>').accepted, false);

console.log('── 3. 履歴のいちばん上');
const list = `<h3>表示中の新着メッセージ</h3><p>本日限定割引</p><h3>通知したメッセージの履歴(最大10件)</h3>
<div><dt>投稿日時</dt><dd>2026/11/09 10:53</dd><p>本日限定割引</p><a>確認する</a><a>複製</a></div>
<div><dt>投稿日時</dt><dd>2026/11/09 09:53</dd><p>本日限定割引</p><a>確認する</a></div>`;
eq('時刻（JST→UTC）とタイトル', m.parseRealtimeHistoryTop(list), { at: '2026-11-09T01:53:00.000Z', title: '本日限定割引' });

console.log('── 4. 送るか');
const st = { startMin: 360, endMin: 1800, intervalMin: 60 };
eq('はじめて', m.shouldPostEsutama({ setting: st, state: { lastAt: null, readAt: null }, now: jst(2026, 11, 9, 11, 4), hasText: true }).post, true);
eq('文章が無い', m.shouldPostEsutama({ setting: st, state: { lastAt: null, readAt: null }, now: jst(2026, 11, 9, 11, 4), hasText: false }).reason, 'no_text');
eq('57分後は送る', m.shouldPostEsutama({ setting: st, state: { lastAt: jst(2026, 11, 9, 10, 7).toISOString(), readAt: jst(2026, 11, 9, 10, 4).toISOString() }, now: jst(2026, 11, 9, 11, 4), hasText: true }).post, true);
eq('30分後は送らない', m.shouldPostEsutama({ setting: st, state: { lastAt: jst(2026, 11, 9, 10, 34).toISOString(), readAt: null }, now: jst(2026, 11, 9, 11, 4), hasText: true }).reason, 'interval');
eq('失敗した直後は始めない', m.shouldPostEsutama({ setting: st, state: { lastAt: null, readAt: jst(2026, 11, 9, 10, 59).toISOString() }, now: jst(2026, 11, 9, 11, 4), hasText: true }).reason, 'recent_try');
eq('時間外', m.shouldPostEsutama({ setting: { ...st, startMin: 600, endMin: 1440 }, state: { lastAt: null, readAt: null }, now: jst(2026, 11, 10, 2, 0), hasText: true }).reason, 'outside_hours');
eq('間隔の値', [m.isValidEsutamaPostSetting(st), m.isValidEsutamaPostSetting({ ...st, intervalMin: 45 })], [true, false]);

console.log(fail ? `\n✗ ${fail} 件 NG` : '\n✓ すべて ok');
process.exit(fail ? 1 : 0);
