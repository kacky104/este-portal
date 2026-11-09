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

console.log('── 5. 画像（第1812便）');
eq('置き場の形', [m.isEsutamaPostImagePath('5/esutama_post_1731.jpg'), m.isEsutamaPostImagePath('5/therapist_placeholder_1.jpg'), m.isEsutamaPostImagePath('../x/esutama_post_1.jpg')], [true, false, false]);
eq('順番に回す', [m.pickEsutamaPostImage(['5/esutama_post_a.jpg', '5/esutama_post_b.jpg', '5/esutama_post_c.jpg'], 4), m.pickEsutamaPostImage([], 0)], [{ path: '5/esutama_post_b.jpg', index: 1 }, undefined]);
const fu = 'https://fukues.com/api/relay/file?bucket=salon-images&path=5%2Fesutama_post_a.jpg';
const up = m.buildRealtimeImageUploadRequest('c=1', CTK, fu, 'esutama_post_a.jpg');
eq('仮置き（img ＋ upload_id ＋ text ＋ ctk）', [up.url, up.multipart.fields, up.multipart.files[0].field, up.headers['content-type']], ['https://estama.jp/post/uptemp/', { upload_id: 'photo_1-imgupload', text: 'test', ctk: CTK }, 'img', undefined]);
eq('仮置きの応答', m.parseCroppicResponse('{"status":"success","url":"/temp/file_x.jpg","width":600,"height":600}'), { ok: true, url: '/temp/file_x.jpg', width: 600, height: 600, message: null });
eq('仮置きの失敗', m.parseCroppicResponse('{"status":"error","message":"<p>大きすぎ</p>"}').ok, false);
const cr = m.buildRealtimeImageCropRequest('c=1', CTK, { url: '/temp/file_x.jpg', width: 600, height: 600 });
eq('切り抜き（600角→300角・全体）', cr.multipart.fields, { imgUrl: '/temp/file_x.jpg', imgInitW: '600', imgInitH: '600', imgW: '300', imgH: '300', imgY1: '0', imgX1: '0', cropH: '300', cropW: '300', rotation: '0', upload_id: 'photo_1-imgupload', text: 'test', ctk: CTK });
const cr2 = m.buildRealtimeImageCropRequest('c=1', CTK, { url: '/temp/y.jpg', width: 800, height: 1200 });
eq('縦長は中央', [cr2.multipart.fields.imgW, cr2.multipart.fields.imgH, cr2.multipart.fields.imgY1, cr2.multipart.fields.imgX1], ['300', '450', '75', '0']);
const ri = m.buildRealtimePostRequest('c=1', p, '本日限定割引', 'x', '/temp/crop_x.jpg');
const qi = new URLSearchParams(ri.body);
const names = []; for (let i = 0; qi.has(`str[${i}][name]`); i++) names.push(qi.get(`str[${i}][name]`) + '=' + qi.get(`str[${i}][value]`).slice(0, 18));
eq('画像の hidden は image_delete_0 の前', names.slice(2, 5), ['default_img=https://static-v3.', 'photo_1-imgupload=/temp/crop_x.jpg', 'image_delete_0=0']);

console.log('── 6. リアルタイム求人（第1813便）');
const jhtml = html.replace('value="shop"><input type="hidden" name="auto_set"', 'value="job"><input type="hidden" name="auto_set"').replace('name="table" value="shop"', 'name="table" value="shop_job"').replace('name="real_type" value="shop"', 'name="real_type" value="job"');
eq('求人の画面は job で読める', m.parseRealtimeEditPage(jhtml, 'job_realtime').problems, []);
eq('集客の画面を求人として読まない', m.parseRealtimeEditPage(html, 'job_realtime').problems.length > 0, true);
eq('求人の URL', [m.buildRealtimePageRequest('c=1', 'edit', 'job_realtime').url, m.buildRealtimePageRequest('c=1', 'list', 'job_realtime').url], ['https://estama.jp/admin/job/realtime/edit/', 'https://estama.jp/admin/job/realtime/']);
eq('投稿先は同じ（referer は求人）', [m.buildRealtimePostRequest('c=1', m.parseRealtimeEditPage(jhtml, 'job_realtime'), 't', 'b', null, 'job_realtime').url, m.buildRealtimePostRequest('c=1', m.parseRealtimeEditPage(jhtml, 'job_realtime'), 't', 'b', null, 'job_realtime').headers.referer], ['https://estama.jp/admin_post/realtime_edit', 'https://estama.jp/admin/job/realtime/edit/']);

