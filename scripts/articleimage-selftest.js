// 記事に独自の画像を付ける（src/lib/ekichikaArticleImage.ts）の自己点検（第161便・2026-09-05）。
//
// ★★★ ここで危ないのは:
//   ① fuel_csrf_token / shopid を読めていないのに組み立てる → ★ 断られる（第145便の反省）
//   ② ページの中で値が食い違っているのに、最初のものを使う   → ★ 気づかずに間違ったものを送る
//   ③ 「読めなかった」と「相手が断った」を混ぜる           → ★ 直す場所を間違える
//   ④ 切り抜きが画像の外へはみ出す                        → ★ 相手に断られる／顔が切れる
//   ⑤ 10MB を超える画像を送る                            → ★ 相手の注記に反する
//
//   使い方:  npm run check:articleimage

const path = require('path');
const A = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaArticleImage.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const throws = (name, fn, re) => {
  try { fn(); console.log('NG ' + name + '（例外が出なかった）'); fail++; }
  catch (e) {
    if (re && !re.test(String(e.message))) { console.log('NG ' + name + '\n   message ' + e.message); fail++; }
    else console.log('ok ' + name);
  }
};

// ★ 2026-09-05 に実物から写した形（値は実測どおり・トークンは長さだけ合わせた作り物）
const TOKEN = 'a'.repeat(128);
const PAGE = '<html><body>'
  + '<form action="#"><input type="hidden" name="fuel_csrf_token" value="' + TOKEN + '">'
  + '<input type="hidden" name="shopid" value="37168"></form>'
  + '<form action="/admin/articles/category5/" method="post" id="article_form">'
  + '<input type="hidden" name="id" value="266318">'
  + '<input type="hidden" name="shopid" value="37168">'
  + '<input type="hidden" name="fuel_csrf_token" value="' + TOKEN + '">'
  + '</form>'
  + '<form><input type="hidden" name="shopid" value="37168"></form>'
  + '</body></html>';

console.log('── 0. ★★★ ページから拾う ──');
{
  const ids = A.parseArticleImageIds(PAGE);
  eq('★★ 読めた（実測どおり csrf が2つ・shopid が3つ・どれも同じ）', ids.problems, []);
  eq('★ shopid', ids.shopId, '37168');
  eq('★ token の長さ（実測128文字）', ids.csrfToken.length, 128);
}
{
  // ★★★ 値が食い違っていたら【読めなかったことにする】。★ 最初のものを黙って使わない
  const bad = PAGE.replace('value="' + TOKEN + '"><input type="hidden" name="shopid" value="37168"></form>'
    , 'value="' + 'b'.repeat(128) + '"><input type="hidden" name="shopid" value="37168"></form>');
  const ids = A.parseArticleImageIds(bad);
  eq('★★★ token が食い違えば読めなかった扱い', ids.problems, ['fuel_csrf_token の値がページの中で食い違っている']);
  eq('★★★ そのとき値は返さない', [ids.csrfToken, ids.shopId], ['', '']);
}
{
  const bad = PAGE.replace('name="shopid" value="37168"></form></body>', 'name="shopid" value="99999"></form></body>');
  eq('★★★ shopid が食い違っても読めなかった扱い',
     A.parseArticleImageIds(bad).problems, ['shopid の値がページの中で食い違っている']);
}
eq('★★ 1つも無ければ、無いと言う',
   A.parseArticleImageIds('<html></html>').problems,
   ['fuel_csrf_token が取れていない', 'shopid が取れていない']);
eq('★★ token の形が違えば止める',
   A.parseArticleImageIds('<input name="fuel_csrf_token" value="xyz"><input name="shopid" value="1">').problems,
   ['fuel_csrf_token の形が違う']);
eq('★★ shopid が数字でなければ止める',
   A.parseArticleImageIds('<input name="fuel_csrf_token" value="' + TOKEN + '"><input name="shopid" value="ab">').problems,
   ['shopid の形が違う']);
eq('★ 文字列でなければ、無いと言う', A.parseArticleImageIds(null).problems.length, 2);

console.log('\n── 1. ★★ 送る前に弾く（画像） ──');
eq('★ 普通の JPEG は通る', A.checkArticleImage({ bytes: 500 * 1024, contentType: 'image/jpeg' }).ok, true);
eq('★ PNG も通る', A.checkArticleImage({ bytes: 500 * 1024, contentType: 'image/PNG' }).ok, true);
eq('★★ ちょうど10MBは通る', A.checkArticleImage({ bytes: A.ARTICLE_IMAGE_MAX_BYTES, contentType: 'image/jpeg' }).ok, true);
{
  const r = A.checkArticleImage({ bytes: A.ARTICLE_IMAGE_MAX_BYTES + 1, contentType: 'image/jpeg' });
  eq('★★★ 10MBを超えたら送らない', r.ok, false);
  eq('★ 何MBあるかを店舗様の言葉で言う', /10MBまでのところ/.test(r.message), true);
}
eq('★★ 種類が違えば送らない', A.checkArticleImage({ bytes: 100, contentType: 'image/gif' }).ok, false);
eq('★★ 大きさが分からなければ送らない', A.checkArticleImage({ bytes: 0, contentType: 'image/jpeg' }).ok, false);

