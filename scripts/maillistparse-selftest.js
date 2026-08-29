// 駅ちか「メールアドレス一覧」パーサ（src/lib/ekichikaMailListParse.ts）の自己点検（第53便）。
//
// ★★★ この点検の芯は【取りこぼしに気づけること】。
//   実機で最初 li.md_list_column_disp で数えたら19行だったが、実際は37行だった
//   （クラス名が2種類混在していた・設計メモ §123-1）。
//   ★ 気づけたのは「アドレスの件数」と「行数×2」が合わなかったから。
//   → その気づき方を検査として書く。★ 数を2通りで数える。
//
// ★★ HTMLは全部この場で組んだ作り物。実在のアドレスは入れていない
//   （アドレスは秘密値。点検スクリプトに焼き込まない）。
//
//   使い方:  npm run check:maillistparse

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaMailListParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// 実測の形をそのまま写した1行ぶん。cls を差し替えて2種類のクラス名を再現する。
const row = (id, name, opt) => {
  const o = opt || {};
  const cls = o.cls === undefined ? 'md_list_column_disp clearfix' : o.cls;
  const img = o.noImg ? '' : '<img src="https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/37168/' + id + '/img1_20260729000849.jpg">';
  // ★★ 実物の形（2026-08-29 実測）。ラベルは <span class="title"> の中、アドレスはその外。
  //   ★ ここを詰めて書いていたせいで、作り物は通るのに実物で0件だった。★ 形を実物に合わせる。
  const mail = o.noMail ? '' : '<span class="title">メールアドレス：</span>' + (o.addr || ('a' + id + '@shame.ranking-deli.jp')) + '<br>';
  const mob = o.noMobile ? '' : ' <span class="title">ガラケーメールアドレス：</span>' + ('b' + id + '@s.ranking-deli.jp');
  return (
    '<li class="' + cls + '">' +
    '<div class="md_column md_poster_column"><span class="title">' + name + '</span></div>' +
    img +
    '<div class="md_column md_mail_column">' + mail + mob + '</div>' +
    '</li>'
  );
};
const page = (...rows) =>
  '<html><body><div><ul class="submenu"><li>メニュー</li></ul>' +
  '<ul class="md_list">' + rows.join('') + '</ul></div></body></html>';

console.log('── 1. ふつうに読める ──');
{
  const p = m.parseEkichikaMailList(page(row('5232208', 'えま'), row('5232190', 'もえ')));
  eq('2件読める', p.rows.length, 2);
  eq('問題なし', p.problems, []);
  eq('castId', p.rows.map((r) => r.castId), ['5232208', '5232190']);
  eq('名前', p.rows.map((r) => r.name), ['えま', 'もえ']);
  eq('使ってよい', m.mailListUsable(p), true);
  // ★ ラベルで取り分けている。ドメインで確かめる（局所部は見ない）
  eq('メールアドレスは写メ用', p.rows.map((r) => m.mailDomainOf(r.address)), ['@shame.ranking-deli.jp', '@shame.ranking-deli.jp']);
  eq('ガラケーは別のドメイン', p.rows.map((r) => m.mailDomainOf(r.mobileAddress)), ['@s.ranking-deli.jp', '@s.ranking-deli.jp']);
}
// ★★★ 「ガラケーメールアドレス」は「メールアドレス」を含む。順番を間違えると取り違える
{
  const p = m.parseEkichikaMailList(page(row('1', 'こう')));
  eq('★ ガラケーを「メールアドレス」として取らない',
    m.mailDomainOf(p.rows[0].address), '@shame.ranking-deli.jp');
}
// ★ ガラケーが無くても通る（必須ではない）
{
  const p = m.parseEkichikaMailList(page(row('2', 'おつ', { noMobile: true })));
  eq('ガラケー無しでも読める', p.rows.length, 1);
  eq('ガラケーは null', p.rows[0].mobileAddress, null);
  eq('ガラケー無しは問題ではない', p.problems, []);
}
// ★ メニューなど別の ul の li を拾わない
eq('別の ul の li を拾わない', m.parseEkichikaMailList(page(row('3', 'さん'))).rows.length, 1);
// ★ 入れ子の ul があっても、閉じを数えて正しく切る
{
  const nested = '<html><ul class="md_list">' + row('4', 'よん') +
    '<li><ul><li>入れ子</li></ul></li>' + row('5', 'ご') + '</ul></html>';
  const p = m.parseEkichikaMailList(nested);
  eq('入れ子があっても両方読める', p.rows.map((r) => r.castId), ['4', '5']);
}

