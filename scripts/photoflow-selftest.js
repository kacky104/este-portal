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
  eq('★★★ 第246便: 生の image も返る（★ 差し替えを見つけるのに要る）', pg.slots[0].image, S3 + '1_20260809230626.jpg');
  eq('★ 空き枠の image は空文字（この作り物では）', pg.slots[7].image, '');
  eq('★ 枠の形を1本の文字にできる（記録に残す用）', p.describePhotoSlots(pg.slots), '11110000');
}

console.log('\n── 2-3. ★★★★★★ 第246便: 読み直しての照合（verifyPhotoSlots）──');
{
  // ★ 送る前: 枠1〜4にあり・5〜8は空き。★ 枠8を指名した、という前提
  const before = p.parsePhotoPage(editPage(), GIRL).slots;
  const after = (occupied) => p.parsePhotoPage(editPage({ occupied }), GIRL).slots;

  eq('★★ 指名した枠8に入った・他は動かない → ok',
    p.verifyPhotoSlots(before, after([1,2,3,4,8]), 8), { ok: true, slot: 8, gotSlot: null, changed: [] });

  eq('★★★★★ 枠8を指名したのに枠5が埋まった → slot_mismatch（★ これが「詰める」の正体）',
    p.verifyPhotoSlots(before, after([1,2,3,4,5]), 8), { ok: false, reason: 'slot_mismatch', slot: 8, gotSlot: 5, changed: [5] });

  eq('★★★ 枠8にも枠5にも入った → slot_extra（★ 人が同時に触った疑い）',
    p.verifyPhotoSlots(before, after([1,2,3,4,5,8]), 8), { ok: false, reason: 'slot_extra', slot: 8, gotSlot: 5, changed: [5,8] });

  eq('★★ どこにも入っていない → not_saved',
    p.verifyPhotoSlots(before, after([1,2,3,4]), 8), { ok: false, reason: 'not_saved', slot: 8, gotSlot: null, changed: [] });

  {
    // ★★★★★★ 前から写真のあった枠3の image が変わった ＝ 店舗様の写真を壊した
    const broken = after([1,2,3,4,8]).map((s) => (s.slot === 3 ? { ...s, image: S3 + '3_29991231235959.jpg' } : s));
    eq('★★★★★★ もとから在った枠3が差し替わった → slot_overwritten（★ いちばん重い）',
      p.verifyPhotoSlots(before, broken, 8), { ok: false, reason: 'slot_overwritten', slot: 8, gotSlot: null, changed: [3] });
  }
  {
    // ★ 前から在った枠2が【消えた】のも同じ重さで扱う
    const gone = after([1,3,4,8]);
    eq('★★★★★ もとから在った枠2が消えた → slot_overwritten',
      p.verifyPhotoSlots(before, gone, 8).reason, 'slot_overwritten');
  }
  eq('★★ 照合の相手に枠が無ければ slot_missing（★ 決めつけない）',
    p.verifyPhotoSlots(before, after([1,2,3,4,8]).filter((s) => s.slot !== 8), 8).reason, 'slot_missing');
  eq('★ 判定の順は【重い順】… 壊れていれば、指名した枠に入っていても slot_overwritten',
    p.verifyPhotoSlots(before, after([1,2,4,8]), 8).reason, 'slot_overwritten');
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
eq('★ src が javascript: なら problems', p.parsePhotoJson('{"src":"javascript:alert(1)"}').problems.length, 1);
console.log('\n── 3-1. ★★★ src は【配列】で返る（2026-09-02 18:10 の実弾・bodyHead で確認）──');
eq('★★★ {"src":["https:\\/\\/s3…"]} を読める（1つ目を取る）',
  p.parsePhotoJson('{"src":["https:\\/\\/s3-ap-northeast-1.amazonaws.com\\/files.ranking-deli.jp\\/37168\\/5232204\\/img8_20260902181004.jpg"],"to_thumb":1}'),
  { src: 'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/37168/5232204/img8_20260902181004.jpg', toThumb: true, message: '', problems: [] });
eq('★ to_thumb も配列なら1つ目', p.parsePhotoJson('{"src":["https://s3/x.jpg"],"to_thumb":[1]}').toThumb, true);
eq('★ message が配列でも読める', p.parsePhotoJson('{"src":[],"message":["容量オーバー"]}'), { src: '', toThumb: false, message: '容量オーバー', problems: [] });
eq('★ 空の配列は src 空（断られた扱い・message が無ければ problems）', p.parsePhotoJson('{"src":[]}').problems.length, 1);
eq('★ 配列の中が文字でなければ空', p.parsePhotoJson('{"src":[123],"message":"x"}').src, '');
console.log('\n── 3-2. ★★★ 駅ちかが返した src は【そのまま】返す（2026-09-02 の実弾で分かった）──');
eq('★★★ 相対パスの src も受ける（https を条件にしない）', p.parsePhotoJson('{"src":"/files/37168/5232204/img8_20260902174406.jpg","to_thumb":1}'), { src: '/files/37168/5232204/img8_20260902174406.jpg', toThumb: true, message: '', problems: [] });
eq('★ http の src も受ける', p.parsePhotoJson('{"src":"http://s3/x.jpg"}').problems, []);
eq('★ 拡張子の無い src も受ける（決めつけない）', p.parsePhotoJson('{"src":"https://s3/x"}').problems, []);
eq('★ data: は断る', p.parsePhotoJson('{"src":"data:image/png;base64,AAAA"}').problems.length, 1);
eq('★ 空白入りは断る', p.parsePhotoJson('{"src":"https://s3/x y.jpg"}').problems.length, 1);
eq('★ 引用符入りは断る（form に混ぜない）', p.parsePhotoJson('{"src":"https://s3/x\\"y.jpg"}').problems.length, 1);
eq('★ 切り抜きの image にも相対パスをそのまま渡せる', Object.fromEntries(p.buildThumbCropFields({ girlId: GIRL, shopId: SHOP, slot: 8, csrfToken: TOKEN }, '/files/a/b.jpg', { x: 60, y: 110, w: 180, h: 180 })).image, '/files/a/b.jpg');
eq('★ 切り抜きの image に javascript: は渡せない', /危ない/.test(throws(() => p.buildThumbCropFields({ girlId: GIRL, shopId: SHOP, slot: 8, csrfToken: TOKEN }, 'javascript:x', { x: 60, y: 110, w: 180, h: 180 }))), true);

console.log('\n── 4. 切り抜きの範囲 ──');
eq('★ 600×800 はそのまま全体（3:4）', p.centeredMainCrop(600, 800), { x: 0, y: 0, w: 600, h: 800 });
eq('★ 横長 1600×800 → 中央の 600×800', p.centeredMainCrop(1600, 800), { x: 500, y: 0, w: 600, h: 800 });
eq('★ 縦長 600×1200 → 上下を削って 600×800', p.centeredMainCrop(600, 1200), { x: 0, y: 200, w: 600, h: 800 });
eq('★★ 既定のサムネイルは【上寄せ】（60,0,180,180）。★ 実弾で中央だと胴体だけになった（2026-09-02）', p.THUMB_DEFAULT_RECT, { x: 60, y: 0, w: 180, h: 180 });
eq('★ 駅ちかの既定（中央）は参考として残す', p.EKICHIKA_THUMB_CENTER_RECT, { x: 60, y: 110, w: 180, h: 180 });
eq('★ 上寄せは 300×400 に収まる', p.isValidThumbRect(p.THUMB_DEFAULT_RECT), true);
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
  eq('★★★ 第246便: 送る前の枠の形を文脈に覚える', r.next.context.photoSlotsBefore.map((s) => s.slot), [1,2,3,4,5,6,7,8]);
  eq('★★ 記録にも枠の形を残す', r.audits[0].detail.before, '11110000');
}
{
  // ★★★★★★ 第246便・案A: 枠1（トップ画像）が空きの方には送らない
  const r = run('read_photo_page', { body: editPage({ occupied: [2, 3, 4] }) });
  eq('★★★★★★ 枠1が空きなら送らない（stop）', r.kind, 'stop');
  eq('★ 理由が slot1_empty', r.audits[0].detail.reason, 'slot1_empty');
  eq('★ 監査は push_photo:stopped', r.audits[0].event + ':' + r.audits[0].outcome, 'push_photo:stopped');
  eq('★★ 枠1が埋まっていれば、これまでどおり送る', run('read_photo_page', { body: editPage({ occupied: [1] }) }).next.purpose, 'upload_photo');
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
  eq('★★ 段 crop_thumb → 既定の正方形は上寄せ（60,0,180,180）・edt_type=2', /x=60&y=0&w=180&h=180&edt_type=2/.test(r.next.body), true);
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
  // ★★★★★★ 第246便: ここで done にしない。★ 読み直して照合するまで成否を名乗らない
  eq('★★★★★★ サムネイルが切れたら【照合】へ（★ done にしない）', [r.kind, r.next.purpose, r.next.context.photoStage], ['next', 'read_photo_page', 'verify']);
  eq('★★★ この段では push_photo ok を出さない（★ 応答で判定しない・第46便 §35）', r.audits.map((a) => a.event), ['read_photo_page']);
}