console.log('\n── 2. ★★★ ① 上げるものを組み立てる ──');
const IDS = A.parseArticleImageIds(PAGE);
const FILE = { url: 'https://fukues.com/api/relay/file?x=1', filename: 'news_1.jpg', contentType: 'image/jpeg' };
{
  const m = A.buildArticleImageUpload(IDS, FILE);
  eq('★★★ 送る文字の項目は2つだけ（実測どおり）', Object.keys(m.fields), ['shopid', 'fuel_csrf_token']);
  eq('★ shopid', m.fields.shopid, '37168');
  eq('★★★ fuel_csrf_token を必ず入れる（★ ここが第145便の反省）', m.fields.fuel_csrf_token.length, 128);
  eq('★★ ファイルの項目名は upfile（実測）', m.files.map((f) => f.field), ['upfile']);
  eq('★★★ 画像そのものは通さない。場所だけ載せる（第106便・案B）', m.files[0].url, FILE.url);
  eq('★ 1枚だけ', m.files.length, 1);
}
throws('★★★ 読めていないページからは組み立てない',
  () => A.buildArticleImageUpload({ csrfToken: '', shopId: '', problems: ['x'] }, FILE), /読めていない/);
throws('★★ token が空なら組み立てない',
  () => A.buildArticleImageUpload({ csrfToken: '', shopId: '37168', problems: [] }, FILE), /fuel_csrf_token/);
throws('★★ shopid の形が違えば組み立てない',
  () => A.buildArticleImageUpload({ csrfToken: TOKEN, shopId: 'abc', problems: [] }, FILE), /shopid/);

console.log('\n── 3. ★★★ ② 切るものを組み立てる ──');
const UP = { imgB: '20260905172422', srcUrl: 'https://dv6drgre1bci1.cloudfront.net/files.ranking-deli.jp/37168/news/img1_20260905172422.jpg' };
{
  // ★ 2026-09-05 の実測とまったく同じ値で組み立てる
  const f = Object.fromEntries(A.buildArticleImageCropFields(IDS, UP, { x: 98, y: 160, w: 180, h: 180 }, { w: 375, h: 500 }));
  eq('★★★ 実測と同じ項目がそろう', Object.keys(f).sort(),
     ['edt_type', 'fuel_csrf_token', 'h', 'image_b', 'img_b', 'sh_h', 'sh_w', 'shopid', 'w', 'x', 'y'].sort());
  eq('★ 切り抜きの位置と大きさ', [f.x, f.y, f.w, f.h], ['98', '160', '180', '180']);
  eq('★★ 表示空間の大きさも送る（★ 座標の物差し）', [f.sh_w, f.sh_h], ['375', '500']);
  eq('★★ ①で返ってきた識別子をそのまま', f.img_b, '20260905172422');
  eq('★★ ①で返ってきた場所をそのまま', f.image_b, UP.srcUrl);
  eq('★★★ edt_type は 2（実測）', f.edt_type, A.ARTICLE_CROP_EDT_TYPE);
  eq('★★★ ここにも fuel_csrf_token が要る', f.fuel_csrf_token.length, 128);
}
{
  // ★★ 実寸で送る形（写真の②と同じ理屈）。★ 記事では未確認なので、呼ぶ側が sh を渡す
  const f = Object.fromEntries(A.buildArticleImageCropFields(IDS, UP, { x: 0, y: 0, w: 600, h: 800 }, { w: 600, h: 800 }));
  eq('★★ 画像ぜんぶを切り抜く形も作れる', [f.x, f.y, f.w, f.h, f.sh_w, f.sh_h], ['0', '0', '600', '800', '600', '800']);
}
eq('★ 小数は丸める',
   Object.fromEntries(A.buildArticleImageCropFields(IDS, UP, { x: 1.4, y: 1.6, w: 10, h: 10 }, { w: 100, h: 100 })).x, '1');
throws('★★★ 右へはみ出したら組み立てない',
  () => A.buildArticleImageCropFields(IDS, UP, { x: 90, y: 0, w: 20, h: 10 }, { w: 100, h: 100 }), /はみ出/);
