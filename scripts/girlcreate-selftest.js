// 駅ちかの新規登録の部品（htmlForm / ekichikaGirlCreate）の自己点検（第233便）。
//
// ★★★ なぜ要るか
//   ここは **相手に人を増やす** ところ。★ 番号を1つ間違えると、まったく違う特徴の人が公開ページに出る。
//   ★ しかも登録は取り消せない（消すには第228便の削除が要る）。★ だから【送る前】を点検で固める。
//
//   使い方:  npm run check:girlcreate

const path = require('path');
const H = require(path.join(__dirname, '..', '_tmpcheck', 'htmlForm.js'));
const G = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaGirlCreate.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const throws = (name, fn, re) => {
  try { fn(); console.log('NG ' + name + '（例外にならなかった）'); fail++; }
  catch (e) { if (re && !re.test(e.message)) { console.log('NG ' + name + '（違う例外: ' + e.message + '）'); fail++; } else console.log('ok ' + name); }
};

const CSRF = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
// ★ 実物のカップは 0=- / 1=Aカップ / 2=Bカップ / 3=Cカップ …（★ D以降の番号は**未確認**）。
//   ★★ だからコードは番号を決め打ちせず、**ラベルで引く**。ここでも D を「4」にしてそれを確かめる。
const CUPS = [['0', '-'], ['1', 'Aカップ'], ['2', 'Bカップ'], ['3', 'Cカップ'], ['4', 'Dカップ']];
const GENRES = ['1', '5', '11', '49', '78'];

function girlPage(opt) {
  const o = Object.assign({ csrf: CSRF, checkedGenre: '5', nameMax: '20', marker: true, pGenreChecked: false }, opt || {});
  // ★★ 画面に別の form が在る想定（検索窓）。★ こちらを読んでしまわないことを見張る
  let h = '<html><body>'
    + '<form method="GET"><input type="text" name="keyword" value="さくら"><input type="submit" value="検索"></form>';
  h += '<form method="POST" action="/admin/girls/create/">';
  h += '<input type="hidden" name="fuel_csrf_token" value="' + o.csrf + '">';
  h += '<input type="text" name="name" value=""' + (o.nameMax ? ' maxlength="' + o.nameMax + '"' : '') + '>';
  if (o.marker) h += '<input type="text" name="catchcopy" value="" maxlength="15">';
  h += '<input type="text" name="age" value=""><input type="text" name="tall" value="">';
  h += '<input type="text" name="bust" value=""><input type="text" name="waist" value=""><input type="text" name="hip" value="">';
  h += '<select name="cup">' + CUPS.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') + '</select>';
  h += '<select name="bloodtype"><option value="0">未選択</option><option value="1" selected>A</option></select>';
  h += '<textarea name="girl_comments"></textarea>';
  for (const g of GENRES) {
    h += '<input type="checkbox" name="genre[' + g + ']" value="1"' + (g === o.checkedGenre ? ' checked' : '') + '>';
  }
  h += '<input type="checkbox" name="p_genre[1]" value="1"' + (o.pGenreChecked ? ' checked' : '') + '>';
  h += '<input type="hidden" name="p_genre_max_num" value="3">';
  h += '<input type="hidden" name="girls_genre_max_num" value="19">';
  h += '<input type="submit" name="btn_regist" value="登録する">';
  return h + '</form></body></html>';
}