console.log('\n── 6-2. ★★★★★★ 第246便: 照合の段（verify）──');
const SLOTS_BEFORE = p.parsePhotoPage(editPage(), GIRL).slots;
const vctx = (o) => ctx(Object.assign({ photoStage: 'verify', photoSrc: 'https://s3/thumb.jpg', photoSlotsBefore: SLOTS_BEFORE }, o || {}));
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,3,4,8] }), context: vctx() });
  eq('★★★ 指名した枠8に入っていれば done', r.kind, 'done');
  eq('★ 監査は push_photo ok', [r.audits[0].event, r.audits[0].outcome], ['push_photo', 'ok']);
  eq('★★ 申告に「読み直して確かめました」が入る', /読み直して確かめました/.test(r.audits[0].summary), true);
  eq('★ 前と後の枠の形を記録に残す', [r.audits[0].detail.before, r.audits[0].detail.after], ['11110000', '11110001']);
  eq('★ done では次を積まない', r.next, undefined);
}
{
  // ★★★ 第271便: 登録の流れ（girl_create・照合済み）から来た写真は、照合が通ったら**名簿の読み直し**へ続く
  //   ★ 運営の口（photo_push）は上のとおり done のまま
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,3,4,8] }),
    context: vctx({ intent: 'girl_create', createStage: 'verify' }) });
  eq('★★★ 登録の流れなら、写真の照合のあと名簿の読み直しへ', [r.kind, r.next && r.next.purpose, r.next && r.next.context.createRosterRefresh], ['next', 'read_girls', true]);
  eq('★★★ 「できました」はこの時点で記録', [r.audits[0].event, r.audits[0].outcome], ['push_photo', 'ok']);
  const ng = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,3,4,5] }),
    context: vctx({ intent: 'girl_create', createStage: 'verify' }) });
  eq('★★ 登録の流れでも、照合で外れたら止まる（読み直しを重ねない）', [ng.kind, ng.next], ['stop', undefined]);
}
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,3,4,5] }), context: vctx() });
  eq('★★★★★★ 枠8を指名したのに枠5に入っていたら止める', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'failed', 'slot_mismatch']);
  eq('★★ どの枠に入ったかを記録に残す（gotSlot）', r.audits[0].detail.gotSlot, 5);
  eq('★★★ 申告は「入っていない」と言い切らず、入った枠を伝える', /枠5に入りました/.test(r.audits[0].summary), true);
}
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,3,4] }), context: vctx() });
  eq('★★★ どこにも入っていなければ not_saved で止める', [r.kind, r.audits[0].detail.reason], ['stop', 'not_saved']);
  eq('★★ 申告は「別の枠に入っていないか」を促す', /別の枠/.test(r.audits[0].summary), true);
}
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,4,8] }), context: vctx() });
  eq('★★★★★★ もとから在った枠3が消えていたら slot_overwritten で止める', [r.kind, r.audits[0].detail.reason], ['stop', 'slot_overwritten']);
  eq('★ 変わった枠を記録に残す', r.audits[0].detail.changed, '3');
}
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,3,4,5,8] }), context: vctx() });
  eq('★★★ 枠8にも枠5にも入っていたら slot_extra で止める', [r.kind, r.audits[0].detail.reason], ['stop', 'slot_extra']);
}
eq('★★★ 送る前の枠の形が無いまま照合に来たら止める（★ 決めつけない）',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1,2,3,4,8] }), context: vctx({ photoSlotsBefore: undefined }) }); return [r.kind, r.audits[0].detail.reason]; })(),
  ['stop', 'context_missing']);
