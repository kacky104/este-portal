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


// ────────────────────────────────────────────────────────────────────────────
console.log('\n── 6-2. ★★★ 選べる人（番号と名前）（第160便） ──');
//
// ★★★ なぜ名前を拾うのか
//   駅ちかは img_flg=1 + girl_id で【登録済みの人の写真】に切り替わる。
//   ★ 店舗様に選ばせるには名前が要る。★ 番号だけでは誰か分からない。
//   ★★★ その名前は **相手の編集ページの <select> が出している**。
//     ★ フクエスの import_cast_id との突き合わせを待たなくてよい。
{
  const p = A.parseEkichikaArticlePage(PAGE, 1);
  eq('★★ 番号と名前を組にして拾う', p.girls,
     [{ id: '5232208', name: 'さら' }, { id: '5232190', name: 'るい' }, { id: '5232201', name: 'りか' }]);
  eq('★ 番号だけの配列も今までどおり', p.girlIds, ['5232208', '5232190', '5232201']);
  eq('★★ 並びは画面のまま（★ 並べ替えない）', p.girls.map((g) => g.name), ['さら', 'るい', 'りか']);
  eq('★★ 選ばれている人は今までどおり別に持つ', p.girlId, '5232208');
}
{
  // ★ 名前にタグや空白が混ざっていても読める
  const html = '<html><form id="article_form">'
    + '<input type="hidden" name="id" value="1">'
    + '<select name="girl_id">'
    + '<option value="111"> <b>あかね</b> </option>'
    + '<option value="222">みか&nbsp;（新人）</option>'
    + '</select></form></html>';
  const p = A.parseEkichikaArticlePage(html, 1);
  eq('★ タグを外して前後の空白も落とす', p.girls[0], { id: '111', name: 'あかね' });
  eq('★ &nbsp; も空白として扱う', p.girls[1], { id: '222', name: 'みか （新人）' });
}
{
  // ★★★ 名前が読めなくても番号は落とさない
  const html = '<html><form id="article_form"><input type="hidden" name="id" value="1">'
    + '<select name="girl_id"><option value="333"></option></select></form></html>';
  const p = A.parseEkichikaArticlePage(html, 1);
  eq('★★★ 名前が空でも番号は残す', p.girls, [{ id: '333', name: '' }]);
}
{
  // ★ 選択肢が1つも無ければ空配列（★ null ではない。読めてはいる）
  const html = '<html><form id="article_form"><input type="hidden" name="id" value="1"></form></html>';
  eq('★★ 選択肢が無ければ空配列', A.parseEkichikaArticlePage(html, 1).girls, []);
}

console.log('\n── 7. ★★★ 一覧から枠の状態を読む（第156便） ──');
//
// ★★★ 2026-09-05 の実弾で分かったこと:
//   「送れた」＝「公開ページに出た」ではない。★ 枠そのものが非表示だと出ない。
//   その公開状態は【一覧の change_display ボタンの value】にしか無い。
//   ★ 記事の脇にある <span>(表示)</span> は **公開状態ではない**（非表示の枠でも (表示) と出ていた）。
//
// ★ 下の HTML は 2026-09-05 に実物から写した形。

const ROW_HAS = (cat, label, title, when, btn) =>
  '<tr>'
  + '<td>' + cat + '</td>'
  + '<td>' + label + '</td>'
  + '<td>' + title + '</td>'
  + '<td>' + when + '<br><span>(表示)</span></td>'
  + '<td><input type="submit" name="change_display" value="' + btn + '" class="btn"></td>'
  + '<td><a href="https://ranking-deli.jp/admin/articles/category' + cat + '/">編集</a></td>'
  + '</tr>';

const ROW_EMPTY = (cat, label) =>
  '<tr>'
  + '<td>' + cat + '</td>'
  + '<td>' + label + '</td>'
  + '<td colspan="2">記事がありません。</td>'
  + '<td><input type="button" name="dammybtn" value="非表示" class="btn"'
  + ' onclick="alert(\'表示する記事が存在しません。\');"></td>'
  + '<td><a href="https://ranking-deli.jp/admin/articles/category' + cat + '/">新規</a></td>'
  + '</tr>';

// ★ 並びは【更新の新しい順】。★ カテゴリー順ではない（ここが罠）
const LIST = '<html><body><table>'
  + '<tr><th>No</th><th>カテゴリー</th><th>タイトル</th><th>更新日時</th><th>表示</th><th></th></tr>'
  + ROW_HAS(4, 'イベント速報', '昼割のお知らせ', '2026-09-05<br>13:40:43', '表示')
  + ROW_HAS(1, '速報NEWS', '本日も営業中', '2026-09-05<br>09:00:00', '表示')
  + ROW_HAS(5, '緊急出勤速報', 'さら緊急出勤', '2026-09-04<br>22:10:05', '非表示')
  + ROW_EMPTY(2, '新人速報')
  + ROW_EMPTY(3, '激アツ割引情報')
  + '</table></body></html>';

