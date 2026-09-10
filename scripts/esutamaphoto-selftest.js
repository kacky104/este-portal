// エステ魂の写真の部品（src/lib/esutamaPhoto.ts）の自己点検（第240便・2026-09-10）。
//
// ★★★ なぜ要るか
//   ここは **相手の画面に写真を送る** ところ。★ 枠を1つ間違えると、別の枠の写真を差し替える。
//   ★★ しかも送り先は **画面の data-post_url から読む**（決め打ちしない）。
//     ★ 読み違えたら、まったく別の場所へ店舗様の Cookie ごと投げることになる。
//   → 「読めた」ことより **「食い違いを見つけて止められる」** ことを重点的に点検する。
//
// ★★ HTML はこの場で組んだ作り物。★ ただし **形は 2026-09-10 の実測に合わせてある**
//   （id / data-input / data-post_url ＝ cast_icon_1..6、応答の hidden ＝ cast_icon_N-imgupload）。
//
//   使い方:  npm run check:esutamaphoto

const path = require('path');
const P = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaPhoto.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const throws = (name, fn, re) => {
  try { fn(); console.log('NG ' + name + '（例外にならなかった）'); fail++; }
  catch (e) { if (re && !re.test(e.message)) { console.log('NG ' + name + '（違う例外: ' + e.message + '）'); fail++; } else console.log('ok ' + name); }
};

const EDIT = 'https://estama.jp/admin/cast_edit/955513/';
const FILE_URL = 'https://fukues.com/api/relay/file?bucket=therapist-photos&path=6/602/main.jpg';

// ★★★★ 実測の形（2026-09-10 11:38・編集ページのコンソールで採取）をなぞった作り物。
//   1枠ぶんの実物:
//     <div class="upload_area l-edit_upload_area">
//       <div class="upload_area__results upload_area--complete">     ← ★ 埋まっている印
//         <div class="tmp_photo_block"><div class="img_wrap--upload"><img class="tmp_img" src="…" width="357"></div>
//           <a class="tmp_photo__cancel" data-tg="cast_icon_1" data-delete_col="photo1">削除する</a></div>
//         （仮置きのときだけ）<input type="hidden" name="cast_icon_N-imgupload" value="/temp/…">
//       <label class="label_photo … l-edit_add_img_box" for="cast_icon_N">+画像を追加する</label>
//       <input type="file" id="cast_icon_N" data-input="cast_icon_N" data-post_url="…">
//       <input type="hidden" name="order_cast_images[]" value="photoN">
const SAVED_IMG = 'https://img.estama.jp/shop_data/00000047417/cast/main/357x556/7ny79_20260910101958.jpg';
const TEMP_IMG = '/temp/file_en11k_20260910113245.jpg';

const slotInput = (n, opt) => {
  const o = Object.assign({
    post: '/file_upload/therapist_tmp/cast_icon_' + n + '/',
    input: 'cast_icon_' + n,
    state: 'empty',
  }, opt || {});
  const img = o.state === 'saved' ? SAVED_IMG : (o.state === 'pending' ? TEMP_IMG : null);
  const complete = o.state === 'empty' ? '' : ' upload_area--complete';
  return '<div class="upload_area l-edit_upload_area">'
    + '<div class="upload_area__results' + complete + ' ">'
    + (img
      ? '<div class="tmp_photo_block"><div class="img_wrap--upload">'
        + '<img class="tmp_img" src="' + img + '" width="357"></div>'
        + '<a href="javascript:void(0)" class="tmp_photo__cancel" data-tg="cast_icon_' + n + '" data-delete_col="photo' + n + '">削除する</a>'
        + '</div>'
      : '')
    + (o.state === 'pending'
      ? '<input type="hidden" name="cast_icon_' + n + '-imgupload" value="' + TEMP_IMG + '">'
      : '')
    + '</div>'
    + '<label class="label_photo label_upload_photo def l-edit_add_img_box" for="cast_icon_' + n + '"><span>+画像を追加する</span></label>'
    + '<input class="upload_photo_input_admin_therapist_photo" type="file" id="cast_icon_' + n + '"'
    + (o.input === null ? '' : ' data-input="' + o.input + '"')
    + (o.post === null ? '' : ' data-post_url="' + o.post + '"')
    + '>'
    + '<input type="hidden" name="order_cast_images[]" value="photo' + n + '">'
    + '</div>';
};
const editPage = (...inputs) =>
  '<html><body><form method="POST">'
  + '<input type="text" name="name" value="テスト" maxlength="10">'
  + '<input type="hidden" name="ctk" id="csrf_footer" value="a1b2c3">'
  + '<div class="img_area">' + inputs.join('') + '</div>'
  + '</form></body></html>';
