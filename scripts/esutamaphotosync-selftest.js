// エステ魂の写真をあとから合わせる（第434便）の自己点検。
//   使い方:  npm run check:esutamaphotosync
const path = require('path');
const S = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaPhotoSync.js'));
const RF = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));
let fail = 0;
const eq = (name, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name); };
const sl = (arr) => arr.map((st, i) => ({ slot: i + 1, state: st }));
const E = 'empty', V = 'saved';
const K = (n) => 'therapist-photos/c/' + n + '.jpg';

console.log('── 1. 計画 ──');
eq('photoKey は URL でも path でも同じ', [S.photoKey('https://x.supabase.co/storage/v1/object/public/therapist-photos/c/1.jpg?t=1'), S.photoKey(K(1))], [K(1), K(1)]);
eq('同じなら何もしない', S.planEsutamaPhotoSync({ slots: sl([V, V, E, E, E, E]), want: [K(1), K(2)], had: { 1: K(1), 2: K(2) }, allowRemove: false }), { kind: 'noop' });
eq('足すだけ', S.planEsutamaPhotoSync({ slots: sl([V, V, E, E, E, E]), want: [K(1), K(2), K(3)], had: { 1: K(1), 2: K(2) }, allowRemove: false }), { kind: 'sync', keep: 2, deleteSlots: [], addFrom: 2, addCount: 1 });
eq('★ 順番が変わった → ずれた所から後ろを消して入れ直す', S.planEsutamaPhotoSync({ slots: sl([V, V, V, E, E, E]), want: [K(1), K(3), K(2)], had: { 1: K(1), 2: K(2), 3: K(3) }, allowRemove: false }), { kind: 'sync', keep: 1, deleteSlots: [2, 3], addFrom: 1, addCount: 2 });
eq('★ 減らした写真を消すのは許可があるときだけ', S.planEsutamaPhotoSync({ slots: sl([V, V, V, E, E, E]), want: [K(1), K(3)], had: { 1: K(1), 2: K(2), 3: K(3) }, allowRemove: false }), { kind: 'blocked_remove', slots: [2] });
eq('許可あり', S.planEsutamaPhotoSync({ slots: sl([V, V, V, E, E, E]), want: [K(1), K(3)], had: { 1: K(1), 2: K(2), 3: K(3) }, allowRemove: true }), { kind: 'sync', keep: 1, deleteSlots: [2, 3], addFrom: 1, addCount: 1 });
eq('★★ 記録の無い写真が範囲にあれば触らない', S.planEsutamaPhotoSync({ slots: sl([V, V, E, E, E, E]), want: [K(9), K(2)], had: { 2: K(2) }, allowRemove: true }), { kind: 'kept', slots: [1] });
eq('★ 記録の無い写真が後ろにあるときも触らない', S.planEsutamaPhotoSync({ slots: sl([V, V, E, E, E, E]), want: [K(1), K(2)], had: { 1: K(1) }, allowRemove: true }), { kind: 'kept', slots: [2] });
eq('★ 詰まっていない', S.planEsutamaPhotoSync({ slots: sl([V, E, V, E, E, E]), want: [], had: {}, allowRemove: true }).kind, 'not_packed');
eq('確認に出す枠', S.esutamaRemovalSlots([K(1)], { 1: K(1), 2: K(2) }), [2]);
eq('消す名前を読む', S.readEsutamaDeleteCols('<a href="#" class="tmp_photo__cancel" data-tg="cast_icon_2" data-delete_col="photo2">x</a>'), { 2: 'photo2' });

console.log('── 2. 流れ ──');
const CAST = '955513';
const area = (n, st) => '<div class="upload_area l-edit_upload_area"><div class="upload_area__results' + (st === V ? ' upload_area--complete' : '') + ' ">'
  + (st === V ? '<div class="tmp_photo_block"><img class="tmp_img" src="https://img.estama.jp/shop_data/1/cast/main/357x556/a' + n + '_20260910101958.jpg" width="357"><a href="javascript:void(0)" class="tmp_photo__cancel" data-tg="cast_icon_' + n + '" data-delete_col="photo' + n + '"></a></div>' : '')
  + '</div><label class="label_photo" for="cast_icon_' + n + '">+</label><input class="upload_photo_input_admin_therapist_photo" type="file" id="cast_icon_' + n + '" data-input="cast_icon_' + n + '" data-post_url="/file_upload/therapist_tmp/cast_icon_' + n + '/"><input type="hidden" name="order_cast_images[]" value="photo' + n + '"></div>';
const page = (st) => '<html><body><form method="POST"><input type="hidden" name="cast_id" value="' + CAST + '"><input type="hidden" name="ctk" value="tok"><input type="text" name="name" value="る"><label><input type="checkbox" name="type[]" value="1" checked> 新人</label><input type="text" name="age" value="25">'
  + st.map((x, i) => area(i + 1, x)).join('') + '<input type="checkbox" name="set_up_limit" value="1"></form></body></html>';
