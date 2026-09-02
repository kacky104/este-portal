// 写真の送信（src/lib/ekichikaPhoto.ts / imageSize.ts / relayFlow.ts の photo_push）の自己点検（第107便）。
//
// ★★★ この段は【駅ちかを書き換える】（work_push / work_auto に次ぐ3つ目）。★ だから守りを数で固定する。
//   ① 触るのは【指定した1枠】だけ。★ 枠に写真が入っていたら送らない（上書きしない）
//   ② POST のたびに編集ページを読み直す（★ fuel_csrf_token をそのページから拾う）
//   ③ 別の子の編集ページが返ったら止める（★ 別の子の枠を触らない）
//   ④ ファイルの取り先は fukues.com の口だけ（★ 第106便の検査を通る形で組む）
//   ⑤ 座標の物差し: ②は実寸（sh_w/sh_h に実寸）、③は 300×400（★ 収まらない正方形は送らない）
//   ⑥ 応答が JSON でなければ止める。★ src が空なら message を理由にして止める
//
// ★★ HTML は作り物（★ 2026-09-02 に読んだ form の構造だけを写した。実在の名前・URLは入れていない）。
//
//   使い方:  npm run check:photoflow

const path = require('path');
const f = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));
const p = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaPhoto.js'));
const im = require(path.join(__dirname, '..', '_tmpcheck', 'imageSize.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };

// ── 編集ページの作り物（★ 8枠 × 4form。occupied の枠だけ大画像あり）──
const GIRL = '5232208', SHOP = '37168', TOKEN = 'tok'.repeat(40);
const S3 = 'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/' + SHOP + '/' + GIRL + '/img';
const hid = (n, v) => '<input type="hidden" name="' + n + '" value="' + v + '">';
function editPage(o) {
  const opt = Object.assign({ girl: GIRL, occupied: [1, 2, 3, 4], slots: 8, token: TOKEN }, o || {});
  let h = '<html><body><form action="https://cocoa-job.jp/entry/login/" method="post">' + hid('email', 'x') + hid('password', 'y') + '</form>';
  h += '<form action="https://ranking-deli.jp/admin/girls/edit/' + opt.girl + '" method="post"><select name="girl_work[' + opt.girl + '][0][start_time]"></select></form>';
  for (let n = 1; n <= opt.slots; n++) {
    const img = opt.occupied.includes(n) ? S3 + n + '_20260809230626.jpg' : '';
    const common = hid('id', opt.girl) + hid('edt_table', 'girls') + hid('image_set_id', n) + hid('shopid', SHOP);
    h += '<div id="con' + n + '">';
    h += '<form class="delete-image" method="post" action="#">' + hid('image_set_id', n) + hid('shopid', SHOP) + hid('id', opt.girl) + hid('fuel_csrf_token', opt.token) + '<button type="submit">削除</button></form>';
    h += '<form id="upload-form" method="post" enctype="multipart/form-data" action="#">' + hid('image_set_id', n) + hid('id', opt.girl) + hid('edt_table', 'girls') + '<input type="file" name="upfile">' + hid('shopid', SHOP) + hid('fuel_csrf_token', opt.token) + '<button type="submit">アップロード</button></form>';
    h += '<form id="check-coords1" action="/admin/girls/edit/' + opt.girl + '" method="post">' + hid('x', '') + hid('y', '') + hid('w', '') + hid('h', '') + hid('edt_type', '1') + common + hid('image', '') + '<input type="submit" value="修正する"></form>';
    h += '<form id="check-coords" action="/admin/girls/edit/' + opt.girl + '" method="post">' + hid('x', '') + hid('y', '') + hid('w', '') + hid('h', '') + hid('edt_type', '2') + common + hid('image', img) + hid('fuel_csrf_token', opt.token) + '<input type="submit" value="修正する"></form>';
    h += '</div>';
  }
  return h + '</body></html>';
}
const LOGIN_PAGE = '<html><head><title>駅ちかランキング | ログイン</title></head><body></body></html>';

console.log('── 1. 画像の寸法（ヘッダだけ読む）──');
{
  const jpg = new Uint8Array([0xff,0xd8, 0xff,0xe0, 0x00,0x10, ...new Array(14).fill(0), 0xff,0xc0, 0x00,0x11, 0x08, 0x03,0x20, 0x02,0x58, 0x03, ...new Array(20).fill(0)]);
  eq('★ JPEG の幅と高さを読める（600×800）', im.readImageSize(jpg), { width: 600, height: 800, type: 'image/jpeg' });
  const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, 0,0,0,13, 0x49,0x48,0x44,0x52, 0,0,0x04,0xb0, 0,0,0x06,0x40, 8,6,0,0,0, 0,0,0,0]);
  eq('★ PNG の幅と高さを読める（1200×1600）', im.readImageSize(png), { width: 1200, height: 1600, type: 'image/png' });
  eq('★ gif は読まない（null・推測しない）', im.readImageSize(new Uint8Array([0x47,0x49,0x46,0x38,0x39,0x61, ...new Array(30).fill(0)])), null);
  eq('★ 短すぎれば null', im.readImageSize(new Uint8Array([0xff,0xd8])), null);
  eq('★ JPEG で SOF が無ければ null', im.readImageSize(new Uint8Array([0xff,0xd8,0xff,0xd9, ...new Array(30).fill(0)])), null);
}