const sixSlots = () => editPage(...[1, 2, 3, 4, 5, 6].map((n) => slotInput(n)));

console.log('── ① 写真の枠を読む ──');
{
  const p = P.parseEsutamaPhotoSlots(sixSlots(), EDIT);
  eq('★ 素直な形では警告が出ない', p.warnings, []);
  eq('★★★ 6枠読める', p.slots.length, 6);
  eq('★★ 枠1の中身', p.slots[0], {
    slot: 1, id: 'cast_icon_1', dir: 'cast_icon_1',
    postUrl: 'https://estama.jp/file_upload/therapist_tmp/cast_icon_1/',
    state: 'empty', imgSrc: null,
  });
  eq('★★★★ 相対の data-post_url を絶対に直す',
     p.slots[5].postUrl, 'https://estama.jp/file_upload/therapist_tmp/cast_icon_6/');
  eq('★ 枠は番号の順に並ぶ', p.slots.map((s) => s.slot), [1, 2, 3, 4, 5, 6]);

  // ★ 絶対 URL で書かれていてもそのまま使える
  const abs = P.parseEsutamaPhotoSlots(
    editPage(slotInput(1, { post: 'https://estama.jp/file_upload/therapist_tmp/cast_icon_1/' })), EDIT);
  eq('★ 絶対 URL はそのまま', abs.slots[0].postUrl, 'https://estama.jp/file_upload/therapist_tmp/cast_icon_1/');
}

console.log('\n── ② 食い違いを見つけて止める ──');
{
  // ★★★ 送り先が無い枠は使わない（★ 番号から組み立てない）
  const noPost = P.parseEsutamaPhotoSlots(editPage(slotInput(1, { post: null })), EDIT);
  eq('★★★ data-post_url が無ければ使わない', noPost.slots.length, 0);
  eq('★★ 黙って落とさない', /data-post_url が無い/.test(noPost.warnings[0]), true);

  // ★★★★★ 他所のドメインは使わない（★ Cookie を飛ばさない）
  const foreign = P.parseEsutamaPhotoSlots(
    editPage(slotInput(1, { post: 'https://evil.example.com/file_upload/therapist_tmp/cast_icon_1/' })), EDIT);
  eq('★★★★★ 送り先がエステ魂でなければ使わない', foreign.slots.length, 0);
  eq('★★ 理由を残す', /エステ魂ではない/.test(foreign.warnings[0]), true);

  // ★★★★ 枠の番号と送り先の番号が食い違ったら使わない（★ 別の枠へ送らない）
  const crossed = P.parseEsutamaPhotoSlots(
    editPage(slotInput(1, { post: '/file_upload/therapist_tmp/cast_icon_3/' })), EDIT);
  eq('★★★★ 枠番号と送り先が食い違ったら使わない', crossed.slots.length, 0);
  eq('★★ 理由を残す', /食い違う/.test(crossed.warnings[0]), true);

  // ★ 同じ枠が2回
  const dup = P.parseEsutamaPhotoSlots(editPage(slotInput(2), slotInput(2)), EDIT);
  eq('★★ 同じ枠が2回出たら2つ目は使わない', dup.slots.length, 1);
  eq('★ 理由を残す', /2回出てくる/.test(dup.warnings[0]), true);

  // ★ 見たことのない枠番号
  const big = P.parseEsutamaPhotoSlots(editPage(slotInput(9)), EDIT);
  eq('★★ 枠は6つまで（7以上は使わない）', big.slots.length, 0);
  eq('★ 理由を残す', /見たことのない枠番号/.test(big.warnings[0]), true);

  // ★★★ 1枠も無い画面を「0件」で通さない
  const empty = P.parseEsutamaPhotoSlots(editPage(), EDIT);
  eq('★★★ 枠が1つも無ければ理由を残す', empty.warnings.length > 0, true);
  eq('★ 本文が空なら理由を残す', P.parseEsutamaPhotoSlots('', EDIT).warnings, ['本文が空']);

  // ★ data-input が無ければ id で代用する（★ 実測ではどちらも cast_icon_N）
  const noInput = P.parseEsutamaPhotoSlots(editPage(slotInput(1, { input: null })), EDIT);
  eq('★ data-input が無ければ id を使う', noInput.slots[0].dir, 'cast_icon_1');
}

