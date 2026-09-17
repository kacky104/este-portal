// コネックエフの写真を駅ちかの枠へ合わせる（relayFlow.ts の photoSync・第421便）の自己点検。
//   ★ 守ること: ① 埋まった枠は【消して→読み直して「その枠だけ空いた」を確かめて】から入れる
//              ② 照合が外れたら残りは送らない ③ remove は空なら記録だけ ④ 終わったら次の人へ（写真の道を持ち越さない）
//   使い方:  npm run check:photosync
const path = require('path');
const f = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));
const p = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaPhoto.js'));
let fail = 0;
const eq = (name, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name); };

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

const FILE = (n) => ({ bucket: 'therapist-photos', path: 'c/' + n + '.jpg', filename: 'fukues_25_' + n + '.jpg', contentType: 'image/jpeg', width: 600, height: 800 });
const base = (o) => Object.assign({
  v: f.RELAY_FLOW_VERSION, flowId: 'F1', intent: 'girl_edit', cookie: 'S=1', startedAt: '2026-09-17T00:00:00Z',
  editCastId: GIRL, editName: 'るう', editValues: {}, editApply: true, editTherapistId: 25,
}, o || {});
const run = (purpose, ctx, o) => f.advanceFlow(Object.assign({ purpose, status: 200, headers: {}, body: '', context: ctx }, o || {}));

console.log('── 1. 削除の項目（ブラウザと同じ）──');
eq('★ image_id は 1・枠は image_set_id', p.buildDeleteFields({ girlId: GIRL, shopId: SHOP, slot: 3, csrfToken: 't' }),
  [['image_set_id', '3'], ['shopid', SHOP], ['id', GIRL], ['fuel_csrf_token', 't'], ['image_id', '1'], ['girl_id', GIRL]]);

console.log('── 2. 消したあとの照合 ──');
eq('★ 壊れた枠を見分ける', [p.slotLooksBroken(S3 + '2_.jpg'), p.slotLooksBroken(S3 + '2s_.jpg?1'), p.slotLooksBroken(S3 + '2_20260917.jpg')], [true, true, false]);
const pg = (occ) => p.parsePhotoPage(editPage({ occupied: occ }), GIRL).slots;
eq('★ その枠だけ空けば ok', p.verifyPhotoDeleted(pg([1, 2, 3]), pg([1, 2]), 3), null);
eq('★ 消えていない', p.verifyPhotoDeleted(pg([1, 2, 3]), pg([1, 2, 3]), 3).reason, 'not_deleted');
eq('★★ ほかの枠も変わった', p.verifyPhotoDeleted(pg([1, 2, 3]), pg([1]), 3), { reason: 'other_changed', changed: [2] });

console.log('── 3. プロフィールのあと写真へ ──');
const ops = [
  { slot: 1, action: 'put', sourceUrl: 'https://x/1.jpg', file: FILE(1) },
  { slot: 2, action: 'put', sourceUrl: 'https://x/2.jpg', file: FILE(2) },
  { slot: 5, action: 'remove', sourceUrl: null },
  { slot: 6, action: 'remove', sourceUrl: null },
];
const q2 = { castId: '999', name: 'さら', values: {}, therapistId: 26, photos: [{ slot: 1, action: 'put', sourceUrl: 'https://x/s.jpg', file: FILE(9) }] };
const r0 = run('girl_edit_form', base({ editPhotos: ops, editQueue: [q2] }), { status: 500 });
eq('★ プロフィールが止まっても写真へ進む', [r0.kind, r0.next && r0.next.purpose, r0.next && r0.next.context.photoStage], ['next', 'read_photo_page', 'sync']);
eq('記録にプロフィールの止まりも残る', r0.audits[0].event, 'edit_girl');
const noApply = run('girl_edit_form', base({ editPhotos: ops, editApply: undefined }), { status: 500 });
eq('★ apply でなければ写真へ行かない', noApply.kind, 'stop');
const lost = run('girl_edit_form', base({ editPhotos: ops }), { status: 302, headers: { location: 'https://ranking-deli.jp/admin/login' } });
eq('★ ログインが切れていたら行かない', lost.kind, 'stop');

let c = r0.next.context;
console.log('── 4. 枠1は埋まっている → 消さずに上書き ──');
const r1 = run('read_photo_page', c, { body: editPage({ occupied: [1, 3, 5] }) });
eq('★★ 削除は送らず、そのまま入れる', [r1.kind, r1.next.purpose, r1.next.context.photoSlot, r1.next.context.photoStage], ['next', 'upload_photo', 1, 'upload']);
c = r1.next.context;
const S3X = (n) => S3 + n + '_NEW.jpg';
const pageNew1 = editPage({ occupied: [1, 3, 5] }).replace(S3 + '1_20260809230626.jpg', S3X(1));
const bad = run('read_photo_page', Object.assign({}, c, { photoStage: 'verify', photoSrc: 'x', editQueue: [] }), { body: editPage({ occupied: [1, 3, 5] }) });
eq('★★ 入れ替わっていなければ止める', [bad.kind, bad.audits[0].detail.reason], ['stop', 'not_saved']);
const bad2 = run('read_photo_page', Object.assign({}, c, { photoStage: 'verify', photoSrc: 'x', editQueue: [] }), { body: editPage({ occupied: [1, 5] }).replace(S3 + '1_20260809230626.jpg', S3X(1)) });
eq('★★ ほかの枠（3）が変わっていたら止める', [bad2.kind, bad2.audits[0].detail.reason], ['stop', 'slot_extra']);