console.log('\n── 2. ★★★ 取りこぼしに気づけるか（§123-1 の再現）──');
// ★★ 実機で起きた形。クラス名が2種類混在している
{
  const p = m.parseEkichikaMailList(page(
    row('10', 'あ', { cls: 'md_list_column_disp clearfix' }),
    row('20', 'い', { cls: 'md_list_column clearfix' }),
    row('30', 'う', { cls: 'md_list_column_disp clearfix' }),
  ));
  eq('★ クラス名が2種類でも全部読む', p.rows.map((r) => r.castId), ['10', '20', '30']);
  eq('★ 問題は出ない', p.problems, []);
}
// ★★★ 行を落としたときに「数が合わない」と言えるか
{
  const p = m.parseEkichikaMailList(page(
    row('40', 'え'),
    row('50', 'お', { noImg: true }),   // ★ castId が取れない＝この行は落ちる
    row('60', 'か'),
  ));
  eq('castId が無い行は落ちる', p.rows.map((r) => r.castId), ['40', '60']);
  eq('★ 落ちた理由が出る', p.problems.filter((s) => s.indexOf('castId を取れない') > 0).length, 1);
  // ★ 落ちた行のアドレス2件は一覧の中に残っているので、数が合わなくなる
  eq('★★ 数が合わないと言う', p.problems.filter((s) => s.indexOf('数が合わない') === 0).length, 1);
  eq('★ 使ってはいけない', m.mailListUsable(p), false);
}
// ★ 全部読めていれば数は合う（正常な店に警告を出さない）
eq('全部読めれば数は合う',
  m.parseEkichikaMailList(page(row('70', 'き'), row('80', 'く'))).problems, []);
// ★ 重複した castId
{
  const p = m.parseEkichikaMailList(page(row('90', 'け'), row('90', 'こ')));
  eq('重複は1件だけ通す', p.rows.length, 1);
  eq('重複を黙って捨てない', p.problems.filter((s) => s.indexOf('2回出てくる') > 0).length, 1);
}

console.log('\n── 3. ★★ 空を成功にしない ──');
{
  const p = m.parseEkichikaMailList('<html><body>ログインしてください</body></html>');
  eq('md_list が無ければ0件', p.rows.length, 0);
  eq('★ 理由が出る', p.problems.length, 1);
  eq('★ 使ってはいけない', m.mailListUsable(p), false);
}
eq('空文字でも落ちない', m.parseEkichikaMailList('').rows.length, 0);
eq('空文字にも理由が出る', m.parseEkichikaMailList('').problems.length > 0, true);
{
  const p = m.parseEkichikaMailList('<ul class="md_list"></ul>');
  eq('行が無ければ理由が出る', p.problems.length > 0, true);
  eq('★ 使ってはいけない', m.mailListUsable(p), false);
}
// ★ アドレスが読めない行
{
  const p = m.parseEkichikaMailList(page(row('100', 'さ', { noMail: true, noMobile: true }), row('110', 'し')));
  eq('アドレスが無い行は落ちる', p.rows.map((r) => r.castId), ['110']);
  eq('落ちた理由が出る', p.problems.filter((s) => s.indexOf('メールアドレスが読めない') > 0).length, 1);
}
// ★ 半分以上落ちたら使わせない
{
  const p = m.parseEkichikaMailList(page(
    row('1', 'a', { noImg: true }), row('2', 'b', { noImg: true }),
    row('3', 'c', { noImg: true }), row('4', 'd'),
  ));
  eq('4件中1件しか読めない', p.rows.length, 1);
  eq('★ 半分未満の警告が出る', p.problems.filter((s) => s.indexOf('半分未満') > 0).length, 1);
}

console.log('\n── 4. ドメインの取り出し ──');
eq('ドメインだけ返す', m.mailDomainOf('abc@shame.ranking-deli.jp'), '@shame.ranking-deli.jp');
eq('壊れた値でも落ちない', m.mailDomainOf('こわれている'), '(不明)');
eq('null でも落ちない', m.mailDomainOf(null), '(不明)');
// ★ 局所部を返していないこと（秘密値を画面や記録に出さないため）
eq('★ 局所部を含まない', m.mailDomainOf('himitsu@shame.ranking-deli.jp').indexOf('himitsu') < 0, true);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