console.log('\n── ③ 仮置きへ送る形を組み立てる ──');
{
  const page = P.parseEsutamaPhotoSlots(sixSlots(), EDIT);
  const V = { slot: 1, ctk: 'a1b2c3', fileUrl: FILE_URL, filename: 'photo_602_1.jpg', contentType: 'image/jpeg' };
  const r = P.buildEsutamaPhotoUploadRequest('sid=abc', page, V);

  eq('★★★ POST', r.method, 'POST');
  eq('★★★★★ 送り先は画面の data-post_url', r.url, 'https://estama.jp/file_upload/therapist_tmp/cast_icon_1/');
  eq('★★★★ 文字の欄は【5つのうち4つ】（残る1つは file）',
     Object.keys(r.multipart.fields).sort(), ['ctk', 'dir', 'id', 'page_type']);
  eq('★★★ 中身', r.multipart.fields,
     { dir: 'cast_icon_1', ctk: 'a1b2c3', id: 'cast_icon_1', page_type: 'admin' });
  eq('★★★ 画像は1枚だけ', r.multipart.files.length, 1);
  eq('★★★ 項目名は file', r.multipart.files[0].field, 'file');
  eq('★★ 画像そのものは通さない（フクエスの口の URL を渡すだけ）', r.multipart.files[0].url, FILE_URL);

  // ★★★ content-type は付けない（★ 境界は中継役が決める）
  eq('★★★ content-type を付けない', Object.keys(r.headers).includes('content-type'), false);
  eq('★★ jQuery の ajax と同じ見た目', r.headers.accept, 'text/plain, */*; q=0.01');
  eq('★★ XHR だと名乗る', r.headers['x-requested-with'], 'XMLHttpRequest');
  eq('★ Cookie を持って行く', r.headers.cookie, 'sid=abc');
  eq('★ 何をどこへ送ったかを残す', r.meta, { slot: 1, id: 'cast_icon_1', dir: 'cast_icon_1', filename: 'photo_602_1.jpg', contentType: 'image/jpeg', wasState: 'empty' });

  // ★ 枠6も同じ形で組める
  eq('★ 枠6の送り先', P.buildEsutamaPhotoUploadRequest('sid=abc', page, Object.assign({}, V, { slot: 6 })).url,
     'https://estama.jp/file_upload/therapist_tmp/cast_icon_6/');
}

console.log('\n── ④ 送る前に止める ──');
{
  const page = P.parseEsutamaPhotoSlots(sixSlots(), EDIT);
  const V = { slot: 1, ctk: 'a1b2c3', fileUrl: FILE_URL, filename: 'photo_602_1.jpg', contentType: 'image/jpeg' };
  const bad = (o) => Object.assign({}, V, o);

  throws('★★ Cookie が無ければ送らない', () => P.buildEsutamaPhotoUploadRequest('', page, V), /Cookie/);
  throws('★★★ 使い捨てトークンが無ければ送らない',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, bad({ ctk: '' })), /ctk/);
  throws('★★★★★ 画面に無い枠へは送らない（★ 番号から組み立てない）',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, bad({ slot: 3 + 4 })), /画面にありません/);
  throws('★★★★ 読み切れていない画面では送らない',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', P.parseEsutamaPhotoSlots(editPage(slotInput(1, { post: null })), EDIT), V),
         /読み切れていない/);
  throws('★★★★★ 取り先がフクエスの口でなければ送らない',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, bad({ fileUrl: 'https://evil.example.com/api/relay/file?bucket=b&path=p' })),
         /取りに行ってよい先ではない/);
  throws('★★★ JPEG 以外は送らない（★ 相手は canvas で JPEG にしている）',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, bad({ contentType: 'image/png' })), /JPEG/);
  throws('★★ ファイル名の形が不正なら送らない',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, bad({ filename: '../etc/passwd.jpg' })), /ファイル名/);
  throws('★ 拡張子が違えば送らない',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, bad({ filename: 'photo.gif' })), /ファイル名/);
}