console.log('── 7. メールマガジン（第1817便）');
const mhtml = `<h2>メールマガジン</h2><input type="hidden" id="brws_shop_id" value="43555"><table><tr><td>配信日時：2026年11月09日 11時47分<br>ネット予約限定割引</td><td>4件</td><td><button>再配信</button></td></tr>
<tr><td>配信日時：2026年11月08日 11時47分<br>ネット予約限定割引</td><td>4件</td></tr></table><input type="hidden" id="csrf_footer" value="${CTK}">`;
const mp = m.parseMailPage(mhtml);
eq('一覧（いちばん上・JST→UTC）', [mp.problems, mp.shopId, mp.top], [[], '43555', { at: '2026-11-09T02:47:00.000Z', title: 'ネット予約限定割引' }]);
const mr = m.buildMailPostRequest('c=1', mp, 'ネット予約限定割引', '☆全コース2000円OFF\n※フリー限定');
const mq = new URLSearchParams(mr.body);
eq('送り先と中身', [mr.url, mq.get('str[0][name]'), mq.get('str[0][value]'), mq.get('str[1][name]'), mq.get('str[1][value]'), mq.get('brws_shop_id'), mq.get('ctk')], ['https://estama.jp/admin_post/mail_edit', 'title', 'ネット予約限定割引', 'body', '☆全コース2000円OFF\n※フリー限定', '43555', CTK]);
eq('本文は1500文字まで', [m.esutamaPostTextProblem('t', 'x'.repeat(1500), 'mailmag'), m.esutamaPostTextProblem('t', 'x'.repeat(301))], [null, '本文は300文字以内にしてください']);
const ds = { startMin: 707, endMin: 1800, intervalMin: 1440 };
eq('時刻の値', [m.isValidEsutamaPostSetting(ds, 'mailmag'), m.isValidEsutamaPostSetting(ds)], [true, false]);
const sp = (now, lastAt, readAt) => m.shouldPostEsutama({ key: 'mailmag', setting: ds, state: { lastAt, readAt }, now, hasText: true }).reason;
eq('11:44 はまだ', sp(jst(2026, 11, 10, 11, 44), null, null), 'before_time');
eq('11:49 に送る', sp(jst(2026, 11, 10, 11, 49), jst(2026, 11, 9, 11, 49).toISOString(), null), 'ok');
eq('送ったあとは送らない', sp(jst(2026, 11, 10, 12, 4), jst(2026, 11, 10, 11, 49).toISOString(), null), 'done_today');
eq('失敗のあと30分は待つ', sp(jst(2026, 11, 10, 12, 4), null, jst(2026, 11, 10, 11, 49).toISOString()), 'recent_try');
eq('3時間を過ぎたら送らない', sp(jst(2026, 11, 10, 15, 4), null, null), 'too_late');

eq('送る時刻のあとに設定した日は送らない', m.shouldPostEsutama({ key: 'mailmag', setting: { startMin: 677, endMin: 1800, intervalMin: 1440 }, state: { lastAt: null, readAt: null, updatedAt: jst(2026, 11, 9, 12, 52).toISOString() }, now: jst(2026, 11, 9, 12, 54), hasText: true }).reason, 'set_after_time');
eq('次の日は送る', m.shouldPostEsutama({ key: 'mailmag', setting: { startMin: 707, endMin: 1800, intervalMin: 1440 }, state: { lastAt: null, readAt: null, updatedAt: jst(2026, 11, 9, 12, 52).toISOString() }, now: jst(2026, 11, 10, 11, 49), hasText: true }).reason, 'ok');

