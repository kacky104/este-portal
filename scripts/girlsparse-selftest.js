// 駅ちか「女の子一覧」パーサ（src/lib/ekichikaGirlsParse.ts）の自己点検（第50便）。
//
// ★★★ なぜ要るか
//   このパーサが出す castId は、**将来そのまま削除に渡る番号**（chck_girls_id）。
//   ★ 取り違えると別人を消す。取り消しは効かない。
//   → 「読めた」ことより「食い違いを見つけて止められる」ことを重点的に点検する。
//
// ★★ HTMLは全部この場で組んだ作り物。実在の名前は入れていない
//   （実データを点検スクリプトに焼き込まない＝第44便で監査ログに差分を入れなかったのと同じ理由）。
//
//   使い方:  npm run check:girlsparse

const g = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaGirlsParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// 実測の形をそのまま写した1人ぶん。id を差し替えて使う。
const cell = (id, name, opt) => {
  const o = opt || {};
  const state = o.state === undefined ? '' : ' state-' + o.state;
  const editId = o.editId === undefined ? id : o.editId;
  const delId = o.delId === undefined ? id : o.delId;
  const orderId = o.orderId === undefined ? id : o.orderId;
  return (
    '<li class="girls-cell ' + state + ' ui-sortable-handle">' +
    '<input type="hidden" name="girls_id[' + orderId + ']" value="' + orderId + '">' +
    '<div class="customer_checkbox_wrapper"><label class="customer_checkbox checkall">' +
    '<input class="chck_girls_id" name="chck_girls_id[' + id + ']" type="checkbox" value="' + id + '">' +
    '<span class="checkmark"></span></label></div>' +
    (o.noName ? '' : '<p class="girl-name">' + name + '</p>') +
    '<div class="girl-image"><img src="/img/img1234s_5.jpg"></div>' +
    '<div class="girl-btn">' +
    '<a href="https://ranking-deli.jp/admin/girls/edit/' + editId + '"><img alt="編集"></a>' +
    '<a href="https://ranking-deli.jp/admin/girls/delete/' + delId + '"><img alt="削除"></a>' +
    '</div><div class="girl-btn2">' +
    '<a href="https://ranking-deli.jp/admin/girls/edit/' + editId + '"><img alt="出勤登録"></a>' +
    '</div></li>'
  );
};
const page = (...cells) => '<html><body><ul id="girlsList">' + cells.join('') + '</ul></body></html>';

console.log('── 1. ふつうに読める ──');
{
  const p = g.parseEkichikaGirls(page(cell('5232208', 'こう', { state: 'later' }), cell('5232190', 'おつ')));
  eq('2件読める', p.rows.length, 2);
  eq('問題なし', p.problems, []);
  eq('castId', p.rows.map(r => r.castId), ['5232208', '5232190']);
  eq('名前', p.rows.map(r => r.name), ['こう', 'おつ']);
  // ★ 凡例で意味が確かめられているのは later（ブルー＝本日出勤）だけ
  eq('state-later は today', p.rows[0].workState, 'today');
  eq('state 無しは null', p.rows[1].workState, null);
  eq('使ってよい', g.girlsPageUsable(p), true);
}
// ★ 見たことがない state を勝手に名付けない。raw に残して unknown と言う
{
  const p = g.parseEkichikaGirls(page(cell('1', 'こう', { state: 'now' })));
  eq('知らない state は unknown', p.rows[0].workState, 'unknown');
  eq('知らない state の生の値を残す', p.rows[0].raw, 'now');
  eq('知らない state でも止めない', p.problems, []);
}
// ★ class 属性の位置や属性の順番に依存しない
{
  const html = '<li id="x" data-a="1" class="ui-sortable-handle girls-cell">' +
    '<input class="chck_girls_id" name="chck_girls_id[77]" type="checkbox">' +
    '<p class="girl-name">こう</p>' +
    '<a href="/admin/girls/edit/77"></a><a href="/admin/girls/delete/77"></a></li>';
  const p = g.parseEkichikaGirls(html);
  eq('class が後ろでも読める', p.rows.map(r => r.castId), ['77']);
}