console.log('\n── ⑤ 仮置きの応答を読む ──');
{
  // ★ 実物（2026-09-10 10:19 の Network → レスポンス）
  const real = '<div class="tmp_photo_block">'
    + '<input type="hidden" name="cast_icon_1-imgupload" value="/temp/file_7ny79_20260910101958.jpg">'
    + '<div class="img_wrap--upload"><img class="tmp_img" src="/temp/file_7ny79_20260910101958.jpg" width="357"></div>'
    + '<label class="label_photo label_upload_photo def btn-13" for="cast_icon_1">写真を変更する</label>'
    + '<a href="javascript:void(0)" class="tmp_photo_cancel" data-page_type="admin" data-tg="cast_icon_1"></a>'
    + '</div>';
  eq('★★★★★ 保存フォームに足す1組を取り出す', P.readEsutamaTmpPhoto(real),
     { field: 'cast_icon_1-imgupload', value: '/temp/file_7ny79_20260910101958.jpg', slot: 1 });

  eq('★ 枠4でも読める',
     P.readEsutamaTmpPhoto('<input type="hidden" name="cast_icon_4-imgupload" value="/temp/file_ab12_20260910101958.jpg">').slot, 4);

  // ★★★ 「たぶんこれ」で近いものを返さない
  eq('★★★ 欄名が違えば null',
     P.readEsutamaTmpPhoto('<input type="hidden" name="cast_icon_1" value="/temp/file_x.jpg">'), null);
  eq('★★★ 値の形が違えば null（★ 相手の失敗を成功と読み違えない）',
     P.readEsutamaTmpPhoto('<input type="hidden" name="cast_icon_1-imgupload" value="">'), null);
  eq('★★★ /temp/ 以外は null',
     P.readEsutamaTmpPhoto('<input type="hidden" name="cast_icon_1-imgupload" value="/etc/passwd.jpg">'), null);
  eq('★★ 枠番号が範囲外なら null',
     P.readEsutamaTmpPhoto('<input type="hidden" name="cast_icon_9-imgupload" value="/temp/file_x.jpg">'), null);
  eq('★ 空の応答は null', P.readEsutamaTmpPhoto(''), null);
  eq('★ 失敗の画面（何も入っていない）も null', P.readEsutamaTmpPhoto('<html><body>error</body></html>'), null);
}

console.log('\n── ⑥ 応答の正体を1行で残す（★ 判定には使わない） ──');
{
  const ok = P.describeEsutamaPhotoResponse(200, '<input type="hidden" name="cast_icon_1-imgupload" value="/temp/file_x1.jpg">');
  eq('★★ 取れたことが分かる', /hidden あり（cast_icon_1-imgupload）/.test(ok), true);
  const ng = P.describeEsutamaPhotoResponse(200, '<html>error</html>');
  eq('★★★ 取れなかったことが分かる', /hidden \*\*なし\*\*/.test(ng), true);
  const login = P.describeEsutamaPhotoResponse(200, '<form><input name="login_id"><input name="password"></form>');
  eq('★★★ ログイン画面に戻されたら分かる', /ログイン画面らしい/.test(login), true);
  eq('★ HTTPの番号を残す', /^HTTP 500 /.test(P.describeEsutamaPhotoResponse(500, '')), true);
}

console.log('\n── ⑦ 相手が求める画像の形（★ 数を書き写さないための番人） ──');
{
  eq('★★★★ 357×556 を覆うように縮小し、左上を基準に切り取る',
     P.ESUTAMA_PHOTO_FIT, { width: 357, height: 556, position: 'left top' });
  eq('★★ 枠は6つ', P.ESUTAMA_PHOTO_SLOT_MAX, 6);
  eq('★★ page_type は admin', P.ESUTAMA_PHOTO_PAGE_TYPE, 'admin');
  eq('★★ 画像の項目名は file', P.ESUTAMA_PHOTO_FIELD_FILE, 'file');
}