console.log('\n── 2. 編集ページの読み取り ──');
{
  const pg = p.parsePhotoPage(editPage(), GIRL);
  eq('★ 8枠が読める', pg.slots.length, 8);
  eq('★ 枠1〜4に写真あり・5〜8は空き', pg.slots.map((s) => s.hasImage), [true,true,true,true,false,false,false,false]);
  eq('★ csrf / shopid / girl_id が取れる', [pg.csrfToken === TOKEN, pg.shopId, pg.girlId], [true, SHOP, GIRL]);
  eq('★ problems なし', pg.problems, []);
  eq('★★★ 別の子のページなら problems', p.parsePhotoPage(editPage({ girl: '9999999' }), GIRL).problems.some((x) => /別の子/.test(x)), true);
  eq('★ csrf が無ければ problems', p.parsePhotoPage(editPage({ token: '' }), GIRL).problems.some((x) => /fuel_csrf_token/.test(x)), true);
  eq('★ 枠が8つ無ければ problems', p.parsePhotoPage(editPage({ slots: 5 }), GIRL).problems.some((x) => /枠の数/.test(x)), true);
  eq('★ ログイン画面（画像の form が無い）は problems', p.parsePhotoPage(LOGIN_PAGE, GIRL).problems.length > 0, true);
  eq('★ 埋め込みの他社ログイン form を画像の form と取り違えない', pg.slots.every((s) => p.isPhotoSlot(s.slot)), true);
}
console.log('\n── 2-2. ★★★ 空き枠は「空」ではなく仮画像（2026-09-02・実物で確認）──');
eq('★★★ noimage2.jpg は【空き】', p.slotHasPhoto('https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/noimage2.jpg'), false);
eq('★ noimage.jpg も空き', p.slotHasPhoto('https://x/files.ranking-deli.jp/noimage.jpg'), false);
eq('★ 空文字も空き', p.slotHasPhoto(''), false);
eq('★ 本物の写真は【あり】', p.slotHasPhoto('https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/37168/5232204/img6_20260510224402.jpg'), true);
eq('★★ 知らない形は【あり】（送らない側に倒す）', p.slotHasPhoto('https://cdn.example.com/whatever.jpg'), true);
eq('★ 名前に noimage を含むだけの本物は【あり】（ファイル名の頭が noimage のときだけ空き）', p.slotHasPhoto('https://x/37168/5232204/img3_noimage_20260510.jpg'), true);
{
  const html = editPage({ occupied: [1, 2] }).replace(/name="image" value=""/g, 'name="image" value="https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/noimage2.jpg"');
  const pg = p.parsePhotoPage(html, GIRL);
  eq('★★★ 仮画像の入った枠を「空き」と読む（1,2 あり・3〜8 空き）', pg.slots.map((s) => s.hasImage), [true,true,false,false,false,false,false,false]);
}