eq('★★ 照合の段でログイン画面が返ったら【ログインの失敗】として止める',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: LOGIN_PAGE, context: vctx() }); return [r.kind, r.audits[0].event]; })(),
  ['stop', 'login']);
eq('★★★ 照合の段で別の子のページが返ったら止める',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ girl: '7777777', occupied: [1,2,3,4,8] }), context: vctx() }); return r.kind; })(),
  'stop');
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
  // ★★★★★★ 第246便: ここで終わらない。★ もう一度読み直して照合する
  r = step('read_photo_page', 200, {}, editPage({ occupied: [1, 2, 3, 4, 8] }), r.next.context);
  eq('★★★ 通しで走ると、駅ちかへの POST は upload → crop → crop の3本だけ', posts, ['upload_photo', 'crop_photo', 'crop_photo']);
  eq('★★ 編集ページは POST の前に毎回読み直す ＋ 最後に照合（GET 4回）', gets, ['read_photo_page', 'read_photo_page', 'read_photo_page', 'read_photo_page']);
  eq('★★★ 最後は done', r.kind, 'done');
  eq('★★★★★ 通しの最後の申告は【照合の結果】', [r.audits[0].event, r.audits[0].outcome, /読み直して確かめました/.test(r.audits[0].summary)], ['push_photo', 'ok', true]);
}

