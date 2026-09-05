// 駅ちかのニュース投稿（src/lib/ekichikaArticle.ts）の自己点検（第154便・2026-09-05）。
//
// ★★★ ここで危ないのは3つ:
//   ① 記事ID(id) を決め打ちする → **別の枠を上書きする**
//   ② 画像の識別子(g_image1) を落とす → **いまの画像が消える**
//   ③ display_flg を送り忘れる → **黙って非表示になる**
//
//   使い方:  npm run check:ekichikaarticle

const A = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaArticle.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const throws = (name, fn, re) => {
  try { fn(); console.log('NG ' + name + '\n   投げなかった'); fail++; }
  catch (e) { if (re && !re.test(String(e.message))) { console.log('NG ' + name + '\n   ' + e.message); fail++; } else console.log('ok ' + name); }
};

console.log('── 1. 枠（5つで固定）──');
eq('枠は5つ', A.EKICHIKA_ARTICLE_SLOTS.length, 5);
eq('1は速報NEWS', A.articleSlotLabel(1), '速報NEWS');
eq('5は緊急出勤速報', A.articleSlotLabel(5), '緊急出勤速報');
eq('★★ 知らない番号は決めつけない', A.articleSlotLabel(6), '未設定');
eq('★ 文字列も決めつけない', A.articleSlotLabel('1'), '未設定');
eq('編集ページのURL', A.ekichikaArticleEditUrl(3), 'https://ranking-deli.jp/admin/articles/category3/');
throws('★★★ 6は組み立てない', () => A.ekichikaArticleEditUrl(6), /1〜5/);
throws('★★★ 0も組み立てない', () => A.ekichikaArticleEditUrl(0));
throws('★★★ 文字列も組み立てない', () => A.ekichikaArticleEditUrl('3'));

console.log('\n── 2. タイトルの検査（※全角70文字以内）──');
eq('全角は1', A.titleWidth('あいう'), 3);
eq('半角は0.5', A.titleWidth('abc'), 1.5);
eq('★★ 絵文字は1（サロゲートペアで2に数えない）', A.titleWidth('❤'), 1);
eq('★ 空は0', A.titleWidth(''), 0);
eq('★ 文字列でなければ0', A.titleWidth(null), 0);
eq('ふつうのタイトルは通る', A.checkArticleTitle('さらさんのご紹介').ok, true);
eq('★★★ 空は止める', A.checkArticleTitle('   ').ok, false);
eq('★ 空の理由を言う', /空/.test(A.checkArticleTitle('').message), true);
eq('★★★ 全角70ちょうどは通る', A.checkArticleTitle('あ'.repeat(70)).ok, true);
eq('★★★ 全角71は止める', A.checkArticleTitle('あ'.repeat(71)).ok, false);
eq('★ 長さの理由に数字が入る', /70/.test(A.checkArticleTitle('あ'.repeat(71)).message), true);
eq('★★ 半角140は通る（0.5×140=70）', A.checkArticleTitle('a'.repeat(140)).ok, true);
eq('★★ 半角142は止める', A.checkArticleTitle('a'.repeat(142)).ok, false);
eq('★★★ 改行は止める', A.checkArticleTitle('さら\nさん').ok, false);

console.log('\n── 3. 本文の検査（相手が「できません」と言っていること）──');
eq('ふつうの本文は通る', A.checkArticleBody('<p>こんにちは<br />よろしく</p>').ok, true);
eq('★★★ 空は止める', A.checkArticleBody('').ok, false);
eq('★★★ 画像は止める', A.checkArticleBody('<p><img src="x.jpg"></p>').ok, false);
eq('★ 画像の理由を言う', /画像/.test(A.checkArticleBody('<img>').message), true);
eq('★★★ リンクは止める', A.checkArticleBody('<p><a href="http://x">x</a></p>').ok, false);
eq('★ リンクの理由を言う', /リンク/.test(A.checkArticleBody('<a href="#">x</a>').message), true);
eq('★★★ script は止める', A.checkArticleBody('<script>alert(1)</script>').ok, false);
eq('★★★ iframe も止める', A.checkArticleBody('<iframe src="x"></iframe>').ok, false);
eq('★★★ onclick は止める', A.checkArticleBody('<p onclick="x()">a</p>').ok, false);
eq('★★★ javascript: は止める', A.checkArticleBody('<p style="background:javascript:x">a</p>').ok, false);
eq('★ 大文字でも止める', A.checkArticleBody('<IMG SRC="x">').ok, false);
eq('★ <b> は通る（実測で出たタグ）', A.checkArticleBody('<p><b>太字</b></p>').ok, true);