console.log('\n── 3. 応答（JSON）の読み取り ──');
eq('★ src と to_thumb=1', p.parsePhotoJson('{"src":"https://s3/x.jpg","to_thumb":1,"message":""}'), { src: 'https://s3/x.jpg', toThumb: true, message: '', problems: [] });
eq('★ to_thumb=0', p.parsePhotoJson('{"src":"https://s3/x.jpg","to_thumb":0}').toThumb, false);
eq('★ src 空 + message = 断られた', p.parsePhotoJson('{"src":"","message":"10MB以下にしてください"}'), { src: '', toThumb: false, message: '10MB以下にしてください', problems: [] });
eq('★ src も message も空は problems', p.parsePhotoJson('{"src":""}').problems.length, 1);
eq('★★ JSON でなければ problems（ログイン画面など）', p.parsePhotoJson(LOGIN_PAGE).problems.length, 1);
eq('★ src が https でなければ problems', p.parsePhotoJson('{"src":"javascript:alert(1)"}').problems.length, 1);

console.log('\n── 4. 切り抜きの範囲 ──');
eq('★ 600×800 はそのまま全体（3:4）', p.centeredMainCrop(600, 800), { x: 0, y: 0, w: 600, h: 800 });
eq('★ 横長 1600×800 → 中央の 600×800', p.centeredMainCrop(1600, 800), { x: 500, y: 0, w: 600, h: 800 });
eq('★ 縦長 600×1200 → 上下を削って 600×800', p.centeredMainCrop(600, 1200), { x: 0, y: 200, w: 600, h: 800 });
eq('★ 既定のサムネイルは駅ちかの既定と同じ（60,110,180,180）', p.THUMB_DEFAULT_RECT, { x: 60, y: 110, w: 180, h: 180 });
eq('★ 既定は 300×400 に収まる', p.isValidThumbRect(p.THUMB_DEFAULT_RECT), true);
eq('★ 正方形でなければ不可', p.isValidThumbRect({ x: 0, y: 0, w: 180, h: 200 }), false);
eq('★ はみ出せば不可', p.isValidThumbRect({ x: 200, y: 0, w: 180, h: 180 }), false);
eq('★ 縦にはみ出せば不可', p.isValidThumbRect({ x: 0, y: 300, w: 180, h: 180 }), false);
eq('★ 300×400 ちょうど下端は可', p.isValidThumbRect({ x: 0, y: 100, w: 300, h: 300 }), true);

console.log('\n── 5. 項目の組み立て ──');
const ids = { girlId: GIRL, shopId: SHOP, slot: 8, csrfToken: TOKEN };
eq('★ upload の文字の項目（upfile は別に渡す）', Object.keys(p.buildUploadFields(ids)), ['image_set_id','id','edt_table','shopid','fuel_csrf_token']);
{
  const o = Object.fromEntries(p.buildMainCropFields(ids, 'https://s3/x.jpg', { x: 500, y: 0, w: 600, h: 800 }, { width: 1600, height: 800 }));
  eq('★★ 3:4 の切り抜きは sh_w/sh_h に【実寸】を入れる（比が1）', [o.sh_w, o.sh_h], ['1600', '800']);
  eq('★ edt_type=1', o.edt_type, '1');
  eq('★ x/y/w/h は実寸', [o.x, o.y, o.w, o.h], ['500','0','600','800']);
}
{
  const o = Object.fromEntries(p.buildThumbCropFields(ids, 'https://s3/y.jpg', { x: 60, y: 110, w: 180, h: 180 }));
  eq('★★ サムネイルは sh_w/sh_h を送らない（300×400 固定の空間）', 'sh_w' in o, false);
  eq('★ edt_type=2', o.edt_type, '2');
}
eq('★ 画像の外に出る切り抜きは断る', /画像の外/.test(throws(() => p.buildMainCropFields(ids, 'https://s3/x.jpg', { x: 0, y: 0, w: 700, h: 900 }, { width: 600, height: 800 }))), true);
eq('★ 収まらないサムネイルは断る', /収まって/.test(throws(() => p.buildThumbCropFields(ids, 'https://s3/x.jpg', { x: 200, y: 0, w: 180, h: 180 }))), true);
eq('★ 枠 9 は断る', /1〜8/.test(throws(() => p.buildUploadFields({ ...ids, slot: 9 }))), true);
eq('★ csrf 空は断る', /fuel_csrf_token/.test(throws(() => p.buildUploadFields({ ...ids, csrfToken: '' }))), true);
eq('★ 編集ページの URL', p.ekichikaGirlEditUrl('5232208'), 'https://ranking-deli.jp/admin/girls/edit/5232208');
eq('★ girl_id が数字でなければ断る', /不正/.test(throws(() => p.ekichikaGirlEditUrl('../admin'))), true);