console.log('\n── 2. ★★★ 別人を消さないための食い違い検査 ──');
// ★ ここが本題。chck_girls_id は削除で送る番号。編集URLとずれていたら使わせない
{
  const p = g.parseEkichikaGirls(page(cell('100', 'こう'), cell('200', 'おつ', { editId: '999' })));
  eq('食い違った行は落ちる', p.rows.map(r => r.castId), ['100']);
  eq('落とした理由が出る', p.problems.length, 1);
  eq('理由に castId が入る', p.problems[0].indexOf('200') > 0, true);
  eq('★ 使ってはいけないと言う', g.girlsPageUsable(p), false);
}
{
  const p = g.parseEkichikaGirls(page(cell('300', 'こう', { delId: '888' })));
  eq('削除URLの食い違いも弾く', p.rows.length, 0);
  eq('★ 削除URLの食い違いも使わせない', g.girlsPageUsable(p), false);
}
{
  const p = g.parseEkichikaGirls(page(cell('400', 'こう', { orderId: '777' })));
  eq('並び順の食い違いも弾く', p.rows.length, 0);
}
// ★ 同じ番号が2回出る＝どちらを消すか決められない
{
  const p = g.parseEkichikaGirls(page(cell('500', 'こう'), cell('500', 'おつ')));
  eq('重複は1件だけ通す', p.rows.length, 1);
  eq('重複を黙って捨てない', p.problems.length, 1);
  eq('★ 重複があれば使わせない', g.girlsPageUsable(p), false);
}

console.log('\n── 3. ★★ 空を成功にしない（禁則207・第35便の反省6）──');
{
  const p = g.parseEkichikaGirls('<html><body>ログインしてください</body></html>');
  eq('行が無ければ0件', p.rows.length, 0);
  eq('★ 理由が必ず出る', p.problems.length, 1);
  eq('★ 使ってはいけない', g.girlsPageUsable(p), false);
}
{
  const p = g.parseEkichikaGirls('');
  eq('空文字でも落ちない', p.rows.length, 0);
  eq('空文字にも理由が出る', p.problems.length > 0, true);
}
// ★ 名前が読めない子は落とすが、何人落ちたか分かる形にする
{
  const p = g.parseEkichikaGirls(page(cell('1', '', { noName: true }), cell('2', 'おつ')));
  eq('名前なしは落ちる', p.rows.map(r => r.castId), ['2']);
  eq('落ちたことが理由に出る', p.problems.length, 1);
}
// ★★ 半分以上落ちたら「部分的に成功」として使わせない
{
  const p = g.parseEkichikaGirls(page(
    cell('1', '', { noName: true }), cell('2', '', { noName: true }),
    cell('3', '', { noName: true }), cell('4', 'よん'),
  ));
  eq('4件中1件しか読めない', p.rows.length, 1);
  eq('★ 半分未満の警告が足される', p.problems.filter((s) => s.indexOf('半分未満') > 0).length, 1);
  eq('★ 使ってはいけない', g.girlsPageUsable(p), false);
}
// ★ 1件も落ちていなければ、半分未満の警告は出さない（正常な店に警告を出さない）
{
  const p = g.parseEkichikaGirls(page(cell('1', 'こう'), cell('2', 'おつ')));
  eq('正常なら警告なし', p.problems, []);
}

console.log('\n── 4. 名前の取り出し ──');
eq('タグを落とす', g.textOf('<span>こう</span>'), 'こう');
eq('実体参照を戻す', g.textOf('A&amp;B'), 'A&B');
eq('数値参照を戻す', g.textOf('&#12354;'), 'あ');
eq('空白を畳む', g.textOf('  こう \n おつ '), 'こう おつ');
eq('nbsp も空白にする', g.textOf('こう&nbsp;おつ'), 'こう おつ');
// ★ 名前がタグに包まれていても読める（実物は <p class="girl-name"> の直下だが、変わりうる）
{
  const html = '<li class="girls-cell">' +
    '<input class="chck_girls_id" name="chck_girls_id[9]" type="checkbox">' +
    '<p class="girl-name"><span class="x">こう</span></p>' +
    '<a href="/admin/girls/edit/9"></a></li>';
  eq('入れ子の名前も読める', g.parseEkichikaGirls(html).rows[0].name, 'こう');
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