// ── ① 共通の読み手（htmlForm）───────────────────────────────
{
  const f = H.parseHtmlForm(girlPage(), { containsNames: ['fuel_csrf_token', 'catchcopy'] });
  const names = f.fields.map((x) => x.name);
  eq('★★★ 目印を持つ form を選ぶ（検索窓を読まない）', names.includes('keyword'), false);
  eq('★ 目当ての form を読んでいる', names.includes('fuel_csrf_token') && names.includes('catchcopy'), true);
  eq('★★ maxlength を画面から拾う（★ 上限をコードに書き写さない）', [f.maxLengths['name'], f.maxLengths['catchcopy']], [20, 15]);
  eq('★★ select の選択肢をラベルつきで返す', f.selectOptions['cup'].map((o) => o.value + '=' + o.label).join(','),
     '0=-,1=Aカップ,2=Bカップ,3=Cカップ,4=Dカップ');
  eq('★ selected の無い select は先頭（ブラウザと同じ）', f.fields.find((x) => x.name === 'cup').value, '0');
  eq('★ selected のある select はその値', f.fields.find((x) => x.name === 'bloodtype').value, '1');
  eq('★★ チェックの有無によらず、選択肢の値を全部返す', f.choiceValues['genre[49]'], ['1']);
  eq('★ チェック済みのものだけ送る形に入る', f.fields.filter((x) => /^genre\[/.test(x.name)).map((x) => x.name), ['genre[5]']);
  eq('★★ 送信ボタンは送らない', names.includes('btn_regist'), false);
  eq('★ 素直な形では警告が出ない', f.warnings, []);

  // ★★★ 目印が無ければ【別の form を「たぶんこれ」で読まない】
  const g = H.parseHtmlForm(girlPage({ marker: false }), { containsNames: ['fuel_csrf_token', 'catchcopy'] });
  eq('★★★ 目印の欄が無ければ読まない', g.fields.length, 0);
  eq('★★★ そのとき理由が残る', g.warnings.length >= 1, true);
  eq('★★★ form が1つも無ければ警告つきで空',
     [H.parseHtmlForm('<html>メンテナンス中</html>').fields.length, H.parseHtmlForm('<html>x</html>').warnings.length >= 1], [0, true]);
}

// ── ② ラベルで引く（★ 番号を決め打ちしないための道具）─────────
{
  const opts = CUPS.map(([value, label]) => ({ value, label }));
  eq('★★★ ラベルから番号を引く', H.optionValueByLabel(opts, 'Dカップ'), '4');
  eq('★ 前後の空白は無視する', H.optionValueByLabel(opts, ' Aカップ '), '1');
  eq('★★★ 無いラベルは null（★ 「たぶんこれ」で近いものを返さない）', H.optionValueByLabel(opts, 'Zカップ'), null);
  eq('★ 部分一致では引かない', H.optionValueByLabel(opts, 'カップ'), null);
  eq('★ 選択肢が無ければ null', H.optionValueByLabel(undefined, 'Aカップ'), null);
}

// ── ③ 駅ちかの読み手 ────────────────────────────────────────
const form = G.parseEkichikaGirlForm(girlPage());
{
  eq('★ 使い捨てトークンが取れる', form.csrfToken, CSRF);
  eq('★★ 画面に在るジャンルの番号を全部拾う', form.genreIds, GENRES);
  eq('★ 素直な形では警告が出ない', form.warnings, []);
  const bad = G.parseEkichikaGirlForm('<html>メンテナンス中</html>');
  eq('★★★ 読めない画面を「0件」で通さない', [bad.fields.length, bad.warnings.length >= 1], [0, true]);
}

// ── ④ 送る形 ───────────────────────────────────────────────
const V = { name: 'さくら', genreIds: [1, 49], age: '24', tall: '158', bust: '85', waist: '58', hip: '86', cup: 'D' };
{
  const r = G.buildEkichikaGirlCreateRequest('c=1', form, V);
  const pairs = r.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent));
  const got = (n) => pairs.filter(([k]) => k === n).map(([, v]) => v);

  eq('★★★ 登録は POST', r.method, 'POST');
  eq('★★★ 宛先は新規登録の口', r.url, 'https://ranking-deli.jp/admin/girls/create/');
  eq('★ 名前が入る', got('name'), ['さくら']);
  eq('★ 年齢・身長・3サイズが入る', [got('age'), got('tall'), got('bust'), got('waist'), got('hip')],
     [['24'], ['158'], ['85'], ['58'], ['86']]);
  eq('★★★ カップはラベルで引いた番号（D→4）', got('cup'), ['4']);
  eq('★★★ ジャンルは選んだものだけ', [got('genre[1]'), got('genre[49]')], [['1'], ['1']]);
  eq('★★★ 読んだ画面でチェックされていたジャンルは持ち越さない', got('genre[5]'), []);
  eq('★★★★ 新人マークを混ぜる（★ 画面に欄は無いが通る・実弾で確認済み）', got('rookie_flg'), ['1']);
  eq('★★★ 体験入店（2）は使わない（月10人の枠を消費するため）', G.EKICHIKA_ROOKIE_FLG, '1');
  eq('★★ 使い捨てトークンを持って行く', got('fuel_csrf_token'), [CSRF]);
  eq('★★ 触っていない欄は読んだまま', [got('bloodtype'), got('girl_comments'), got('catchcopy')], [['1'], [''], ['']]);
  eq('★★ 相手の hidden もそのまま返す', [got('p_genre_max_num'), got('girls_genre_max_num')], [['3'], ['19']]);
  eq('★★★ 優先タグは送らない', got('p_genre[1]'), []);

  // ★ カップのラベルが無いときは【送らない】（読んだフォームのまま）
  const noCup = G.buildEkichikaGirlCreateRequest('c=1', form, Object.assign({}, V, { cup: 'Z' }));
  const cupVals = noCup.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)).filter(([k]) => k === 'cup').map(([, v]) => v);
  eq('★★ 知らないカップは既定のまま（勝手な番号を作らない）', cupVals, ['0']);
}

