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

// ★ 実測の形（2026-09-10 10:44・編集ページのコンソールで採取）をなぞった作り物
const slotInput = (n, opt) => {
  const o = Object.assign({ post: '/file_upload/therapist_tmp/cast_icon_' + n + '/', input: 'cast_icon_' + n }, opt || {});
  return '<input type="file" id="cast_icon_' + n + '"'
    + (o.input === null ? '' : ' data-input="' + o.input + '"')
    + (o.post === null ? '' : ' data-post_url="' + o.post + '"')
    + ' class="upload_photo_input_admin_therapist_photo">';
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
  eq('★ 何をどこへ送ったかを残す', r.meta, { slot: 1, id: 'cast_icon_1', dir: 'cast_icon_1', filename: 'photo_602_1.jpg', contentType: 'image/jpeg' });

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

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