console.log('── 8. 店長の求人ブログ（第1822便）');
const bhtml = `<input type="hidden" id="brws_shop_id" value="43555"><form id="form-job_blog_edit" class="go_step_1"><input type="hidden" name="main[category_id]" value="1"><input type="text" name="main[title]" value=""><textarea name="main[content]"></textarea>
<input type="radio" name="future[post]" value="0" checked><input type="radio" name="future[post]" value="1"><select name="future[date_ymd]"><option value="2026-11-09">9</option></select><select name="future[date_h]"><option value="00">00</option></select><select name="future[date_i]"><option value="00">00</option></select><input type="hidden" name="blog_id" value="0"></form><input type="hidden" id="csrf_footer" value="${CTK}">`;
const bp = m.parseBlogEditPage(bhtml);
eq('新規の画面', [bp.problems, bp.fields.map((f) => f[0])], [[], ['main[category_id]', 'main[title]', 'main[content]', 'future[post]', 'future[date_ymd]', 'future[date_h]', 'future[date_i]', 'blog_id']]);
eq('編集の画面は読まない', m.parseBlogEditPage(bhtml.replace('name="blog_id" value="0"', 'name="blog_id" value="3271709"')).problems.some((x) => /新規ではない/.test(x)), true);
const br = m.buildBlogPostRequest('c=1', bp, '求人募集中です', '本文', ['/temp/a.jpg', '/temp/b.jpg', '/temp/c.jpg']);
const bq = new URLSearchParams(br.body); const bn = []; for (let i = 0; bq.has(`str[${i}][name]`); i++) bn.push(bq.get(`str[${i}][name]`) + '=' + bq.get(`str[${i}][value]`));
eq('送る中身（画像3枚は blog_id の前）', [br.url, bn], ['https://estama.jp/admin_post/job_blog_edit', ['main[category_id]=1', 'main[title]=求人募集中です', 'main[content]=本文', 'future[post]=0', 'future[date_ymd]=2026-11-09', 'future[date_h]=00', 'future[date_i]=00', 'blog_icon_1-imgupload=/temp/a.jpg', 'blog_icon_2-imgupload=/temp/b.jpg', 'blog_icon_3-imgupload=/temp/c.jpg', 'blog_id=0']]);
eq('一覧', m.parseBlogList('<p>本日の残り回数6回</p><h3>投稿した求人ブログ</h3> 全選択 1～20件を表示 選択した内容をまとめて削除 <p>求人募集中です</p><dt>投稿日時</dt><dd>2026/11/09 12:51</dd> 削除 編集'), { top: { at: '2026-11-09T03:51:00.000Z', title: '求人募集中です' }, remaining: 6 });
eq('画像の組（3枚・並びをずらす）', m.pickEsutamaPostImages('job_blog', ['5/esutama_post_a.jpg', '5/esutama_post_b.jpg', '5/esutama_post_c.jpg'], 1).map((x) => x.path.slice(-5)), ['b.jpg', 'c.jpg', 'a.jpg']);
eq('リアルタイムは1枚', m.pickEsutamaPostImages('guest_realtime', ['5/esutama_post_a.jpg', '5/esutama_post_b.jpg'], 1).length, 1);
eq('ブログの仮置きの枠', m.buildRealtimeImageUploadRequest('c=1', CTK, fu, 'esutama_post_a.jpg', 'job_blog', m.imageSlotsOf('job_blog')[1]).multipart.fields.upload_id, 'blog_icon_2-imgupload');
eq('ブログの切り抜きは400角', m.buildRealtimeImageCropRequest('c=1', CTK, { url: '/temp/x.jpg', width: 600, height: 600 }, 'job_blog').multipart.fields.cropW, '400');

console.log(fail ? `\n✗ ${fail} 件 NG` : '\n✓ すべて ok');
process.exit(fail ? 1 : 0);