const F = (n) => ({ bucket: 'therapist-photos', path: 'c/' + n + '.jpg' });
const base = (o) => Object.assign({ v: RF.RELAY_FLOW_VERSION, flowId: 'F', intent: 'cast_edit', cookie: 'S=1', startedAt: 'x', castEditCastId: CAST, castEditName: 'る', castEditTherapistId: 7, castEditApply: true, castEditValues: { age: '25' } }, o || {});
const run = (purpose, ctx, o) => RF.advanceFlow(Object.assign({ purpose, status: 200, headers: {}, body: '', context: ctx }, o || {}));
const photos = { want: [F(1), F(3), F(2)], had: { 1: K(1), 2: K(2), 3: K(3) }, allowRemove: false };
const p0 = run('esutama_edit_form', base({ castEditPhotos: photos }), { body: page([V, V, V, E, E, E]) });
eq('★ プロフィールが変わらなくても写真の段へ', [p0.kind, p0.next.purpose, p0.next.context.castEditStage, p0.next.context.castEditInPhoto], ['next', 'esutama_edit_form', 'photo', true]);
const p1 = run('esutama_edit_form', p0.next.context, { body: page([V, V, V, E, E, E]) });
eq('★ 並べ替え → 枠2・3を消す保存', [p1.next.purpose, p1.next.method, p1.next.body.includes('delete_photo%5Bphoto2%5D=1'), p1.next.body.includes('delete_photo%5Bphoto3%5D=1'), p1.next.body.includes('set_up_limit'), p1.next.context.castEditStage], ['esutama_edit_save', 'POST', true, true, false, 'photo_deleted']);
const p2 = run('esutama_edit_save', p1.next.context, { status: 302, headers: { location: '/admin/cast/' } });
const p3 = run('esutama_edit_form', p2.next.context, { body: page([V, E, E, E, E, E]) });
eq('★ 消えたのを確かめて、足す段へ（記録を消す）', [p3.kind, p3.next.purpose, p3.next.context.castPhotoFile.path, p3.next.context.castPhotoQueue.length, p3.photoSynced], ['next', 'esutama_photo_form', 'c/3.jpg', 1, [{ therapistId: 7, imageSlot: 2, sourceUrl: null }, { therapistId: 7, imageSlot: 3, sourceUrl: null }]]);
const bad = run('esutama_edit_form', p2.next.context, { body: page([V, V, E, E, E, E]) });
eq('★ 消えていなければ止めて足さない', [bad.kind, bad.audits[0].detail.reason], ['stop', 'delete_mismatch']);
// 足した写真の照合（esutamaPhotoFlow の verify）
const vctx = Object.assign({}, p3.next.context, { castPhotoStage: 'verify', castPhotoSlot: 2 });
const v1 = run('esutama_photo_form', vctx, { body: page([V, V, E, E, E, E]) });
eq('★ 1枚入ったら記録して次の写真', [v1.kind, v1.next.purpose, v1.next.context.castPhotoFile.path, v1.photoSynced], ['next', 'esutama_photo_form', 'c/2.jpg', [{ therapistId: 7, imageSlot: 2, sourceUrl: 'therapist-photos/c/3.jpg' }]]);
const v2 = run('esutama_photo_form', Object.assign({}, v1.next.context, { castPhotoStage: 'verify', castPhotoSlot: 3, castEditQueue: [{ castId: '222', name: 'さら', values: {}, therapistId: 8 }] }), { body: page([V, V, V, E, E, E]) });
eq('★ 最後の1枚 → 記録して次の人へ', [v2.kind, v2.next.purpose, v2.next.context.castEditCastId, v2.next.context.castEditInPhoto, v2.next.context.castPhotoFile, v2.photoSynced], ['next', 'esutama_edit_form', '222', undefined, undefined, [{ therapistId: 7, imageSlot: 3, sourceUrl: 'therapist-photos/c/2.jpg' }]]);
const kept = run('esutama_edit_form', base({ castEditInPhoto: true, castEditStage: 'photo', castEditPhotos: { want: [F(1)], had: {}, allowRemove: true } }), { body: page([V, E, E, E, E, E]) });
eq('★★ 記録の無い写真は触らない', [kept.kind, kept.audits[0].detail.reason], ['done', 'not_ours']);
const dry = run('esutama_edit_form', base({ castEditApply: undefined, castEditPhotos: photos }), { body: page([V, V, V, E, E, E]) });
eq('試し打ちは写真へ行かない', dry.kind, 'done');

console.log('── 3. 登録のとき写真を記録 ──');
const cc = Object.assign({}, base(), { intent: 'cast_create', createTherapistId: 9, castPhotoCastId: CAST, castPhotoFile: F(5), castPhotoStage: 'verify', castPhotoSlot: 1 });
const c1 = run('esutama_photo_form', cc, { body: page([V, E, E, E, E, E]) });
eq('★ エステ魂の登録の写真も記録', c1.photoSynced, [{ therapistId: 9, imageSlot: 1, sourceUrl: 'therapist-photos/c/5.jpg' }]);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