console.log('\n── 6. ★★★ 状態遷移（photo_push）──');
const FILE = { bucket: 'therapist-photos', path: '41-1783435524379.jpg', filename: 'fukues_41_8.jpg', contentType: 'image/jpeg', width: 600, height: 800 };
const ctx = (o) => Object.assign({
  v: f.RELAY_FLOW_VERSION, flowId: 'F1', intent: 'photo_push', cookie: 'S=1',
  startedAt: '2026-09-02T00:00:00Z',
  photoGirlId: GIRL, photoSlot: 8, photoFile: FILE, photoStage: 'upload',
}, o || {});
const run = (purpose, o) => f.advanceFlow(Object.assign({ purpose, status: 200, headers: {}, body: '', context: ctx() }, o || {}));
const UP = 'https://ranking-deli.jp/admin/getgirls/upload.json';
const CROP = 'https://ranking-deli.jp/admin/getgirls/crop.json';

{
  const r = run('login', { status: 302, headers: { 'set-cookie': ['fuel=abc; path=/'] } });
  eq('★ login → 編集ページを読みに行く', [r.kind, r.next.purpose, r.next.method], ['next', 'read_photo_page', 'GET']);
  eq('★ 行き先は指定した girl_id の編集ページ', r.next.url, 'https://ranking-deli.jp/admin/girls/edit/' + GIRL);
  eq('★ Cookie を持ち回す', r.next.context.cookie.includes('fuel=abc'), true);
  eq('★ 段は upload から', r.next.context.photoStage, 'upload');
}
{
  const r = run('read_photo_page', { body: editPage() });
  eq('★★★ 空き枠(8)なら upload_photo を積む', [r.kind, r.next.purpose, r.next.method, r.next.url], ['next', 'upload_photo', 'POST', UP]);
  eq('★★ body は空で multipart を持つ', [r.next.body, typeof r.next.multipart], ['', 'object']);
  eq('★★★ ファイルの取り先は fukues.com の口', r.next.multipart.files[0].url.startsWith('https://fukues.com/api/relay/file?'), true);
  eq('★ 取り先に bucket と path が入る', /bucket=therapist-photos&path=41-1783435524379\.jpg/.test(r.next.multipart.files[0].url), true);
  eq('★ 項目名は upfile', r.next.multipart.files[0].field, 'upfile');
  eq('★ 文字の項目に csrf と枠が入る', [r.next.multipart.fields.fuel_csrf_token === TOKEN, r.next.multipart.fields.image_set_id], [true, '8']);
  eq('★★ multipart のときは content-type を付けない（境界は curl）', 'content-type' in r.next.headers, false);
  eq('★ X-Requested-With を付ける（jQuery の ajax と同じ）', r.next.headers['x-requested-with'], 'XMLHttpRequest');
  eq('★ 監査に read_photo_page ok', r.audits.map((a) => a.event + ':' + a.outcome), ['read_photo_page:ok']);
}
{
  const r = run('read_photo_page', { body: editPage(), context: ctx({ photoSlot: 3 }) });
  eq('★★★ 写真の入っている枠(3)には送らない（stop）', r.kind, 'stop');
  eq('★ 理由が slot_occupied', r.audits[0].detail.reason, 'slot_occupied');
  eq('★ 監査は push_photo:stopped', r.audits[0].event + ':' + r.audits[0].outcome, 'push_photo:stopped');
}
{
  const r = run('read_photo_page', { body: editPage({ girl: '7777777' }) });
  eq('★★★ 別の子のページが返ったら止める', [r.kind, r.audits[0].event], ['stop', 'read_photo_page']);
}
{
  const r = run('read_photo_page', { body: LOGIN_PAGE });
  eq('★★ ログイン画面が返ったら【ログインの失敗】として止める', [r.kind, r.audits[0].event, r.audits[0].detail.reason], ['stop', 'login', 'login_page']);
}
{
  const r = run('read_photo_page', { status: 302, headers: { location: 'https://ranking-deli.jp/admin/login' } });
  eq('★ ログインへ戻されたら止める', [r.kind, r.audits[0].detail.reason], ['stop', 'back_to_login']);
}
{
  const r = run('upload_photo', { body: '{"src":"https://s3/big.jpg","to_thumb":1}', headers: { 'set-cookie': ['fuel_csrf_token=new; path=/'] } });
  eq('★★ upload 成功 + to_thumb=1 → 編集ページを読み直してサムネイルへ', [r.kind, r.next.purpose, r.next.context.photoStage], ['next', 'read_photo_page', 'crop_thumb']);
  eq('★ src を持ち回す', r.next.context.photoSrc, 'https://s3/big.jpg');
  eq('★ 新しい Cookie を畳む', r.next.context.cookie.includes('fuel_csrf_token=new'), true);
  eq('★ 監査に push_photo ok（段は upload）', [r.audits[0].event, r.audits[0].detail.stage], ['push_photo', 'upload']);
}
eq('★★ upload 成功 + to_thumb=0 → 3:4 の切り抜きへ', run('upload_photo', { body: '{"src":"https://s3/big.jpg","to_thumb":0}' }).next.context.photoStage, 'crop_main');
{
  const r = run('upload_photo', { body: '{"src":"","message":"容量が大きすぎます"}' });
  eq('★★ 駅ちかが断ったら止める（理由つき）', [r.kind, r.audits[0].detail.reason, /容量/.test(r.audits[0].summary)], ['stop', 'upload_rejected', true]);
}
eq('★ upload の応答がログイン画面なら【ログインの失敗】', (() => { const r = run('upload_photo', { body: LOGIN_PAGE }); return [r.kind, r.audits[0].event]; })(), ['stop', 'login']);
eq('★ JSON でなければ止める', (() => { const r = run('upload_photo', { body: '<html>500</html>', status: 500 }); return [r.kind, r.audits[0].detail.reason]; })(), ['stop', 'upload_bad_response']);
{
  const r = run('read_photo_page', { body: editPage(), context: ctx({ photoStage: 'crop_main', photoSrc: 'https://s3/big.jpg', photoFile: { ...FILE, width: 1600, height: 800 } }) });
  eq('★★ 段 crop_main → crop.json へ urlencoded で', [r.kind, r.next.purpose, r.next.url, r.next.headers['content-type']], ['next', 'crop_photo', CROP, 'application/x-www-form-urlencoded']);
  eq('★ multipart は持たない', r.next.multipart, undefined);
  eq('★★ 中央の 3:4（1600×800 → x=500 w=600 h=800）・sh_w/sh_h は実寸', /x=500&y=0&w=600&h=800&edt_type=1/.test(r.next.body) && /sh_w=1600&sh_h=800/.test(r.next.body), true);
  eq('★ image に前の段の src', /image=https%3A%2F%2Fs3%2Fbig\.jpg/.test(r.next.body), true);
  eq('★ csrf は【読み直したページ】のもの', new RegExp('fuel_csrf_token=' + TOKEN).test(r.next.body), true);
}
{
  const r = run('read_photo_page', { body: editPage(), context: ctx({ photoStage: 'crop_thumb', photoSrc: 'https://s3/main.jpg' }) });
  eq('★★ 段 crop_thumb → 既定の正方形（60,110,180,180）・edt_type=2', /x=60&y=110&w=180&h=180&edt_type=2/.test(r.next.body), true);
  eq('★ sh_w/sh_h は送らない', /sh_w=/.test(r.next.body), false);
}
eq('★ 指定した正方形が使われる', /x=0&y=0&w=300&h=300/.test(run('read_photo_page', { body: editPage(), context: ctx({ photoStage: 'crop_thumb', photoSrc: 'https://s3/main.jpg', photoThumbRect: { x: 0, y: 0, w: 300, h: 300 } }) }).next.body), true);
eq('★ src が無ければ止める（前の段が飛んでいる）', (() => { const r = run('read_photo_page', { body: editPage(), context: ctx({ photoStage: 'crop_thumb' }) }); return [r.kind, r.audits[0].detail.reason]; })(), ['stop', 'no_src']);
{
  const r = run('crop_photo', { body: '{"src":"https://s3/main.jpg"}', context: ctx({ photoStage: 'crop_main', photoSrc: 'https://s3/big.jpg' }) });
  eq('★★ 3:4 が切れたら → 編集ページを読み直してサムネイルへ', [r.kind, r.next.purpose, r.next.context.photoStage, r.next.context.photoSrc], ['next', 'read_photo_page', 'crop_thumb', 'https://s3/main.jpg']);
}
{
  const r = run('crop_photo', { body: '{"src":"https://s3/thumb.jpg"}', context: ctx({ photoStage: 'crop_thumb', photoSrc: 'https://s3/main.jpg' }) });
  eq('★★★ サムネイルが切れたら done', r.kind, 'done');
  eq('★ 監査に push_photo ok（段は crop_thumb・枠8）', [r.audits[0].event, r.audits[0].outcome, r.audits[0].detail.stage, r.audits[0].detail.slot], ['push_photo', 'ok', 'crop_thumb', 8]);
  eq('★ done では次を積まない', r.next, undefined);
}
eq('★ 切り抜きを断られたら止める', (() => { const r = run('crop_photo', { body: '{"src":"","message":"範囲が不正"}', context: ctx({ photoStage: 'crop_thumb', photoSrc: 'https://s3/main.jpg' }) }); return [r.kind, r.audits[0].detail.reason]; })(), ['stop', 'crop_rejected']);
eq('★ 文脈に file が無ければ止める', (() => { const r = run('read_photo_page', { body: editPage(), context: ctx({ photoFile: undefined }) }); return [r.kind, r.audits[0].detail.reason]; })(), ['stop', 'context_missing']);