console.log('\n── ⑧ ★★★★★ 枠の状態を見分ける（2026-09-10 11:38 実測） ──');
//
// ★★★ 実測（テスト用 955513 の編集ページ）:
//   枠1 … upload_area--complete ／ img が https://img.estama.jp/…/357x556/… ／ hidden は order_cast_images[] だけ → **保存済み**
//   枠2 … upload_area--complete ／ img が /temp/… ／ hidden に cast_icon_2-imgupload → **仮置き（未保存）**
//   枠3〜6 … complete 無し ／ img 無し → **空き**
{
  const page = P.parseEsutamaPhotoSlots(
    editPage(slotInput(1, { state: 'saved' }), slotInput(2, { state: 'pending' }),
             slotInput(3), slotInput(4), slotInput(5), slotInput(6)), EDIT);
  eq('★ 6枠読める', page.slots.length, 6);
  eq('★ 警告なし', page.warnings, []);
  eq('★★★★★ 状態を見分ける', page.slots.map((s) => s.state),
     ['saved', 'pending', 'empty', 'empty', 'empty', 'empty']);
  eq('★★★ 保存済みの画像の場所', page.slots[0].imgSrc, SAVED_IMG);
  eq('★★★ 仮置きの画像の場所', page.slots[1].imgSrc, TEMP_IMG);
  eq('★ 空き枠は画像なし', page.slots[2].imgSrc, null);

  // ★★★ 空き枠を数字で決め打ちしないための道具
  eq('★★★ いちばん小さい空き枠', P.firstEmptyEsutamaPhotoSlot(page), 3);
  eq('★ 全部空きなら1', P.firstEmptyEsutamaPhotoSlot(P.parseEsutamaPhotoSlots(sixSlots(), EDIT)), 1);
  eq('★★ 空きが無ければ null',
     P.firstEmptyEsutamaPhotoSlot(P.parseEsutamaPhotoSlots(
       editPage(...[1, 2, 3, 4, 5, 6].map((n) => slotInput(n, { state: 'saved' }))), EDIT)), null);
  eq('★★★ 読み切れていない画面では決めない',
     P.firstEmptyEsutamaPhotoSlot(P.parseEsutamaPhotoSlots(editPage(slotInput(1, { post: null })), EDIT)), null);
}

console.log('\n── ⑨ ★★★★★ 空き枠にだけ送る（★ 店舗様の写真を上書きしない） ──');
{
  const page = P.parseEsutamaPhotoSlots(
    editPage(slotInput(1, { state: 'saved' }), slotInput(2, { state: 'pending' }), slotInput(3)), EDIT);
  const V = { ctk: 'a1b2c3', fileUrl: FILE_URL, filename: 'photo_602_1.jpg', contentType: 'image/jpeg' };

  throws('★★★★★ 保存済みの枠へは送らない（第107便と同じ決め）',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, Object.assign({ slot: 1 }, V)),
         /既に写真が入っています（保存済み）/);
  throws('★★★★ 仮置きの枠へも送らない',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, Object.assign({ slot: 2 }, V)),
         /既に写真が入っています（仮置き）/);
  eq('★★ 空き枠へは送れる',
     P.buildEsutamaPhotoUploadRequest('sid=abc', page, Object.assign({ slot: 3 }, V)).url,
     'https://estama.jp/file_upload/therapist_tmp/cast_icon_3/');

  // ★★★★★★ 第245便（2026-09-10 実弾3発）: 差し替えは **できない**。
  //   ★ エステ魂は枠番号を見ず、いちばん小さい空き枠へ詰める。
  //     ★ 枠6を指名した2発が、実際には枠4・枠5に入った。
  //   → ★★ 埋まった枠を指名しても差し替わらない。★ 空き枠が1つ埋まるだけ。★ だから受け付けない。
  throws('★★★★★★ replace:true は受け付けない（★ エステ魂では差し替えにならない）',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, Object.assign({ slot: 1, replace: true }, V)),
         /差し替えはできません/);
  throws('★★★★★ 空き枠を指名した replace:true も止める（★ 経路そのものを塞ぐ）',
         () => P.buildEsutamaPhotoUploadRequest('sid=abc', page, Object.assign({ slot: 3, replace: true }, V)),
         /差し替えはできません/);
  eq('★★★★ 送る前の状態を記録に残す（★ 空き枠しか通らないので empty）',
     P.buildEsutamaPhotoUploadRequest('sid=abc', page, Object.assign({ slot: 3 }, V)).meta.wasState, 'empty');
}