console.log('── 5. 入れて照合 → 次の枠 ──');
const r4 = run('read_photo_page', Object.assign({}, c, { photoStage: 'verify', photoSrc: 'https://s3/x.jpg' }), { body: pageNew1 });
eq('★ 入れ替えの記録', [r4.audits[0].detail.replaced, r4.photoSynced], [true, [{ therapistId: 25, imageSlot: 1, sourceUrl: 'https://x/1.jpg' }]]);
eq('★ 枠2は空き → そのまま入れる', [r4.kind, r4.next.purpose, r4.next.context.photoSlot], ['next', 'upload_photo', 2]);
c = Object.assign({}, r4.next.context, { photoStage: 'verify', photoSrc: 'https://s3/y.jpg' });
const r5 = run('read_photo_page', c, { body: editPage({ occupied: [1, 2, 3, 5] }).replace(S3 + '1_20260809230626.jpg', S3X(1)) });
eq('★ 枠2の記録', r5.photoSynced, [{ therapistId: 25, imageSlot: 2, sourceUrl: 'https://x/2.jpg' }]);
eq('★ 枠5は減った → 消す', [r5.next.purpose, r5.next.context.photoSyncCur.slot], ['delete_photo', 5]);
eq('★★ 削除はブラウザと同じ multipart（ファイル無し）', [r5.next.body, r5.next.multipart.files.length, r5.next.multipart.fields.image_set_id, r5.next.multipart.fields.image_id, !!r5.next.headers['content-type']], ['', 0, '5', '1', false]);
const brk = run('read_photo_page', Object.assign({}, r5.next.context, { photoStage: 'sync_deleted', editQueue: [] }), { body: editPage({ occupied: [1, 2, 3, 5] }).replace(S3 + '1_20260809230626.jpg', S3X(1)).replace(S3 + '5_20260809230626.jpg', S3 + '5_.jpg') });
eq('★★★ 名前だけ空の imgN_.jpg は成功にしない', [brk.kind, brk.audits[0].detail.reason], ['stop', 'broken']);
c = r5.next.context;
const d500 = run('delete_photo', c, { status: 500, body: 'err' });
eq('★ 500 でも読み直して照合に任せる', [d500.kind, d500.next.purpose], ['next', 'read_photo_page']);
const r6 = run('read_photo_page', Object.assign({}, c, { photoStage: 'sync_deleted' }), { body: editPage({ occupied: [1, 2, 3] }).replace(S3 + '1_20260809230626.jpg', S3X(1)) });
eq('★ 枠5を消した記録＋枠6は空なので記録だけ → 終わり、次の人へ', [r6.kind, r6.next && r6.next.purpose], ['next', 'girl_edit_form']);
eq('★ 記録（5 と 6 を消す）', r6.photoSynced, [{ therapistId: 25, imageSlot: 5, sourceUrl: null }, { therapistId: 25, imageSlot: 6, sourceUrl: null }]);
eq('★ まとめの1行', r6.audits.map((a) => a.summary).pop(), 'るうさんの駅ちかの写真を合わせました（入れた枠 1・2／消した枠 5）');
const n = r6.next.context;
eq('★★ 次の人に写真の道を持ち越さない', [n.editCastId, n.photoSync, n.photoSyncOps, n.photoGirlId, n.photoPut, n.editTherapistId, n.editPhotos.length], ['999', undefined, undefined, undefined, undefined, 26, 1]);
const top = run('read_photo_page', base({ photoSync: true, photoGirlId: GIRL, photoStage: 'sync', photoSyncOps: [{ slot: 1, action: 'remove', sourceUrl: null }] }), { body: editPage({ occupied: [1] }) });
eq('★★ 画像1は消さない（記録だけ外す）', [top.kind, top.audits[0].detail.reason, top.photoSynced], ['done', 'top_no_delete', [{ therapistId: 25, imageSlot: 1, sourceUrl: null }]]);

console.log('── 6. 次の人のプロフィールのあと、また写真へ ──');
const r7 = run('girl_edit_form', n, { status: 500 });
eq('★ さらさんの写真へ', [r7.next.purpose, r7.next.context.photoGirlId, r7.next.context.photoSync], ['read_photo_page', '999', true]);

console.log('── 7. 送れない写真の理由だけ ──');
const r8 = run('girl_edit_form', base({ editPhotoSkipped: ['枠3：小さい'] }), { status: 500 });
eq('★ 写真なしでも理由を残して終わる', [r8.kind, r8.audits[r8.audits.length - 1].detail.reason], ['stop', 'not_ready']);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