throws('★★★ 下へはみ出したら組み立てない',
  () => A.buildArticleImageCropFields(IDS, UP, { x: 0, y: 95, w: 10, h: 20 }, { w: 100, h: 100 }), /はみ出/);
throws('★★ 幅が0なら組み立てない',
  () => A.buildArticleImageCropFields(IDS, UP, { x: 0, y: 0, w: 0, h: 10 }, { w: 100, h: 100 }), /0より大きい/);
throws('★★ 負の値は組み立てない',
  () => A.buildArticleImageCropFields(IDS, UP, { x: -1, y: 0, w: 10, h: 10 }, { w: 100, h: 100 }), /不正/);
throws('★★★ ①の識別子が無ければ組み立てない',
  () => A.buildArticleImageCropFields(IDS, { imgB: '', srcUrl: UP.srcUrl }, { x: 0, y: 0, w: 10, h: 10 }, { w: 100, h: 100 }), /img_b/);
throws('★★ ①の場所が http でなければ組み立てない',
  () => A.buildArticleImageCropFields(IDS, { imgB: UP.imgB, srcUrl: 'javascript:x' }, { x: 0, y: 0, w: 10, h: 10 }, { w: 100, h: 100 }), /場所/);
throws('★★★ 読めていないページからは組み立てない',
  () => A.buildArticleImageCropFields({ csrfToken: '', shopId: '', problems: ['x'] }, UP, { x: 0, y: 0, w: 1, h: 1 }, { w: 1, h: 1 }), /読めていない/);

console.log('\n── 4. ★★★ 応答を読む ──');
{
  // ★ ①の実測（2026-09-05 17:24）
  const r = A.parseArticleImageJson(JSON.stringify({
    src: 'https://dv6drgre1bci1.cloudfront.net/files.ranking-deli.jp/37168/news/img1_20260905172422.jpg',
    img_b: '20260905172422', img_s: '', err: '',
  }));
  eq('★★ ①は img_b が返る', r.imgB, '20260905172422');
  eq('★★★ ①の時点で img_s は空（★ これは異常ではない）', r.imgS, '');
  eq('★ 読めなかった理由は無い', r.problems, []);
  eq('★ 相手のエラーも無い', r.err, '');
}
{
  // ★ ②の実測（2026-09-05 17:25）
  const r = A.parseArticleImageJson(JSON.stringify({
    src: 'https://…/img1s_20260905172523.jpg', src_b: 'https://…/img1_20260905172422.jpg',
    img_b: '20260905172422', img_s: '20260905172523', err: '',
  }));
  eq('★★★ ②で img_s が返る（★ 記事の g_image1s に入れる）', r.imgS, '20260905172523');
  eq('★★ img_b は①のまま（★ 記事の g_image1 に入れる）', r.imgB, '20260905172422');
}
{
  // ★★★ 「読めなかった」と「相手が断った」を混ぜない
  const r = A.parseArticleImageJson(JSON.stringify({ src: '', img_b: '', img_s: '', err: 'ファイルサイズが大きすぎます' }));
  eq('★★★ 相手が断ったときは、その文をそのまま持つ', r.err, 'ファイルサイズが大きすぎます');
  eq('★★★ そのとき「読めなかった」とは言わない', r.problems, []);
}
{
  const r = A.parseArticleImageJson(JSON.stringify({ src: '', img_b: '', img_s: '', err: '' }));
  eq('★★ 断られてもいないのに識別子が無ければ、読めなかったと言う',
     r.problems, ['画像の識別子（img_b）が返っていない', '画像の場所（src）が返っていない']);
}
eq('★★ JSON でなければ、読めなかったと言う',
   A.parseArticleImageJson('<html>error</html>').problems, ['応答が JSON ではない']);
eq('★★ 配列も JSON ではない扱い', A.parseArticleImageJson('[1,2]').problems, ['応答が JSON ではない']);
eq('★ 文字列でなければ、読めなかったと言う', A.parseArticleImageJson(null).problems, ['応答が JSON ではない']);

console.log('\n── 5. 宛先 ──');
eq('★ ① の宛先', A.EKICHIKA_ARTICLE_IMAGE_URL, 'https://ranking-deli.jp/ajax/admin/article_image.json');
eq('★ ② の宛先', A.EKICHIKA_ARTICLE_CROP_URL, 'https://ranking-deli.jp/ajax/admin/article_crop.json');
eq('★★ どちらも駅ちか（★ 宛先を増やさない）',
   [A.EKICHIKA_ARTICLE_IMAGE_URL, A.EKICHIKA_ARTICLE_CROP_URL].every((u) => u.startsWith('https://ranking-deli.jp/')), true);
eq('★ 上限は10MB', A.ARTICLE_IMAGE_MAX_BYTES, 10 * 1024 * 1024);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