// ── ⑤ 止める条件（★ 迷ったら送らない）──────────────────────
{
  const bad = (o) => Object.assign({}, V, o);
  throws('★★ cookie が無ければ登録しない', () => G.buildEkichikaGirlCreateRequest('', form, V), /Cookie/);
  throws('★★★ 名前が空なら登録しない', () => G.buildEkichikaGirlCreateRequest('c=1', form, bad({ name: '  ' })), /名前が空/);
  throws('★★★ 画面の maxlength を超えたら登録しない',
         () => G.buildEkichikaGirlCreateRequest('c=1', form, bad({ name: 'あ'.repeat(21) })), /20文字以内/);
  eq('★ ちょうど20文字は通る', G.buildEkichikaGirlCreateRequest('c=1', form, bad({ name: 'あ'.repeat(20) })).method, 'POST');
  throws('★★★ ジャンル0個なら登録しない（相手の必須）', () => G.buildEkichikaGirlCreateRequest('c=1', form, bad({ genreIds: [] })), /1つも無い/);
  throws('★★★ 画面に無いジャンルの番号は送らない',
         () => G.buildEkichikaGirlCreateRequest('c=1', form, bad({ genreIds: [1, 999] })), /画面に無い/);
  throws('★★ 20個は多すぎる（相手は19まで）',
         () => G.buildEkichikaGirlCreateRequest('c=1', form, bad({ genreIds: Array.from({ length: 20 }, () => 1) })), /19つまで/);
  throws('★★ 年齢が数字でなければ登録しない', () => G.buildEkichikaGirlCreateRequest('c=1', form, bad({ age: '二十四' })), /年齢/);
  throws('★★ バストが4けたなら登録しない', () => G.buildEkichikaGirlCreateRequest('c=1', form, bad({ bust: '1234' })), /バスト/);
  throws('★★★ トークンが無ければ登録しない',
         () => G.buildEkichikaGirlCreateRequest('c=1', Object.assign({}, form, { csrfToken: null }), V), /fuel_csrf_token/);
  throws('★★★ 優先タグが混じっていたら送らない（二重の見張り）',
         () => G.buildEkichikaGirlCreateRequest('c=1', G.parseEkichikaGirlForm(girlPage({ pGenreChecked: true })), V), /p_genre/);

  const g = G.buildEkichikaGirlFormRequest('c=1');
  eq('★ 登録フォームは GET（読むだけ）', [g.method, g.url], ['GET', 'https://ranking-deli.jp/admin/girls/create/']);
  throws('★ cookie が無ければ読みに行かない', () => G.buildEkichikaGirlFormRequest(''), /Cookie/);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