// ★★★★★★ 通しで走らせる（★ 相手が詰めた場合）。★ 第244便のエステ魂と同じ形を模す
{
  const step = (purpose, body, c) => f.advanceFlow({ purpose, status: 200, headers: {}, body, context: c });
  let r = step('login', '', ctx({ cookie: 'S=1' }));
  r = step('read_photo_page', editPage(), r.next.context);
  r = step('upload_photo', '{"src":"https://s3/big.jpg","to_thumb":1}', r.next.context);
  r = step('read_photo_page', editPage(), r.next.context);
  r = step('crop_photo', '{"src":"https://s3/thumb.jpg"}', r.next.context);
  // ★ 枠8を指名したのに、相手はいちばん小さい空き枠（5）へ詰めた
  r = step('read_photo_page', editPage({ occupied: [1, 2, 3, 4, 5] }), r.next.context);
  eq('★★★★★★ 相手が詰めたら、通しの最後で止まる（★ 嘘の成功を出さない）', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'failed', 'slot_mismatch']);
  eq('★★★ 詰められた先が記録に残る', r.audits[0].detail.gotSlot, 5);
}

console.log('\n── 6-3. ★★★★★ 第248便: 読むだけ（probe）──');
// ★★★ この段は【1文字も書かない】。★ 設計メモ §8 ④（登録直後の子にも画像枠があるか）を実弾ゼロで測る道具。
const pctx = (o) => ctx(Object.assign({ photoStage: 'probe' }, o || {}));
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage(), context: pctx() });
  eq('★★★★★ probe は読んで終わり（done・次を積まない）', [r.kind, r.next], ['done', undefined]);
  eq('★ 監査は read_photo_page ok', [r.audits[0].event, r.audits[0].outcome], ['read_photo_page', 'ok']);
  eq('★★ 枠の形を記録に残す', r.audits[0].detail.shape, '11110000');
  eq('★★ まっさらかどうかも残す（blank）', r.audits[0].detail.blank, false);
  eq('★★★ 申告に「1枚も送っていません」と書く', /1枚も送っていません/.test(r.audits[0].summary), true);
}
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: pctx() });
  eq('★★★★ 8枠すべて空きなら blank（★ 登録直後の方の形）', [r.audits[0].detail.shape, r.audits[0].detail.blank], ['00000000', true]);
}
{
  // ★★★ probe は【送る写真も枠の指定も要らない】。★ 要求すると、写真の無い方を測れなくなる
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage(), context: pctx({ photoSlot: undefined, photoFile: undefined }) });
  eq('★★★ probe は枠も写真も無しで通る', [r.kind, r.audits[0].detail.shape], ['done', '11110000']);
}
eq('★★ probe でも別の子のページが返ったら止める',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ girl: '7777777' }), context: pctx() }); return [r.kind, r.audits[0].event]; })(),
  ['stop', 'read_photo_page']);
eq('★★ probe でログイン画面が返ったら【ログインの失敗】として止める',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: LOGIN_PAGE, context: pctx() }); return [r.kind, r.audits[0].event]; })(),
  ['stop', 'login']);
{
  // ★★★★★★ 通しで走らせる（probe）。★ 駅ちかへの POST が【1本も無い】ことを数で固定する
  const posts = [];
  const step = (purpose, status, headers, body, c) => {
    const r = f.advanceFlow({ purpose, status, headers, body, context: c });
    if (r.kind === 'next' && r.next.method === 'POST') posts.push(r.next.purpose);
    return r;
  };
  let r = step('login', 302, { 'set-cookie': ['a=b'] }, '', pctx({ cookie: 'S=1' }));
  eq('★ login のあとも段は probe のまま', r.next.context.photoStage, 'probe');
  r = step('read_photo_page', 200, {}, editPage({ occupied: [] }), r.next.context);
  eq('★★★★★★ probe の通しで駅ちかへの POST は【0本】', posts, []);
  eq('★★★ 通しの最後は done', r.kind, 'done');
}

