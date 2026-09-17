// 駅ちかの女の子プロフィール更新（src/lib/ekichikaGirlEdit.ts）の自己点検（第415便）。
//   使い方:  npm run check:girledit
const path = require('path');
const E = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaGirlEdit.js'));
let fail = 0;
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; } else console.log('ok ' + name); };
const throws = (name, fn, re) => { try { fn(); console.log('NG ' + name + '（例外にならなかった）'); fail++; } catch (e) { if (re && !re.test(e.message)) { console.log('NG ' + name + '（違う例外: ' + e.message + '）'); fail++; } else console.log('ok ' + name); } };

// ★ 実物に似せた編集ページ（ラビリンス様の 5232208 の作り・値は架空）
function page(o) {
  o = Object.assign({ catch: '癒しの時間', comments: '店のことば', checked: ['1', '5', '51'], p: ['1', '8'], rookie: '', action: '/admin/girls/edit/5232208' }, o || {});
  const ids = ['1', '5', '51', '8', '17', '22', '49', '91'];
  let h = '<html><body><form method="GET"><input name="keyword"><input type="submit" value="検索"></form>';
  h += '<form method="POST" action="' + o.action + '">';
  h += '<input type="text" name="name" value="さら" maxlength="10">';
  h += '<select name="cup"><option value="0">-</option><option value="1">Aカップ</option><option value="6" selected>Fカップ</option><option value="4">Dカップ</option></select>';
  h += '<input type="text" name="catchcopy" value="' + o.catch + '" maxlength="15">';
  h += '<input type="text" name="age" value="26"><input type="text" name="tall" value="160"><input name="bust" value="89"><input name="waist" value="56"><input name="hip" value="85">';
  h += '<select name="bloodtype"><option value="0" selected>表示しない</option><option value="1">A</option><option value="2">B</option><option value="3">O</option><option value="4">AB</option></select>';
  h += '<select name="constellation"><option value="0" selected>表示しない</option><option value="1">おひつじ</option><option value="5">しし</option></select>';
  h += '<textarea name="girl_comments">よろしく</textarea><input name="title" value=""><textarea name="comments">' + o.comments + '</textarea>';
  for (let i = 1; i <= 10; i++) h += '<input name="questions[' + i + ']" value=""><input name="answers[' + i + ']" value="">';
  h += '<textarea name="options">なし</textarea>';
  for (const id of ['1', '59', '11', '8', '17']) h += '<input type="checkbox" name="p_genre[' + id + ']" value="1"' + (o.p.includes(id) ? ' checked' : '') + '>';
  for (const id of ids) h += '<input type="checkbox" name="genre[' + id + ']" value="1"' + (o.checked.includes(id) ? ' checked' : '') + '>';
  h += '<input type="radio" name="rookie_flg" value="1"' + (o.rookie === '1' ? ' checked' : '') + '><input type="radio" name="rookie_flg" value="2"' + (o.rookie === '2' ? ' checked' : '') + '>';
  h += '<input type="hidden" name="fuel_csrf_token" value="tok123"><input type="hidden" name="p_genre_max_num" value="3"><input type="hidden" name="girls_genre_max_num" value="19">';
  h += '<input type="submit" name="update-btn" value=""></form></body></html>';
  return h;
}
const form = E.parseEkichikaGirlEditForm(page(), '5232208');

console.log('── 1. 読む ──');
eq('csrf', form.csrfToken, 'tok123');
eq('action は同じページ', form.action, 'https://ranking-deli.jp/admin/girls/edit/5232208');
eq('ジャンル番号を読む', form.genreIds.length, 8);