console.log('\n── ⑩ ★★★★★ 保存して本紐づけする（第242便） ──');
//
// ★★★ ①（仮置き）だけでは写真は付かない。★ 編集フォームを保存して初めて付く（§25-1・実測）。
// ★★★★★ ここは **既存のセラピストの設定を保存する**段。★ 別人を上書きしないことが最優先。
{
  // ★ 読んだ編集フォーム（★ 追加フォームではなく、castId 付きのほう）
  const editForm = (castId, extra) => ({
    fields: [
      { name: 'cast_id', value: String(castId) },
      { name: 'ctk', value: 'a1b2c3' },
      { name: 'name', value: 'テスト' },
      { name: 'age', value: '22' },
      { name: 'type[]', value: '1' },
      { name: 'order_cast_images[]', value: 'photo1' },
      ...(extra || []),
    ],
    castIdHidden: String(castId),
    submits: [],
  });
  const TMP3 = { field: 'cast_icon_3-imgupload', value: '/temp/file_abc12_20260910113245.jpg', slot: 3 };
  const TMP4 = { field: 'cast_icon_4-imgupload', value: '/temp/file_def34_20260910113246.jpg', slot: 4 };

  eq('★★ 編集ページの URL', P.esutamaCastEditUrl('955513'), 'https://estama.jp/admin/cast_edit/955513/');
  throws('★★ castId の形が違えば作らない', () => P.esutamaCastEditUrl('../x'), /castId/);

  const g = P.buildEsutamaCastEditFormRequest('sid=abc', '955513');
  eq('★ 編集フォームは GET（読むだけ）', [g.method, g.url], ['GET', 'https://estama.jp/admin/cast_edit/955513/']);
  throws('★ cookie が無ければ読みに行かない', () => P.buildEsutamaCastEditFormRequest('', '955513'), /Cookie/);

  const r = P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(955513), '955513', [TMP3]);
  eq('★★★ 保存は POST', r.method, 'POST');
  eq('★★★ 宛先はその人の編集ページ', r.url, 'https://estama.jp/admin/cast_edit/955513/');
  eq('★★★★ 読んだ欄はそのまま返す（★ 触らない）',
     /(^|&)name=%E3%83%86%E3%82%B9%E3%83%88(&|$)/.test(r.body) && /(^|&)age=22(&|$)/.test(r.body), true);
  eq('★★★★★ 足すのは写真の組だけ',
     /(^|&)cast_icon_3-imgupload=%2Ftemp%2Ffile_abc12_20260910113245\.jpg(&|$)/.test(r.body), true);
  eq('★★ 何を保存したかを残す', r.meta, { castId: '955513', slots: [3], pairs: 7 });

  const r2 = P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(955513), '955513', [TMP3, TMP4]);
  eq('★★ 2枚まとめても送れる', r2.meta.slots, [3, 4]);

  // ★★★★★ 別人を上書きしに行かないための止め
  throws('★★★★★ 読んだフォームの cast_id が違えば保存しない（★ 別人を上書きしない）',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(999999), '955513', [TMP3]),
         /cast_id.*違います/);
  throws('★★★★★ 追加フォーム（cast_id=0）を掴んでいたら保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(0), '955513', [TMP3]),
         /追加フォーム/);

  // ★★★ 店舗様の資源を使わない（二重の見張り）
  throws('★★★ set_up_limit が混じっていたら保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc',
           editForm(955513, [{ name: 'set_up_limit', value: '1' }]), '955513', [TMP3]), /set_up_limit/);

  // ★ そのほかの止め
  throws('★★ cookie が無ければ保存しない', () => P.buildEsutamaCastPhotoSaveRequest('', editForm(955513), '955513', [TMP3]), /Cookie/);
  throws('★★★ ctk が無ければ保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc',
           { fields: [{ name: 'cast_id', value: '955513' }], castIdHidden: '955513' }, '955513', [TMP3]), /ctk/);
  throws('★★ 足す写真が0枚なら保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(955513), '955513', []), /1枚も/);
  throws('★★ 同じ枠が2回なら保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(955513), '955513', [TMP3, TMP3]), /2回/);
  throws('★★★ 欄名が枠の番号と合っていなければ保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(955513), '955513',
           [{ field: 'cast_icon_5-imgupload', value: TMP3.value, slot: 3 }]), /欄名/);
  throws('★★★ 値が仮置きの形でなければ保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc', editForm(955513), '955513',
           [{ field: 'cast_icon_3-imgupload', value: '/etc/passwd.jpg', slot: 3 }]), /仮置きの形/);
  throws('★★★★ 読んだフォームに同じ欄が在れば二重に送らない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc',
           editForm(955513, [{ name: 'cast_icon_3-imgupload', value: '/temp/old.jpg' }]), '955513', [TMP3]), /二重/);
  throws('★★★ 送信ボタンが2つ以上なら保存しない',
         () => P.buildEsutamaCastPhotoSaveRequest('sid=abc',
           Object.assign({}, editForm(955513), { submits: [{ name: 'a', value: '' }, { name: 'b', value: '' }] }),
           '955513', [TMP3]), /送信ボタンが2個/);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