console.log('\n── 6-4. ★★★★★★ 第248便: 枠1（トップ画像）へ入れる（top）──');
// ★★★ 通すのは【8枠すべて空き】のときだけ。★ 壊せる写真が1枚も無い方（＝登録直後の方）に限る。
// ★★ 「枠1だけ空き」では通さない … その方は写真を持っている既存の方かもしれない（設計メモ 追記 K-5）。
const tctx = (o) => ctx(Object.assign({ photoSlot: 1, photoTop: true }, o || {}));
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: tctx() });
  eq('★★★★★★ 8枠すべて空き＋top なら枠1へ送る', [r.kind, r.next.purpose], ['next', 'upload_photo']);
  eq('★★★ 送り先の枠は1', r.next.multipart.fields.image_set_id, '1');
  eq('★★ 送る前の枠の形は 00000000', r.audits[0].detail.before, '00000000');
}
{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [2, 3, 4] }), context: tctx() });
  eq('★★★★★★ 枠1だけ空きでは通さない（slot1_not_blank）', [r.kind, r.audits[0].detail.reason], ['stop', 'slot1_not_blank']);
  eq('★ 監査は push_photo:stopped', r.audits[0].event + ':' + r.audits[0].outcome, 'push_photo:stopped');
}
eq('★★★ 1枠でも埋まっていたら通さない（★ 枠8だけ埋まりでも）',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [8] }), context: tctx() }); return [r.kind, r.audits[0].detail.reason]; })(),
  ['stop', 'slot1_not_blank']);
eq('★★★★★ top なのに枠1以外を指名していたら送らない（top_not_slot1）',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: tctx({ photoSlot: 8 }) }); return [r.kind, r.audits[0].detail.reason]; })(),
  ['stop', 'top_not_slot1']);
eq('★★★★★★ top を書かなければ振る舞いは1つも変わらない（★ まっさらでも slot1_empty で止まる）',
  (() => { const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: ctx({ photoSlot: 8 }) }); return [r.kind, r.audits[0].detail.reason]; })(),
  ['stop', 'slot1_empty']);
{
  // ★★★★★★ 通しで走らせる（枠1）。★ 照合まで通ることを固定する
  let r = f.advanceFlow({ purpose: 'login', status: 302, headers: { 'set-cookie': ['a=b'] }, body: '', context: tctx({ cookie: 'S=1' }) });
  r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: r.next.context });
  r = f.advanceFlow({ purpose: 'upload_photo', status: 200, headers: {}, body: '{"src":"https://s3/big.jpg","to_thumb":1}', context: r.next.context });
  r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: r.next.context });
  r = f.advanceFlow({ purpose: 'crop_photo', status: 200, headers: {}, body: '{"src":"https://s3/thumb.jpg"}', context: r.next.context });
  r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1] }), context: r.next.context });
  eq('★★★★★ 枠1の通しは照合まで行って done', [r.kind, r.audits[0].event, r.audits[0].outcome], ['done', 'push_photo', 'ok']);
  eq('★★★ 前と後の枠の形が記録に残る', [r.audits[0].detail.before, r.audits[0].detail.after], ['00000000', '10000000']);
}
eq('★★★★★★ まっさらなのに枠1以外へ入っていたら、照合で止まる',
  (() => {
    let r = f.advanceFlow({ purpose: 'login', status: 302, headers: { 'set-cookie': ['a=b'] }, body: '', context: tctx({ cookie: 'S=1' }) });
    r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: r.next.context });
    r = f.advanceFlow({ purpose: 'upload_photo', status: 200, headers: {}, body: '{"src":"https://s3/big.jpg","to_thumb":1}', context: r.next.context });
    r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: r.next.context });
    r = f.advanceFlow({ purpose: 'crop_photo', status: 200, headers: {}, body: '{"src":"https://s3/thumb.jpg"}', context: r.next.context });
    r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [3] }), context: r.next.context });
    return [r.kind, r.audits[0].detail.reason, r.audits[0].detail.gotSlot];
  })(),
  ['stop', 'slot_mismatch', 3]);