{
  const rows = A.parseEkichikaArticleList(LIST);
  eq('★★ 5枠すべて読める', rows.length, 5);
  eq('★★★ 枠は【リンクの href】から決める（並び順から決めない）', rows.map((r) => r.slot), [1, 2, 3, 4, 5]);
  eq('★★ 相手の言葉のカテゴリー名をそのまま持つ', rows.map((r) => r.label),
     ['速報NEWS', '新人速報', '激アツ割引情報', 'イベント速報', '緊急出勤速報']);
  eq('★★★ 記事がある枠／無い枠を分ける', rows.map((r) => r.hasArticle), [true, false, false, true, true]);
  eq('★★★ 公開状態は change_display の value から読む', rows.map((r) => r.visible), [true, null, null, true, false]);
  eq('★★★ 記事が無い枠は「出ない」ではなく【分からない】（null）', rows[1].visible, null);
  eq('★★★ 飾りのボタン（dammybtn）を公開状態として読まない', rows[2].visible, null);
  eq('★ いまのタイトル', rows[3].title, '昼割のお知らせ');
  eq('★ 記事が無ければタイトルは空', rows[1].title, '');
  eq('★ 更新日時（<br> をまたいでも1つにまとめる）', rows[3].updatedAt, '2026-09-05 13:40:43');
  eq('★ 記事が無ければ更新日時も空', rows[1].updatedAt, '');
}
{
  // ★★★ (表示) の文字に引っぱられないこと。
  //   ★ 実物では「非表示の枠」の行にも <span>(表示)</span> が出ていた。
  const rows = A.parseEkichikaArticleList(
    '<html><table>' + ROW_HAS(5, '緊急出勤速報', 'あ', '2026-09-05<br>10:00:00', '非表示') + '</table></html>');
  eq('★★★ (表示) は公開状態として読まない', rows[0].visible, false);
}
{
  // ★ 知らない value が来たら null（★ 勝手に「出ている」側へ倒さない）
  const rows = A.parseEkichikaArticleList(
    '<html><table>' + ROW_HAS(1, '速報NEWS', 'あ', '2026-09-05<br>10:00:00', 'ON') + '</table></html>');
  eq('★★ 知らない値は null（＝分からない）', rows[0].visible, null);
}
{
  // ★ 属性の順番が入れ替わっても読める
  const html = '<html><table><tr><td>1</td><td>速報NEWS</td><td>あ</td><td>2026-09-05<br>10:00:00</td>'
    + '<td><input value="非表示" name="change_display" type="submit"></td>'
    + '<td><a href="/admin/articles/category1/">編集</a></td></tr></table></html>';
  eq('★ value が先に来ても読める', A.parseEkichikaArticleList(html)[0].visible, false);
}
eq('★★ 枠のリンクが無い行（見出しなど）は数えない',
   A.parseEkichikaArticleList('<table><tr><th>カテゴリー</th></tr></table>').length, 0);
eq('★★★ 読めなければ空配列（★ 呼ぶ側が「読めなかった」と止める）', A.parseEkichikaArticleList('<html></html>'), []);
eq('★★ 文字列でなければ空配列', A.parseEkichikaArticleList(null), []);
eq('★★ 1〜5 以外のカテゴリーは拾わない',
   A.parseEkichikaArticleList('<table>' + ROW_HAS(9, 'なぞ', 'あ', '2026-09-05<br>10:00:00', '表示') + '</table>').length, 0);
{
  // ★ 同じ枠が2度出ても1つ（★ 先に出たほう＝更新が新しいほうを採る）
  const html = '<table>'
    + ROW_HAS(1, '速報NEWS', 'あたらしい', '2026-09-05<br>10:00:00', '表示')
    + ROW_HAS(1, '速報NEWS', 'ふるい', '2026-09-01<br>10:00:00', '非表示')
    + '</table>';
  const rows = A.parseEkichikaArticleList(html);
  eq('★★ 同じ枠は1つだけ', rows.length, 1);
  eq('★ 先に出たほう（新しいほう）を採る', rows[0].title, 'あたらしい');
}

console.log('\n── 8. 枠を1つ取り出す ──');
{
  const rows = A.parseEkichikaArticleList(LIST);
  eq('★ 枠5が取れる', A.findArticleRow(rows, 5).label, '緊急出勤速報');
  eq('★★ 一覧に無い枠は null', A.findArticleRow([rows[0]], 5), null);
  eq('★★★ 枠が 1〜5 でなければ null', A.findArticleRow(rows, 6), null);
  eq('★★★ 枠が未指定なら null（★ 勝手にどれかを選ばない）', A.findArticleRow(rows, undefined), null);
  eq('★ 配列でなければ null', A.findArticleRow(null, 1), null);
}

console.log('\n── 9. 一覧を読む GET ──');
{
  const r = A.buildEkichikaArticleListRequest('sid=abc', UA);
  eq('GET', r.method, 'GET');
  eq('★ 宛先は一覧', r.url, A.EKICHIKA_ARTICLE_LIST_URL);
  eq('宛先の実体', r.url, 'https://ranking-deli.jp/admin/articles/');
  eq('★ Cookie を付ける', r.headers.cookie, 'sid=abc');
  eq('★★ 本文は無い（読むだけ）', r.body, undefined);
  eq('★★ Cookie が無ければ付けない（空文字を送らない）',
     Object.prototype.hasOwnProperty.call(A.buildEkichikaArticleListRequest('', UA).headers, 'cookie'), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