// ★★★ 通しで走らせる。★ 駅ちかへの POST は upload と crop だけ（★ 編集ページは GET で3回）
{
  const posts = [], gets = [];
  const step = (purpose, status, headers, body, c) => {
    const r = f.advanceFlow({ purpose, status, headers, body, context: c });
    if (r.kind === 'next') (r.next.method === 'POST' ? posts : gets).push(r.next.purpose);
    return r;
  };
  let r = step('login', 302, { 'set-cookie': ['a=b'] }, '', ctx({ cookie: 'S=1' }));
  r = step('read_photo_page', 200, {}, editPage(), r.next.context);
  r = step('upload_photo', 200, {}, '{"src":"https://s3/big.jpg","to_thumb":0}', r.next.context);
  r = step('read_photo_page', 200, {}, editPage(), r.next.context);
  r = step('crop_photo', 200, {}, '{"src":"https://s3/main.jpg"}', r.next.context);
  r = step('read_photo_page', 200, {}, editPage(), r.next.context);
  r = step('crop_photo', 200, {}, '{"src":"https://s3/thumb.jpg"}', r.next.context);
  eq('★★★ 通しで走ると、駅ちかへの POST は upload → crop → crop の3本だけ', posts, ['upload_photo', 'crop_photo', 'crop_photo']);
  eq('★★ 編集ページは POST の前に毎回読み直す（GET 3回）', gets, ['read_photo_page', 'read_photo_page', 'read_photo_page']);
  eq('★★★ 最後は done', r.kind, 'done');
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
