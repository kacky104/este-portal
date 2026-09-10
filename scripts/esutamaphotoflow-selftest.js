// エステ魂へ写真を送る流れ（relayFlow の cast_photo）の自己点検（第243便・2026-09-10）。
//
// ★★★ なぜ要るか
//   ここは **相手の設定を書き換える** ところ。★ 枠を1つ間違えると、別の枠の写真を差し替える。
//   ★★ しかも2段構えで、**仮置きだけでは付かない**。★ 途中で止まったときに
//     「送ったのに付いていない」を静かに通さないことが大事。
//   → 「通る道」より **「どこで止まるか」** を1つずつ固定する。
//
//   使い方:  npm run check:esutamaphotoflow

const path = require('path');
const RF = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ── 編集ページの作り物（★ 形は 2026-09-10 の実測に合わせてある）──
const SAVED_IMG = 'https://img.estama.jp/shop_data/00000047417/cast/main/357x556/7ny79_20260910101958.jpg';
const TEMP_IMG = '/temp/file_en11k_20260910113245.jpg';

const uploadArea = (n, state) => {
  const img = state === 'saved' ? SAVED_IMG : (state === 'pending' ? TEMP_IMG : null);
  return '<div class="upload_area l-edit_upload_area">'
    + '<div class="upload_area__results' + (state === 'empty' ? '' : ' upload_area--complete') + ' ">'
    + (img ? '<div class="tmp_photo_block"><img class="tmp_img" src="' + img + '" width="357"></div>' : '')
    + (state === 'pending' ? '<input type="hidden" name="cast_icon_' + n + '-imgupload" value="' + TEMP_IMG + '">' : '')
    + '</div>'
    + '<label class="label_photo" for="cast_icon_' + n + '">+画像を追加する</label>'
    + '<input class="upload_photo_input_admin_therapist_photo" type="file" id="cast_icon_' + n + '"'
    + ' data-input="cast_icon_' + n + '" data-post_url="/file_upload/therapist_tmp/cast_icon_' + n + '/">'
    + '<input type="hidden" name="order_cast_images[]" value="photo' + n + '">'
    + '</div>';
};

/** @param states 枠1〜6の状態（既定は全部 empty） */
const editPage = (states) => {
  const st = states || ['empty', 'empty', 'empty', 'empty', 'empty', 'empty'];
  return '<html><body><form method="POST" action="/admin/cast_edit/955513/">'
    + '<input type="hidden" name="cast_id" value="955513">'
    + '<input type="text" name="name" value="テスト" maxlength="10">'
    + '<input type="text" name="age" value="22">'
    + '<input type="checkbox" name="type[]" value="1" checked>'
    + '<input type="checkbox" name="type[]" value="9">'
    + [1, 2, 3, 4, 5, 6].map((n) => uploadArea(n, st[n - 1])).join('')
    + '<input type="hidden" name="ctk" id="csrf_footer" value="a1b2c3">'
    + '</form></body></html>';
};

/** 仮置きの応答（実物の形） */
const tmpResponse = (n) =>
  '<div class="tmp_photo_block">'
  + '<input type="hidden" name="cast_icon_' + n + '-imgupload" value="/temp/file_zz9_20260910120000.jpg">'
  + '<img class="tmp_img" src="/temp/file_zz9_20260910120000.jpg" width="357">'
  + '</div>';

const base = RF.newFlowContext({ flowId: 'p1', intent: 'cast_photo', startedAt: '2026-09-10T12:00:00+09:00' });
const ctx = Object.assign({}, base, {
  cookie: 'sid=abc',
  castPhotoCastId: '955513',
  castPhotoTherapistId: 602,
  castPhotoFile: { bucket: 'therapist-photos', path: '6/602/main.jpg' },
});
const go = (purpose, status, headers, body, c) =>
  RF.advanceFlow({ purpose, status, headers: headers || {}, body, context: c });