console.log('── 2. 何も入れていなければ変えない ──');
const p0 = E.planEkichikaGirlEdit(form, {});
eq('★ 変わる欄なし', p0.changes, []);
throws('★ 変わる欄が無ければ送らない', () => E.buildEkichikaGirlEditRequest('c=1', '5232208', form, p0), /変わる欄が無い/);
eq('★ 今のジャンルはそのまま組に残す', p0.pairs.filter(([k]) => /^genre\[/.test(k)).map(([k]) => k), ['genre[1]', 'genre[5]', 'genre[51]']);
eq('★ genre2 も同じ並び', p0.pairs.filter(([k]) => /^genre2\[/.test(k)).map(([k]) => k), ['genre2[1]', 'genre2[5]', 'genre2[51]']);
eq('★ 名前は読んだまま', p0.pairs.find(([k]) => k === 'name'), ['name', 'さら']);

console.log('── 3. 入れた欄だけ変える ──');
const p1 = E.planEkichikaGirlEdit(form, {
  catchcopy: '笑顔が素敵', comments: '', girlComments: '', cup: 'D', bloodtype: 'O', constellation: 'しし', age: '26',
  genres: ['癒し系', '清楚', 'no1'], pGenres: ['お姉さん系', 'スレンダー', '顔出し'], rookie: '1',
  qa: [{ q: '好きな食べ物は？', a: 'ラーメン' }],
});
eq('★ 変わった欄', p1.changes.map((c) => c.field), ['cup', 'bloodtype', 'constellation', 'catchcopy', 'questions', 'genre', 'p_genre', 'rookie_flg']);
eq('★ 空のお店コメントは今のまま', p1.pairs.find(([k]) => k === 'comments'), ['comments', '店のことば']);
eq('★ 同じ年齢は変化に数えない', p1.changes.some((c) => c.field === 'age'), false);
eq('カップはラベルで番号を引く', p1.pairs.find(([k]) => k === 'cup'), ['cup', '4']);
eq('★ ジャンルは選んだ順で丸ごと差し替え', p1.pairs.filter(([k]) => /^genre\[/.test(k)).map(([k]) => k), ['genre[22]', 'genre[49]', 'genre[1]']);
eq('★ 優先タグ', p1.pairs.filter(([k]) => /^p_genre\[/.test(k)).map(([k]) => k), ['p_genre[8]', 'p_genre[17]', 'p_genre[59]']);
eq('★ Q&A は10問ぶん送る', p1.pairs.filter(([k]) => /^questions\[/.test(k)).length, 10);
eq('新人', p1.pairs.find(([k]) => k === 'rookie_flg'), ['rookie_flg', '1']);
eq('送信ボタンを押す', p1.pairs[p1.pairs.length - 1], ['update-btn', '']);
eq('★ ジャンルの変化は名前で出す', p1.changes.find((c) => c.field === 'genre').after, '癒し系・清楚・no1');

console.log('── 4. 送らない欄 ──');
const p2 = E.planEkichikaGirlEdit(form, { catchcopy: 'あ'.repeat(16), girlComments: 'い'.repeat(201), genres: ['謎タグ'], age: '26歳' });
eq('★ 15字超のキャッチは送らない', p2.changes.some((c) => c.field === 'catchcopy'), false);
eq('★ 理由を残す', p2.skipped.length, 4);
const p3 = E.planEkichikaGirlEdit(form, { genres: ['テクニシャン'] });
eq('★ 画面に無い番号のジャンルは送らない', p3.skipped[0].includes('画面に無い番号'), true);
const p4 = E.planEkichikaGirlEdit(form, { qa: [{ q: 'あ'.repeat(51), a: '' }] });
eq('★ 51字の問いがあれば Q&A ごと送らない', p4.changes.length, 0);

console.log('── 5. 送る形 ──');
const req = E.buildEkichikaGirlEditRequest('c=1', '5232208', form, p1);
eq('POST 先', req.url, 'https://ranking-deli.jp/admin/girls/edit/5232208');
eq('本文にトークン', req.body.includes('fuel_csrf_token=tok123'), true);
eq('空白は +', E.buildEkichikaGirlEditRequest('c=1', '5232208', form, E.planEkichikaGirlEdit(form, { catchcopy: 'a b' })).body.includes('catchcopy=a+b'), true);
const other = E.parseEkichikaGirlEditForm(page({ action: 'https://cocoa-job.jp/x' }), '5232208');
throws('★ 駅ちか以外へは送らない', () => E.buildEkichikaGirlEditRequest('c=1', '5232208', other, E.planEkichikaGirlEdit(other, { catchcopy: 'x' })), /駅ちかではありません/);
const wrong = E.parseEkichikaGirlEditForm(page({ action: '/admin/girls/edit/999' }), '5232208');
throws('★ 別の人の編集ページへは送らない', () => E.buildEkichikaGirlEditRequest('c=1', '5232208', wrong, E.planEkichikaGirlEdit(wrong, { catchcopy: 'x' })), /別の人/);

console.log('── 6. 照合 ──');
const after = E.parseEkichikaGirlEditForm(page({ catch: '笑顔が素敵', checked: ['22', '49', '1'], p: ['8', '17', '59'], rookie: '1' }), '5232208');
const v = E.verifyEkichikaGirlEdit(after, E.planEkichikaGirlEdit(form, { catchcopy: '笑顔が素敵', genres: ['癒し系', '清楚', 'no1'], pGenres: ['お姉さん系', 'スレンダー', '顔出し'], rookie: '1' }));
eq('★ 変えた欄が全部そろっている', { ok: v.ok, ng: v.ng }, { ok: 4, ng: [] });
const v2 = E.verifyEkichikaGirlEdit(form, p1);
eq('★ 変わっていなければ ng に出る', v2.ng.includes('キャッチコピー'), true);

console.log('── 6b. 改行・参照のちがい（第416便）──');
eq('★ \r\n と \n は同じ', E.sameText('あ\r\nい', 'あ\nい'), true);
eq('★ 数値参照は同じ', E.sameText('&#12316;です', '〜です'), true);
eq('★ 行末の空白は同じ', E.sameText('あ  \nい', 'あ\nい'), true);
eq('★ 中身が違えば違う', E.sameText('あ', 'い'), false);
const crlfForm = E.parseEkichikaGirlEditForm(page({ comments: '一行目\r\n二行目' }), '5232208');
eq('★ 駅ちかが \r\n で持っていても「変わる欄」にしない', E.planEkichikaGirlEdit(crlfForm, { comments: '一行目\n二行目' }).changes.length, 0);
const sentP = E.planEkichikaGirlEdit(form, { comments: '一行目\n二行目' });
eq('★ 読み直しで \r\n が返っても照合は通る', E.verifyEkichikaGirlEdit(crlfForm, sentP).ng, []);
eq('手がかりに位置が出る', E.diffHint('あいう', 'あいえ').includes('2字目'), true);

console.log('── 7. 番号表 ──');
eq('★ 番号表は61', Object.keys(E.EKICHIKA_GENRE_ID).length, 61);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