console.log('\n── 6-5. ★★★★★★ 第253便: 2枚目以降をまとめて送る（枠2〜5・番号固定）──');
// ★★★ この段の芯は3つ。★ 数で固定する。
//   ① 対応づけは【番号固定】… 埋まっている枠は【その1枚だけ飛ばす】。★ 他の枚の行き先はずらさない
//   ② **単発では今までどおり止める**（slot_occupied）。★ 複数枚（photoMulti）のときだけ飛ばす
//   ③ 照合が外れたら【残りは送らない】

const FILE_N = (n) => ({ bucket: 'therapist-photos', path: '41-p' + n + '.jpg', filename: 'fukues_41_' + n + '.jpg', contentType: 'image/jpeg', width: 600, height: 800 });
const Q = (slots) => slots.map((n) => ({ slot: n, file: FILE_N(n), thumbRect: { x: 60, y: 0, w: 180, h: 180 } }));
// ★ 複数枚の文脈: 1枚目は枠2、残りは列に積む。★ 枠1は埋まっている方（＝掲載中の方）が相手
const mctx = (o) => ctx(Object.assign({ photoSlot: 2, photoFile: FILE_N(2), photoMulti: true, photoQueue: Q([3, 4]) }, o || {}));

{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1] }), context: mctx() });
  eq('★★ 枠2が空きなら枠2へ送る（★ 1枚目）', [r.kind, r.kind === 'next' && r.next.purpose, r.kind === 'next' && r.next.multipart.fields.image_set_id], ['next', 'upload_photo', '2']);
  eq('★ 列は2枚残っている', r.next.context.photoQueue.map((q) => q.slot), [3, 4]);
  eq('★ 送る前の枠の形を覚える', r.next.context.photoSlotsBefore.length, 8);
}
{
  // ★★★★★★ ①番号固定: 枠2が埋まっていたら【枠2の1枚だけ】飛ばして、次は枠3へ
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1, 2] }), context: mctx() });
  eq('★★★★★★ 埋まっている枠は飛ばして次の1枚へ', [r.kind, r.kind === 'next' && r.next.multipart.fields.image_set_id], ['next', '3']);
  eq('★★★ 飛ばした枠が文脈に残る', r.next.context.photoSkippedSlots, [2]);
  eq('★★ 飛ばした枠は記録にも残る（★ 黙って落とさない）', r.audits[0].detail.skipped, '2');
  eq('★★★ 送るファイルも枠3のものに入れ替わる', r.next.multipart.files[0].filename, 'fukues_41_3.jpg');
  eq('★ 列は枠4だけになる', r.next.context.photoQueue.map((q) => q.slot), [4]);
}
{
  // ★★ 続けて2つ埋まっていても、飛ばすのはその2枚だけ（★ 枠4へ）
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1, 2, 3] }), context: mctx() });
  eq('★★★ 2つ埋まっていたら2つ飛ばす', [r.next.multipart.fields.image_set_id, r.next.context.photoSkippedSlots], ['4', [2, 3]]);
}
{
  // ★★★★★ 送れる枠が1つも無い ＝ **失敗ではない**（★ 店舗様の写真が既に入っている）
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1, 2, 3, 4] }), context: mctx() });
  eq('★★★★ 送れる空き枠が無ければ done（★ failed にしない）', [r.kind, r.audits[0].event, r.audits[0].outcome], ['done', 'push_photo', 'ok']);
  eq('★★★ まとめに「飛ばした枠」が並ぶ', [r.audits[0].detail.count, r.audits[0].detail.skipped, r.audits[0].detail.put], [0, '2,3,4', null]);
}
{
  // ★★★★★★ ②単発では今までどおり止める。★ 意味を変えない
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1, 2] }), context: ctx({ photoSlot: 2, photoFile: FILE_N(2) }) });
  eq('★★★★★★ 単発（photoMulti 無し）は slot_occupied で止まる', [r.kind, r.audits[0].detail.reason], ['stop', 'slot_occupied']);
}
{
  // ★★★ 列があっても photoMulti が無ければ飛ばさない（★ 印が無いのに勝手に振る舞いを変えない）
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [1, 2] }), context: ctx({ photoSlot: 2, photoFile: FILE_N(2), photoQueue: Q([3]) }) });
  eq('★★★★★ photoMulti が無ければ列があっても飛ばさない', [r.kind, r.audits[0].detail.reason], ['stop', 'slot_occupied']);
}