console.log('── ① 枠を選んで仮置きへ送る ──');
{
  const r = go('esutama_photo_form', 200, {}, editPage(), ctx);
  eq('★★★ 次は仮置きへの送信', r.next.purpose, 'esutama_photo_tmp');
  eq('★★★ POST', r.next.method, 'POST');
  eq('★★★★★ 送り先は画面の data-post_url', r.next.url, 'https://estama.jp/file_upload/therapist_tmp/cast_icon_1/');
  eq('★★★★ 枠は画面から決める（全部空きなら1）', r.next.context.castPhotoSlot, 1);
  eq('★★★ multipart の文字の欄',
     Object.keys(r.next.multipart.fields).sort(), ['ctk', 'dir', 'id', 'page_type']);
  eq('★★★ ctk は読んだページのもの', r.next.multipart.fields.ctk, 'a1b2c3');
  eq('★★★ 画像は1枚だけ・項目名は file',
     [r.next.multipart.files.length, r.next.multipart.files[0].field], [1, 'file']);
  eq('★★★★ 寸法は取りに来た口で合わせてもらう（357×556・左上）',
     /fit=cover&w=357&h=556&pos=lefttop/.test(r.next.multipart.files[0].url), true);
  eq('★★ ファイル名はこちらで決める', r.next.multipart.files[0].filename, 'cast_955513_1.jpg');
  eq('★ 読めたことを記録に残す', r.audits[0].event, 'read_photo_page');

  // ★★★★ 埋まっている枠は飛ばして、空き枠へ
  const r2 = go('esutama_photo_form', 200, {}, editPage(['saved', 'saved', 'empty', 'empty', 'empty', 'empty']), ctx);
  eq('★★★★ 埋まっている枠は飛ばす', r2.next.context.castPhotoSlot, 3);

  // ★★★ 枠を指名することもできる
  const r3 = go('esutama_photo_form', 200, {}, editPage(), Object.assign({}, ctx, { castPhotoSlotWanted: 5 }));
  eq('★★★ 指名した枠へ送る', r3.next.url, 'https://estama.jp/file_upload/therapist_tmp/cast_icon_5/');

  // ★★★★★ 指名した枠が埋まっていたら【送らない】（★ 店舗様の写真を上書きしない）
  const r4 = go('esutama_photo_form', 200, {}, editPage(['saved', 'empty', 'empty', 'empty', 'empty', 'empty']),
                Object.assign({}, ctx, { castPhotoSlotWanted: 1 }));
  eq('★★★★★ 埋まっている枠を指名したら送らない', r4.audits[0].outcome, 'stopped');
  eq('★★ 理由が残る', r4.audits[0].detail.reason, 'blocked');

  // ★★★ 全部埋まっていたら、何もせず終わる
  const full = go('esutama_photo_form', 200, {},
                  editPage(['saved', 'saved', 'saved', 'saved', 'saved', 'saved']), ctx);
  eq('★★★ 空き枠が無ければ何もしない', [full.kind, full.audits[0].outcome, full.audits[0].detail.reason],
     ['done', 'stopped', 'no_empty_slot']);
}

console.log('\n── ② 仮置きの応答 ──');
{
  const sent = Object.assign({}, ctx, { castPhotoSlot: 3 });
  const r = go('esutama_photo_tmp', 200, {}, tmpResponse(3), sent);
  eq('★★★★ 次は編集フォームを読み直す（★ 新しい ctk と65部品）', r.next.purpose, 'esutama_photo_form');
  eq('★★★★ 段は save', r.next.context.castPhotoStage, 'save');
  eq('★★★★★ 仮置きの1組を持ち回す（★ 読み直しても付いてこない）',
     r.next.context.castPhotoTmp,
     { field: 'cast_icon_3-imgupload', value: '/temp/file_zz9_20260910120000.jpg', slot: 3 });
  eq('★ 応答の正体を残す', /hidden あり/.test(r.next.context.castPhotoNote), true);

  // ★★★★★ 拾えなければ【進まない】（★ 進んでも写真は付かない）
  const ng = go('esutama_photo_tmp', 200, {}, '<html>error</html>', sent);
  eq('★★★★★ /temp/… を拾えなければ止まる', [ng.kind, ng.audits[0].outcome, ng.audits[0].detail.reason],
     ['stop', 'failed', 'no_tmp']);
  eq('★★★ 応答の正体を記録に残す', /hidden \*\*なし\*\*/.test(ng.audits[0].detail.response), true);

  // ★★★★★ 別の枠に受け取られていたら【保存しに行かない】
  const cross = go('esutama_photo_tmp', 200, {}, tmpResponse(5), sent);
  eq('★★★★★ 送った枠と違えば止まる', cross.audits[0].detail.reason, 'slot_mismatch');
  eq('★★ どちらの枠だったかを残す', [cross.audits[0].detail.slot, cross.audits[0].detail.gotSlot], [3, 5]);

  const err = go('esutama_photo_tmp', 500, {}, '', sent);
  eq('★★ 応答が500なら止まる', err.audits[0].detail.reason, 'http_error');
}