console.log('\n── 4. 編集ページを読む（★ 決め打ちしない）──');
// ★ 2026-09-05 に実物から写した形
const PAGE = '<html><body><form action="https://ranking-deli.jp/admin/articles/category1/" method="post" id="article_form">'
  + '<input type="text" name="title" value="るいさんとの出会い" class="news_title">'
  + '<textarea name="body" class="ckeditor">ほんぶん</textarea>'
  + '<select class="select_l" name="girl_id">'
  + '<option value="5232208" selected>さら</option><option value="5232190">るい</option><option value="5232201">りか</option>'
  + '</select>'
  + '<input type="radio" name="img_flg" value="1">'
  + '<input type="radio" name="img_flg" value="0" checked="">'
  + '<input type="radio" name="display_flg" value="1" checked="" id="display_flg_yes">'
  + '<input type="radio" name="display_flg" value="0" id="display_flg_no">'
  + '<input type="hidden" name="id" value="266314">'
  + '<input type="hidden" name="g_image1" value="20260905101030">'
  + '<input type="hidden" name="g_image1s" value="20260905101031">'
  + '<input type="submit" name="post_edit_data" value="入力内容を登録する">'
  + '</form></body></html>';
{
  const p = A.parseEkichikaArticlePage(PAGE, 1);
  eq('★★★ 記事IDを読む', p.id, '266314');
  eq('★★★ 画像の識別子を読む', [p.gImage1, p.gImage1s], ['20260905101030', '20260905101031']);
  eq('★★ 選ばれている女の子', p.girlId, '5232208');
  eq('★ 選べる女の子', p.girlIds, ['5232208', '5232190', '5232201']);
  eq('★ いまの画像の出どころ', p.imgFlg, '0');
  eq('★ いまのタイトル（読み返しに使う）', p.title, 'るいさんとの出会い');
  eq('枠', p.slot, 1);
}
eq('★★★ id が無ければ null（読めなかったと無かったを混ぜない）',
   A.parseEkichikaArticlePage('<form id="article_form"></form>', 1), null);
eq('★★ 枠が 1〜5 でなければ null', A.parseEkichikaArticlePage(PAGE, 9), null);
eq('★ 文字列でなければ null', A.parseEkichikaArticlePage(null, 1), null);

console.log('\n── 5. ★★★ 送るものを組み立てる ──');
const PAGE1 = A.parseEkichikaArticlePage(PAGE, 1);
const UA = 'test-agent';
const decode = (body) => Object.fromEntries(body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)));
{
  const r = A.buildEkichikaArticleSaveRequest('sid=abc', PAGE1, { title: 'あたらしいタイトル', body: '<p>ほんぶん</p>' }, UA);
  const f = decode(r.body);
  eq('宛先は読んだ枠と同じ', r.url, 'https://ranking-deli.jp/admin/articles/category1/');
  eq('POST', r.method, 'POST');
  eq('フォームの形で送る', r.headers['content-type'], 'application/x-www-form-urlencoded');
  eq('★★★ 記事IDは読んだものをそのまま', f.id, '266314');
  eq('★★★ 画像の識別子を落とさない', [f.g_image1, f.g_image1s], ['20260905101030', '20260905101031']);
  eq('★★★ display_flg は必ず 1（黙って非表示にしない）', f.display_flg, '1');
  eq('★★ 女の子は読んだ選択のまま（勝手に変えない）', f.girl_id, '5232208');
  eq('★★ 画像の出どころも読んだまま（既定は keep）', f.img_flg, '0');
  eq('タイトル', f.title, 'あたらしいタイトル');
  eq('本文', f.body, '<p>ほんぶん</p>');
  eq('送信ボタンの名前も送る', f.post_edit_data, '入力内容を登録する');
  eq('★★★ 送る項目は9つ（8項目＋送信ボタン）', Object.keys(f).length, 9);
  eq('★ csrf を勝手に足さない', Object.keys(f).some((k) => /csrf|token/i.test(k)), false);
}
{
  // ★ 女の子の写真を使う
  const r = A.buildEkichikaArticleSaveRequest('sid=abc', PAGE1,
    { title: 'るいさん', body: '<p>x</p>', girlId: '5232190', image: 'girl' }, UA);
  const f = decode(r.body);
  eq('★★ 写真を使うなら img_flg=1', f.img_flg, '1');
  eq('★★ 指定した女の子になる', f.girl_id, '5232190');
}
throws('★★★ Cookie が無ければ組み立てない', () => A.buildEkichikaArticleSaveRequest('', PAGE1, { title: 'a', body: '<p>x</p>' }, UA), /Cookie/);
throws('★★★ 読んだページが無ければ組み立てない', () => A.buildEkichikaArticleSaveRequest('sid=abc', null, { title: 'a', body: '<p>x</p>' }, UA));
throws('★★★ タイトルが長ければ送らない', () => A.buildEkichikaArticleSaveRequest('sid=abc', PAGE1, { title: 'あ'.repeat(71), body: '<p>x</p>' }, UA), /タイトル/);
throws('★★★ 本文に画像があれば送らない', () => A.buildEkichikaArticleSaveRequest('sid=abc', PAGE1, { title: 'a', body: '<img src=x>' }, UA), /本文/);
throws('★★★ 選択肢に無い女の子は送らない',
  () => A.buildEkichikaArticleSaveRequest('sid=abc', PAGE1, { title: 'a', body: '<p>x</p>', girlId: '999999', image: 'girl' }, UA), /選択肢/);
throws('★★ 記事IDが壊れていれば送らない',
  () => A.buildEkichikaArticleSaveRequest('sid=abc', Object.assign({}, PAGE1, { id: '' }), { title: 'a', body: '<p>x</p>' }, UA), /記事ID/);

console.log('\n── 6. 読むだけの GET ──');
{
  const r = A.buildEkichikaArticleReadRequest('sid=abc', 5, UA);
  eq('GET', r.method, 'GET');
  eq('宛先', r.url, 'https://ranking-deli.jp/admin/articles/category5/');
  eq('★ Cookie を付ける', r.headers.cookie, 'sid=abc');
  eq('★ 本文は無い', r.body, undefined);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