// ── ★★★★★★ 通し（枠2 → 枠3 → 枠4）。★ 1枚ごとに読み直して照合する ──
const oneShot = (context, occupiedBefore, occupiedAfter) => {
  let r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: occupiedBefore }), context });
  if (r.kind !== 'next') return r;
  r = f.advanceFlow({ purpose: 'upload_photo', status: 200, headers: {}, body: '{"src":"https://s3/big.jpg","to_thumb":1}', context: r.next.context });
  r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: occupiedBefore }), context: r.next.context });
  r = f.advanceFlow({ purpose: 'crop_photo', status: 200, headers: {}, body: '{"src":"https://s3/thumb.jpg"}', context: r.next.context });
  return f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: occupiedAfter }), context: r.next.context });
};
{
  const r1 = oneShot(mctx(), [1], [1, 2]);
  // ★★ r1.next を直に触らない … 壊れたとき例外で落ちると【何が違ったか】が読めない（第250便 §4）
  const nx = (r) => (r.kind === 'next' ? r.next : null);
  eq('★★★★★ 1枚目（枠2）が入ったら、次は枠3へもう一周', [r1.kind, nx(r1) && nx(r1).purpose, nx(r1) && nx(r1).context.photoSlot], ['next', 'read_photo_page', 3]);
  eq('★★ 1枚ごとの記録は今までどおり残る', [r1.audits[0].event, r1.audits[0].outcome, r1.audits[0].detail.before, r1.audits[0].detail.after], ['push_photo', 'ok', '10000000', '11000000']);
  eq('★★★ 入れ終わった枠を数えている', nx(r1) && nx(r1).context.photoPut, [2]);
  eq('★★★★★★ 前の1枚の残りかすを持ち越さない（src と照合の相手）', [nx(r1) && ('photoSrc' in nx(r1).context && nx(r1).context.photoSrc !== undefined), nx(r1) && nx(r1).context.photoSlotsBefore !== undefined], [false, false]);
  eq('★★★ 次の1枚のファイルに入れ替わっている', nx(r1) && nx(r1).context.photoFile.filename, 'fukues_41_3.jpg');
  eq('★ 段は upload に戻る', nx(r1) && nx(r1).context.photoStage, 'upload');

  const r2 = oneShot(nx(r1) ? nx(r1).context : mctx(), [1, 2], [1, 2, 3]);
  eq('★★ 2枚目（枠3）も入って、次は枠4へ', [r2.kind, nx(r2) && nx(r2).context.photoSlot, nx(r2) && nx(r2).context.photoPut], ['next', 4, [2, 3]]);

  const r3 = oneShot(nx(r2) ? nx(r2).context : mctx(), [1, 2, 3], [1, 2, 3, 4]);
  eq('★★★★★★ 3枚目（枠4）で列が尽きたら done', [r3.kind, r3.audits.length], ['done', 2]);
  eq('★★ 1本目は最後の1枚の記録', [r3.audits[0].detail.slot, r3.audits[0].detail.after], [4, '11110000']);
  eq('★★★★★★ 2本目は【まとめ】。★ 何枚どこへ入ったかが1行で分かる', [r3.audits[1].detail.count, r3.audits[1].detail.put, r3.audits[1].detail.skipped], [3, '2,3,4', null]);
  eq('★ まとめの文にも枠が並ぶ', r3.audits[1].summary, '駅ちかへ写真を3枚送りました（枠 2・3・4）');
}
{
  // ★★★★★★ ③照合が外れたら、残りは送らない
  const r = oneShot(mctx(), [1], [1, 5]);   // ★ 枠2へ送ったのに枠5が埋まった ＝ 詰められた
  eq('★★★★★★ 照合が外れたら止まる（★ 残りの枠3・4は送らない）', [r.kind, r.audits[0].detail.reason, r.audits[0].detail.gotSlot], ['stop', 'slot_mismatch', 5]);
  eq('★★★ 送らなかった枠を記録に残す', r.audits[0].detail.notSent, '3,4');
}
{
  // ★★ 飛ばしたあとに照合が外れたときも、飛ばした枠は残る
  const c = mctx();
  const r = oneShot(Object.assign({}, c, { photoSkippedSlots: [2] , photoSlot: 3, photoFile: FILE_N(3), photoQueue: Q([4]) }), [1, 2], [1, 2, 6]);
  eq('★★ 飛ばした枠は失敗の記録にも残る', [r.kind, r.audits[0].detail.skipped, r.audits[0].detail.notSent], ['stop', '2', '4']);
}
{
  // ★★★★★ 枠1が空きの方には、複数枚でも送らない（slot1_empty は効いたまま）
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: mctx() });
  eq('★★★★★★ 複数枚でも slot1_empty は効く（★ 枠1が空きなら1枚も送らない）', [r.kind, r.audits[0].detail.reason], ['stop', 'slot1_empty']);
}