console.log('\n── ③ 保存して本紐づけ ──');
{
  const tmp = { field: 'cast_icon_3-imgupload', value: '/temp/file_zz9_20260910120000.jpg', slot: 3 };
  const saveCtx = Object.assign({}, ctx, { castPhotoStage: 'save', castPhotoSlot: 3, castPhotoTmp: tmp });
  // ★★★★★ 読み直した画面に仮置きの hidden は【現れない】。
  //   ★ 実測（2026-09-10 11:30）: 仮置きのあと F5 すると写真は消えた。
  //   ★ hidden は JS が差し込むだけで、サーバは覚えていない。→ 枠3は **空きのまま**返ってくる。
  const r = go('esutama_photo_form', 200, {}, editPage(), saveCtx);
  eq('★★★ 次は保存', r.next.purpose, 'esutama_photo_save');
  eq('★★★ 宛先はその人の編集ページ', r.next.url, 'https://estama.jp/admin/cast_edit/955513/');
  eq('★★★★ 読んだ欄はそのまま返す',
     /(^|&)name=%E3%83%86%E3%82%B9%E3%83%88(&|$)/.test(r.next.body), true);
  eq('★★★★★ 写真の1組を足す',
     /(^|&)cast_icon_3-imgupload=%2Ftemp%2Ffile_zz9_20260910120000\.jpg(&|$)/.test(r.next.body), true);
  eq('★★★ ctk を持って行く', /(^|&)ctk=a1b2c3(&|$)/.test(r.next.body), true);

  // ★★★★★ 万一、読み直した画面に同じ欄が在ったら【二重に送らない】
  //   ★ いまのエステ魂では起きないが、相手が変えたときに黙って2つ飛ばさないための止め
  const dup = go('esutama_photo_form', 200, {},
                 editPage(['empty', 'empty', 'pending', 'empty', 'empty', 'empty']), saveCtx);
  eq('★★★★★ 同じ欄が在れば二重に送らない',
     [dup.audits[0].outcome, dup.audits[0].detail.reason], ['stopped', 'blocked']);
  eq('★★ 理由が読める', /二重/.test(dup.audits[0].detail.note), true);

  // ★★★★ 仮置きの情報が無ければ保存しない
  const noTmp = go('esutama_photo_form', 200, {}, editPage(), Object.assign({}, ctx, { castPhotoStage: 'save' }));
  eq('★★★★ 仮置きの組が無ければ止まる', noTmp.audits[0].detail.reason, 'no_tmp');

  // ★★ 保存の応答 → 読み直しへ
  const after = go('esutama_photo_save', 200, {}, '<html>ok</html>', Object.assign({}, ctx, { castPhotoSlot: 3 }));
  eq('★★★ 成否は応答で判定しない（読み直す）', after.next.purpose, 'esutama_photo_form');
  eq('★★★ 段は verify', after.next.context.castPhotoStage, 'verify');
}

console.log('\n── ④ 照合（★ ここで初めて成否が決まる） ──');
{
  const v = Object.assign({}, ctx, { castPhotoStage: 'verify', castPhotoSlot: 3 });
  const ok = go('esutama_photo_form', 200, {}, editPage(['empty', 'empty', 'saved', 'empty', 'empty', 'empty']), v);
  eq('★★★★★ 枠が saved になっていれば成功', [ok.kind, ok.audits[0].event, ok.audits[0].outcome],
     ['done', 'push_photo', 'ok']);
  eq('★★ どの枠かを残す', ok.audits[0].detail.slot, 3);

  // ★★★★★ 仮置きのままなら **失敗**（★ 「送ったのに付いていない」を静かに通さない）
  const pend = go('esutama_photo_form', 200, {}, editPage(['empty', 'empty', 'pending', 'empty', 'empty', 'empty']), v);
  eq('★★★★★ 仮置きのままなら失敗', [pend.audits[0].outcome, pend.audits[0].detail.reason],
     ['failed', 'not_saved']);
  eq('★★ どの状態だったかを残す', pend.audits[0].detail.state, 'pending');

  const empty = go('esutama_photo_form', 200, {}, editPage(), v);
  eq('★★★★ 空きのままなら失敗', empty.audits[0].detail.reason, 'not_saved');
}

console.log('\n── ⑤ 止まるところ ──');
{
  eq('★★★ 相手が指定されていなければ何もしない',
     go('esutama_photo_form', 200, {}, editPage(), Object.assign({}, base, { cookie: 'sid=abc' }))
       .audits[0].detail.reason, 'no_cast_id');
  eq('★★★ 送る写真が無ければ何もしない',
     go('esutama_photo_form', 200, {}, editPage(),
        Object.assign({}, ctx, { castPhotoFile: undefined })).audits[0].detail.reason, 'no_file');
  eq('★★ 編集ページが開けなければ止まる',
     go('esutama_photo_form', 404, {}, '', ctx).audits[0].detail.reason, 'http_error');
  eq('★★★ 写真の枠を読めなければ止まる（★「0枠」で通さない）',
     go('esutama_photo_form', 200, {}, '<html><body>なにもない</body></html>', ctx).audits[0].detail.reason,
     'parse_failed');
  eq('★★★★ ログイン画面へ戻されたら止まる',
     go('esutama_photo_form', 200, {},
        '<html><form><input name="login_id"><input name="password"></form></html>', ctx)
       .audits[0].event, 'login');
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
