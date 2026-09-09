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
  const o = Object.assign({ csrf: CSRF, checkedGenre: '5', nameMax: '20', marker: true, pGenreChecked: false,
    action: '/admin/girls/create/' }, opt || {});
  // ★★ 画面に別の form が在る想定（検索窓）。★ こちらを読んでしまわないことを見張る
  let h = '<html><body>'
    + '<form method="GET"><input type="text" name="keyword" value="さくら"><input type="submit" value="検索"></form>';
  h += '<form method="POST"' + (o.action === null ? '' : ' action="' + o.action + '"') + '>';
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
  // ★★★★ 実物の送信ボタン（2026-09-09 実測）。★ 駅ちかはボタンの名前で処理を決める
  h += '<input type="submit" name="update-btn" value="">';
  if (o.extraSubmit) h += '<input type="submit" name="delete-btn" value="削除">';
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
  eq('★★ 送信ボタンは fields に入れない（ブラウザは押した1つだけを送る）', names.includes('update-btn'), false);
  eq('★★★★ 送信ボタンは分けて返す（★ 送る側が「どれを押すか」を決める）', f.submits, [{ name: 'update-btn', value: '' }]);
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
  // ★★★★ 2026-09-09 の実弾で欠けていたもの。★ これが無いと駅ちかは「押されていない」と見る
  eq('★★★★ 押したボタン（update-btn）を送る', got('update-btn'), ['']);

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

  // ★★★ 送信ボタンが2つ以上あったら、どれを押すかを勝手に決めない
  throws('★★★ 送信ボタンが2つ以上なら送らない',
         () => G.buildEkichikaGirlCreateRequest('c=1', G.parseEkichikaGirlForm(girlPage({ extraSubmit: true })), V), /送信ボタンが2個/);

  const g = G.buildEkichikaGirlFormRequest('c=1');
  eq('★ 登録フォームは GET（読むだけ）', [g.method, g.url], ['GET', 'https://ranking-deli.jp/admin/girls/create/']);
  throws('★ cookie が無ければ読みに行かない', () => G.buildEkichikaGirlFormRequest(''), /Cookie/);
}

// ── ④ ★★★★ 送り先は【読んだフォームの action】（第235便・設計メモ §17-8）─────────
//   ★ 2026-09-09、駅ちかへの書き込みで**動いているのは出勤だけ**で、
//     出勤だけが「読んだフォームの action」へ送っていた。★ 登録と削除は URL を決め打ちしていた。
//   ★★ ここは **決め打ちに戻らないための番人**。
{
  const V2 = { name: 'てすと', genreIds: [1, 11], age: '24', tall: '160', bust: '85', waist: '58', hip: '86', cup: 'D' };
  const base = 'https://ranking-deli.jp/admin/girls/create/';

  const f1 = G.parseEkichikaGirlForm(girlPage());
  eq('★★★★ 相対の action を絶対に直して持ち帰る', f1.action, base);
  eq('★ method も読む', f1.formMethod, 'POST');

  const r1 = G.buildEkichikaGirlCreateRequest('c=1', f1, V2);
  eq('★★★★ 既定は action へ送る', [r1.url, r1.meta.sentTo], [base, 'action']);

  // ★ action が決め打ちと違う画面（★ 相手が変えたら、こちらは黙って追随する）
  const f2 = G.parseEkichikaGirlForm(girlPage({ action: '/admin/girls/create_exe/' }));
  eq('★★★ 決め打ちと違う action も読む', f2.action, 'https://ranking-deli.jp/admin/girls/create_exe/');
  eq('★★★★ そちらへ送る（★ 決め打ちに戻らない）',
     G.buildEkichikaGirlCreateRequest('c=1', f2, V2).url, 'https://ranking-deli.jp/admin/girls/create_exe/');

  // ★ action が空／無い＝そのページ自身（ブラウザと同じ）
  eq('★★ action が空ならページ自身', G.parseEkichikaGirlForm(girlPage({ action: '' })).action, base);
  eq('★★ action が無くてもページ自身', G.parseEkichikaGirlForm(girlPage({ action: null })).action, base);

  // ★★★★ 他所のドメインへは【送らない】。★ 店舗様の Cookie を飛ばさない
  throws('★★★★ 別サイトの action へは送らない（Cookie を他所へ飛ばさない）',
         () => G.buildEkichikaGirlCreateRequest('c=1', G.parseEkichikaGirlForm(girlPage({ action: 'https://cocoa-job.jp/login' })), V2),
         /駅ちかではありません/);

  // ★ 切り分け用の逃げ道（★ コードを直さずに元のやり方へ戻せる）
  const rf = G.buildEkichikaGirlCreateRequest('c=1', f2, V2, { postTo: 'fixed' });
  eq('★★ postTo:fixed なら決め打ちの URL', [rf.url, rf.meta.sentTo], [base, 'fixed']);
  eq('★ そのときも読めた action は記録に残す', rf.meta.formAction, 'https://ranking-deli.jp/admin/girls/create_exe/');
}