console.log('\n── 6-6. ★★★★★★ 第255便: 登録の流れ（枠1 top）から2枚目以降へ繋ぐ ──');
// ★★★★★★ この段の芯はただ1つ … **photoTop は【枠1の1枚目】だけの合図**。
//   ★ 次の1枚へ持ち越すと、枠2の upload で top_not_slot1 に当たって【2枚目以降が1枚も入らない】。
//   ★★ 第253便までは all と top を混ぜなかったので出なかった。★ 繋いだ瞬間に出る種類の壊れ方。
//   → ★ 第249便 §2「繋ぐ前に、繋ぎ先が何を前提にしているかを読む」と同じ形。

const tqctx = (o) => ctx(Object.assign({ photoSlot: 1, photoTop: true, photoFile: FILE_N(1), photoMulti: true, photoQueue: Q([2, 3]) }, o || {}));
const nx2 = (r) => (r.kind === 'next' ? r.next : null);

{
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [] }), context: tqctx() });
  eq('★★ まっさら（8枠すべて空き）なら枠1へ送る', [r.kind, r.kind === 'next' && r.next.multipart.fields.image_set_id], ['next', '1']);
  eq('★ 列は2枚残っている', r.kind === 'next' && r.next.context.photoQueue.map((q) => q.slot), [2, 3]);
}
{
  // ★★★ 1枠でも埋まっていたら枠1へは送らない（★ top の止めは列があっても効く）
  const r = f.advanceFlow({ purpose: 'read_photo_page', status: 200, headers: {}, body: editPage({ occupied: [5] }), context: tqctx() });
  eq('★★★★★ 列があっても slot1_not_blank は効く', [r.kind, r.audits[0].detail.reason], ['stop', 'slot1_not_blank']);
}
{
  const r1 = oneShot(tqctx(), [], [1]);
  eq('★★★★★ 枠1（トップ画像）が入ったら、次は枠2へ', [r1.kind, nx2(r1) && nx2(r1).context.photoSlot], ['next', 2]);
  eq('★★★★★★ photoTop を次の1枚へ持ち越さない', nx2(r1) && nx2(r1).context.photoTop !== true, true);
  eq('★★ 1枚目の記録は今までどおり', [r1.audits[0].detail.slot, r1.audits[0].detail.before, r1.audits[0].detail.after], [1, '00000000', '10000000']);

  // ★★★ 文脈だけでなく【通しで枠2へ入れる】ところまで見る（★ 止まらないことの確認）
  const r2 = oneShot(nx2(r1) ? nx2(r1).context : tqctx(), [1], [1, 2]);
  eq('★★★★★★ 枠2は top_not_slot1 で止まらず、入って次は枠3へ', [r2.kind, nx2(r2) && nx2(r2).context.photoSlot], ['next', 3]);
  eq('★★ 2枚目の記録', [r2.audits[0].detail.slot, r2.audits[0].detail.before, r2.audits[0].detail.after], [2, '10000000', '11000000']);

  const r3 = oneShot(nx2(r2) ? nx2(r2).context : tqctx(), [1, 2], [1, 2, 3]);
  eq('★★★★★ 枠3で列が尽きて done', [r3.kind, r3.audits.length], ['done', 2]);
  eq('★★★★★★ まとめは【枠1から3枚】', [r3.audits[1].detail.count, r3.audits[1].detail.put], [3, '1,2,3']);
  eq('★ まとめの文', r3.audits[1].summary, '駅ちかへ写真を3枚送りました（枠 1・2・3）');
}
{
  // ★★★★★ 列を渡さなければ、登録の流れは第254便までと1文字も変わらない
  const r = oneShot(ctx({ photoSlot: 1, photoTop: true, photoFile: FILE_N(1) }), [], [1]);
  eq('★★★★★★ 列が無ければ枠1の1枚で done（★ まとめも出さない）', [r.kind, r.audits.length, r.audits[0].detail.after], ['done', 1, '10000000']);
}


console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