// ── ⑤ ★★★ rookie_flg を外せる（第235便・§17-4 の切り分け用）─────────
{
  const V2 = { name: 'てすと', genreIds: [1] };
  const f = G.parseEkichikaGirlForm(girlPage());
  const on = G.buildEkichikaGirlCreateRequest('c=1', f, V2);
  const off = G.buildEkichikaGirlCreateRequest('c=1', f, V2, { rookie: false });
  eq('★★★ 既定では新人マークを付ける', /(^|&)rookie_flg=1(&|$)/.test(on.body), true);
  eq('★★★★ rookie:false なら【1つも】混ぜない', /rookie_flg/.test(off.body), false);
  eq('★ どちらだったかを記録に残す', [on.meta.rookie, off.meta.rookie], [true, false]);
  eq('★ 外しても登録そのものは成り立つ（名前とジャンルは残る）',
     /(^|&)name=/.test(off.body) && /(^|&)genre%5B1%5D=1(&|$)/.test(off.body), true);
}

// ── ⑥ ★★★★ 送った全文を持ち帰る（第235便・設計メモ §17-5）─────────
//   ★ 2026-09-09 は送った本文がどこにも残っておらず、4回とも推測で終わった。
{
  const f = G.parseEkichikaGirlForm(girlPage());
  const r = G.buildEkichikaGirlCreateRequest('c=1', f, { name: 'てすと', genreIds: [1] });
  eq('★★★★ 本文をそのまま持ち帰る（突き合わせ用）', r.meta.body, r.body);
  eq('★ 組の数も数える', r.meta.pairs, r.body.split('&').length);
}

// ── ⑦ ★★★ urlencoded はブラウザと同じ作り方（第235便）─────────
//   ★ サーバは同じに読むが、**突き合わせるときに差として見えてしまう**ので揃えた。
{
  const f = G.parseEkichikaGirlForm(girlPage());
  const r = G.buildEkichikaGirlCreateRequest('c=1', f, { name: 'さくら もも', genreIds: [1] });
  eq('★★★ 空白は %20 ではなく + （ブラウザと同じ）', /name=%E3%81%95%E3%81%8F%E3%82%89\+%E3%82%82%E3%82%82/.test(r.body), true);
  eq('★ 角かっこは %5B %5D（ブラウザと同じ）', /genre%5B1%5D=1/.test(r.body), true);
}

// ── ⑧ ★★★★★ ジャンルは2組送る（第237便・2026-09-10）─────────
//
// ★★★ 2026-09-10 1:51、ブラウザで手押し登録した POST の実物:
//   …&options=&genre2%5B65%5D=1&genre2%5B49%5D=1&genre%5B65%5D=1&genre%5B49%5D=1&fuel_csrf_token=…
//   ★ `genre2[<id>]` は **静的な HTML に現れない**。★ 送信時に JavaScript が足している。
//   ★★ これを送らないと「女の子情報の登録に失敗しました」で保存だけ失敗する（実弾6回ぶんの原因）。
//   ★★★ ここは **また落とさないための番人**。
{
  const f = G.parseEkichikaGirlForm(girlPage());
  const one = G.buildEkichikaGirlCreateRequest('c=1', f, { name: 'てすと', genreIds: [49] });
  const r = G.buildEkichikaGirlCreateRequest('c=1', f, { name: 'てすと', genreIds: [11, 49] });
  const pairs = r.body.split('&').map((x) => x.split('=')[0]);

  eq('★★★★★ genre2 を選んだぶんだけ送る',
     pairs.filter((k) => /^genre2%5B\d+%5D$/.test(k)).sort(),
     ['genre2%5B11%5D', 'genre2%5B49%5D']);
  eq('★★★ genre も今までどおり送る',
     pairs.filter((k) => /^genre%5B\d+%5D$/.test(k)).sort(),
     ['genre%5B11%5D', 'genre%5B49%5D']);
  eq('★★ 値はどちらも 1', /(^|&)genre2%5B49%5D=1(&|$)/.test(r.body) && /(^|&)genre%5B49%5D=1(&|$)/.test(r.body), true);
  eq('★★★ ジャンル1つ増えるごとに2組増える', r.meta.pairs - one.meta.pairs, 2);

  // ★★★ 読んだ画面に genre2 がチェック済みで在っても、持ち越さない（genre と同じ扱い）
  const withOld = girlPage().replace('<input type="hidden" name="p_genre_max_num" value="3">',
    '<input type="checkbox" name="genre2[5]" value="1" checked><input type="hidden" name="p_genre_max_num" value="3">');
  const r2 = G.buildEkichikaGirlCreateRequest('c=1', G.parseEkichikaGirlForm(withOld), { name: 'てすと', genreIds: [49] });
  eq('★★★ 読んだ画面の genre2 のチェックは持ち越さない',
     /genre2%5B5%5D/.test(r2.body), false);
  eq('★ こちらが選んだ genre2 は入る', /(^|&)genre2%5B49%5D=1(&|$)/.test(r2.body), true);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
