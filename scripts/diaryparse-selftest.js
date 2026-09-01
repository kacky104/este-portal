// 駅ちか「写メ日記」パーサ（src/lib/ekichikaDiaryParse.ts）の自己点検（第92便）。
//
// ★★★ この点検の芯は3つ。
//   ① 想像した形に寄りかからないこと（クラス名・欄の順番で読んでいないこと）
//   ② 読めなかったものを、黙って何かの値にしないこと
//      ★ 「display_flg が読めない」を【公開】と読まない
//      ★ 「日付が読めない」を【古い】と読まない
//      ★ 「写真が2枚」を【1枚目】と読まない
//   ③ 消した日記が戻ってこないこと（§369）
//
// ★★ HTMLは全部この場で組んだ作り物。実在の日記・名前・写真URLは入れていない。
//   ★★★ **作り物が通ることは、実物で通ることを意味しない**（第53便の教訓）。
//     → 末尾に「実物との突き合わせ」を用意してある。_fixtures/ に保存したら自動で数える。
//
//   使い方:  npm run check:diaryparse

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaDiaryParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ────────────────────────────────────────────────
// 作り物の一覧。★ クラス名は【わざと2種類】混ぜる（第53便 §123-1 と同じ罠を張る）
// ────────────────────────────────────────────────
// ★★ 2026-09-01 に実物（ラビリンス様・30件）を読んで、その形に写した。
const IMG = 'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/diary/';
const listRow = (id, stamp, opt) => {
  const o = opt || {};
  const cls = o.cls === undefined ? 'md_list_column_disp clearfix' : o.cls;
  const dateCls = o.noDateCls ? 'md_column' : 'md_column md_date_column';
  const del = o.noDel ? '' :
    '<div class="md_column md_delete_column"><input name="delete[]" value="' + (o.delId || id) + '" type="checkbox" /></div>';
  const img = o.noImg ? '' :
    '<div class="md_column md_img_column"><img alt="" src="' + IMG + id + '/diaries_' + id + '_file_name20260831171241.jpeg" /></div>';
  return (
    '<li class="' + cls + '">' + del +
    '<div class="' + dateCls + '">' + (o.noStamp ? '' : stamp) + '</div>' +
    '<div class="md_column md_poster_column">' + (o.name || 'ゆき') + '</div>' + img +
    '<div class="md_column md_diary_column"><span class="title">' + (o.title || 'きょうのごはん') +
      '</span><span class="body">' + (o.body || 'ふつうの本文です') + '</span></div>' +
    "<div class=\"md_column md_edit_column\"><a href='https://ranking-deli.jp/admin/maildiary/edit/" +
      id + "/'>編集する</a></div>" +
    '</li>'
  );
};
const listPage = (rows, opt) => {
  const o = opt || {};
  const pager = o.noPager ? '' :
    '<div class="pager"><a href="/admin/maildiary/2">2</a><a href="/admin/maildiary/3">3</a></div>';
  return (
    '<html><body><h1>写メ日記一覧</h1>' +
    '<ul class="md_list">' + rows.join('') + '</ul>' + pager + '</body></html>'
  );
};

console.log('── 1. 一覧: ふつうに読める ──');
{
  const p = m.parseEkichikaDiaryList(listPage([
    listRow('414840669', '2026 08/31 17:12'),
    listRow('414800001', '2026 08/30 09:05', { cls: 'md_list_column clearfix' }),
    listRow('414700002', '2026 07/23 23:59', { cls: '' }),
  ]));
  eq('3件読める', p.rows.length, 3);
  eq('問題なし', p.problems, []);
  eq('★ クラス名で絞っていない（3種類とも読めた）',
    p.rows.map((r) => r.diaryId), ['414840669', '414800001', '414700002']);
  eq('投稿日時', p.rows.map((r) => r.postedAt), [
    '2026-08-31T17:12:00+09:00', '2026-08-30T09:05:00+09:00', '2026-07-23T23:59:00+09:00',
  ]);
  eq('原文も持つ', p.rows[0].postedAtText, '2026 08/31 17:12');
  eq('ページ番号', p.pageNumbers, [2, 3]);
  eq('使ってよい', m.diaryListUsable(p), true);
}

console.log('\n── 2. 一覧: 読めないときは黙らない ──');
{
  const p = m.parseEkichikaDiaryList('');
  eq('空文字でも落ちない', p.rows.length, 0);
  eq('空文字にも理由が出る', p.problems.length > 0, true);
  eq('★ 使ってはいけない', m.diaryListUsable(p), false);
}
{
  const p = m.parseEkichikaDiaryList('<html><body>ログインしてください</body></html>');
  eq('編集リンクが無ければ0件', p.rows.length, 0);
  eq('★ 理由に「ログイン」の可能性が出る', p.problems.filter((s) => s.indexOf('ログイン') >= 0).length, 1);
  eq('★ 使ってはいけない', m.diaryListUsable(p), false);
}
{
  const p = m.parseEkichikaDiaryList(listPage([
    listRow('111', '2026 08/31 17:12'),
    listRow('111', '2026 08/31 17:12'),
  ]));
  eq('重複は1件に畳む', p.rows.length, 1);
  eq('★ 重複した理由が残る', p.problems.filter((s) => s.indexOf('2回出てくる') > 0).length, 1);
  eq('★ 使ってはいけない', m.diaryListUsable(p), false);
}
{
  // ★★★ 数を2通りで数える。「編集する」6個・リンク3本 ＝ 取りこぼしの疑い
  const html = listPage([
    listRow('1', '2026 08/31 17:12'), listRow('2', '2026 08/30 17:12'), listRow('3', '2026 08/29 17:12'),
  ]).replace('</ul>', '<span>編集する</span><span>編集する</span><span>編集する</span></ul>');
  const p = m.parseEkichikaDiaryList(html);
  eq('★ 数が合わないと言う', p.problems.filter((s) => s.indexOf('数が合わない') === 0).length, 1);
  eq('★ 使ってはいけない', m.diaryListUsable(p), false);
}
{
  const p = m.parseEkichikaDiaryList(listPage([
    listRow('1', '', { noStamp: true }), listRow('2', '', { noStamp: true }),
  ]));
  eq('行は読める', p.rows.length, 2);
  eq('日付は null', p.rows.map((r) => r.postedAt), [null, null]);
  eq('★ 1件も読めないと言う', p.problems.filter((s) => s.indexOf('投稿日時が1件も読めない') === 0).length, 1);
}
{
  const p = m.parseEkichikaDiaryList(listPage([
    listRow('1', '2026 08/31 17:12'), listRow('2', '', { noStamp: true }),
  ]));
  eq('★ 1件欠けは問題にしない', p.problems, []);
  eq('欠けた行は null のまま', p.rows[1].postedAt, null);
}
{
  const html = '<html><body><h1>2026 01/01 00:00 の一覧</h1><ul>' +
    listRow('900', '2026 08/31 17:12') + '</ul></body></html>';
  const p = m.parseEkichikaDiaryList(html);
  eq('★ 見出しの日付を拾わない', p.rows[0].postedAt, '2026-08-31T17:12:00+09:00');
}

console.log('\n── 2-2. ★★★ 本文の日付を、投稿日時と取り違えない（2026-09-01 実物で出た） ──');
{
  // ★★★ 実物30件のうち2件が、本文に出勤の案内を書いていた。
  //   ★ 行の【最後の日付】を採っていたため、本文の日付を拾っていた。★ 最初を採る。
  const p = m.parseEkichikaDiaryList(listPage([
    listRow('500', '2026 08/31 17:12', { body: '2026 08/28 12:00 から出勤します' }),
    listRow('501', '2026 08/30 09:05', { body: 'つぎは 2026 07/24 14:00 です' }),
  ]));
  eq('★★★ 本文の日付を投稿日時にしない',
    p.rows.map((r) => r.postedAt), ['2026-08-31T17:12:00+09:00', '2026-08-30T09:05:00+09:00']);
  eq('問題なし', p.problems, []);
}
{
  // ★ 日付の列のクラスが変わっても、行の最初の日付なら当たる（本文は後ろにあるため）
  const p = m.parseEkichikaDiaryList(listPage([
    listRow('600', '2026 08/31 17:12', { noDateCls: true, body: '2026 08/28 12:00 から出勤します' }),
  ]));
  eq('★ 日付の列が無くても取り違えない', p.rows[0].postedAt, '2026-08-31T17:12:00+09:00');
}
{
  // ★★ 2通り目の数え方（実物の delete[] と突き合わせる）
  const p = m.parseEkichikaDiaryList(listPage([
    listRow('700', '2026 08/31 17:12', { delId: '999' }),
  ]));
  eq('★★ 削除欄と編集リンクの中身が違えば言う',
    p.problems.filter((x) => x.indexOf('削除欄') > 0).length, 1);
  eq('★ 使ってはいけない', m.diaryListUsable(p), false);
}

console.log('\n── 3. 投稿日時の読み取り ──');
eq('実測の形', m.diaryStampToIso('2026 08/31 17:12'), '2026-08-31T17:12:00+09:00');
eq('スラッシュ区切り', m.diaryStampToIso('2026/08/31 17:12'), '2026-08-31T17:12:00+09:00');
eq('年月日', m.diaryStampToIso('2026年8月31日 7:05'), '2026-08-31T07:05:00+09:00');
eq('曜日つき', m.diaryStampToIso('2026 08/31(日) 17:12'), '2026-08-31T17:12:00+09:00');
eq('0埋めして返す', m.diaryStampToIso('2026 8/1 9:05'), '2026-08-01T09:05:00+09:00');
eq('★ 実在しない日は null', m.diaryStampToIso('2026 02/31 17:12'), null);
eq('★ 13月は null', m.diaryStampToIso('2026 13/01 17:12'), null);
eq('★ 25時は null', m.diaryStampToIso('2026 08/31 25:12'), null);
eq('空は null', m.diaryStampToIso(''), null);
eq('null でも落ちない', m.diaryStampToIso(null), null);

console.log('\n── 4. 本文を素のテキストに（§368） ──');
eq('★ </p><br> は改行1つ（1行おきに空行を入れない）',
  m.diaryBodyToText('<p>おはようございます</p><br><p>今日は12時から出勤です</p><br>'),
  'おはようございます\n今日は12時から出勤です');
eq('br 単体も改行', m.diaryBodyToText('1行目<br>2行目'), '1行目\n2行目');
eq('タグは落とす', m.diaryBodyToText('<p><b>太字</b>と<a href="#">リンク</a></p>'), '太字とリンク');
eq('文字参照をほどく', m.diaryBodyToText('<p>A&amp;B &quot;C&quot; &nbsp;D</p>'), 'A&B "C"  D');
eq('★ 二重の文字参照を壊さない', m.diaryBodyToText('<p>&amp;lt;</p>'), '&lt;');
eq('数値参照', m.diaryBodyToText('<p>&#12354;&#x3044;</p>'), 'あい');
eq('script は中身ごと落とす', m.diaryBodyToText('<p>本文</p><script>alert(1)</script>'), '本文');
eq('空行は残すが3行以上は畳む', m.diaryBodyToText('a<br><br><br><br>b'), 'a\n\nb');
eq('行末の空白は落とす', m.diaryBodyToText('a   <br>b'), 'a\nb');
eq('★ 行の中の全角空白は残す', m.diaryBodyToText('<p>あ　い</p>'), 'あ　い');
eq('空でも落ちない', m.diaryBodyToText(''), '');
eq('null でも落ちない', m.diaryBodyToText(null), '');

// ────────────────────────────────────────────────
// 作り物の詳細ページ
// ────────────────────────────────────────────────
const detail = (opt) => {
  const o = opt || {};
  const id = o.id === undefined ? '414840669' : o.id;
  const girls = o.noGirls ? '' :
    '<input type="hidden" name="girls_id" value="' + (o.girls === undefined ? '5232208' : o.girls) + '">';
  const flg = o.noFlg ? '' : (
    '<input type="radio" name="display_flg" value="1"' + (o.flg === '1' ? ' checked' : '') + '>表示' +
    '<input type="radio" name="display_flg" value="0"' + (o.flg === '0' ? ' checked' : '') + '>非表示'
  );
  const img = o.imgs === undefined
    ? '<img src="' + IMG + id + '/diaries_' + id + '_file_name20260831171241.jpeg">'
    : o.imgs.map((u) => '<img src="' + u + '">').join('');
  return (
    '<html><body>' +
    '<form action="/admin/maildiary/edit/' + id + '/" method="post">' +
    '<input type="hidden" name="fuel_csrf_token" value="dummy">' +
    '<input type="hidden" name="shopid" value="37168">' +
    girls +
    '<input type="text" name="title" value="' + (o.title === undefined ? 'きょうのごはん' : o.title) + '">' +
    '<textarea name="body">' + (o.body === undefined ? '<p>おはよう</p><br>' : o.body) + '</textarea>' +
    flg +
    '<input style="display:none;" id="md_img_upload" name="md_img_upload" type="file" value="" />' +
    // ★ 実物は `<日記ID>/<ファイル名>` が入っている（2026-09-01）
    (o.imgField === undefined ? '' : '<input type="hidden" name="img" id="form_img" value="' + o.imgField + '">') +
    img +
    '</form></body></html>'
  );
};

console.log('\n── 5. 詳細: ふつうに読める ──');
{
  const d = m.parseEkichikaDiaryDetail(detail({ flg: '1' }), '414840669');
  eq('問題なし', d.problems, []);
  eq('日記ID', d.diaryId, '414840669');
  eq('★ 照合は girls_id', d.castId, '5232208');
  eq('タイトル', d.title, 'きょうのごはん');
  eq('本文（素のテキスト）', d.bodyText, 'おはよう');
  eq('公開', d.isPublic, true);
  eq('写真1枚', d.imageUrl, IMG + '414840669/diaries_414840669_file_name20260831171241.jpeg');
  eq('使ってよい', m.diaryDetailUsable(d), true);
  eq('取り込んでよい', m.shouldImportDiary(d), true);
}
{
  const html = detail({ flg: '1' })
    .replace('<input type="radio" name="display_flg" value="1" checked>',
             "<input checked type='radio' value='1' name='display_flg' >");
  const d = m.parseEkichikaDiaryDetail(html);
  eq('★ 順番と引用符に依存しない', d.isPublic, true);
  eq('問題なし', d.problems, []);
}
{
  const html = detail({ flg: '1' }).replace('name="title"', 'data-file_name="x" name="title"');
  const d = m.parseEkichikaDiaryDetail(html);
  eq('★ 紛らわしい属性に釣られない', d.title, 'きょうのごはん');
}

console.log('\n── 6. 詳細: 非公開は「読めない」ではない（3-5） ──');
{
  const d = m.parseEkichikaDiaryDetail(detail({ flg: '0' }));
  eq('問題なし', d.problems, []);
  eq('非公開と読めている', d.isPublic, false);
  eq('★ 読み取りとしては正しい', m.diaryDetailUsable(d), true);
  eq('★★ だが取り込まない（設計メモ §6②）', m.shouldImportDiary(d), false);
}
{
  const d = m.parseEkichikaDiaryDetail(detail({}));
  eq('★★★ 未選択を「公開」と読まない', d.isPublic, null);
  eq('理由が出る', d.problems.filter((s) => s.indexOf('display_flg') >= 0).length, 1);
  eq('★ 使ってはいけない', m.diaryDetailUsable(d), false);
  eq('★ 取り込まない', m.shouldImportDiary(d), false);
}
{
  const d = m.parseEkichikaDiaryDetail(detail({ noFlg: true }));
  eq('★ 欄ごと無いときも null', d.isPublic, null);
  eq('★ 止める理由が出る', d.problems.filter((s) => s.indexOf('display_flg の欄が見つからない') === 0).length, 1);
}

console.log('\n── 7. 詳細: 誰の日記か決められないときは取り込まない（§367） ──');
{
  const d = m.parseEkichikaDiaryDetail(detail({ noGirls: true, flg: '1' }));
  eq('castId は null', d.castId, null);
  eq('★ 名前では照合しないと明記した理由が出る',
    d.problems.filter((s) => s.indexOf('girls_id') > 0).length, 1);
  eq('★ 使ってはいけない', m.diaryDetailUsable(d), false);
}
{
  const html = detail({ flg: '1' }).replace('name="shopid" value="37168"', 'name="girls_id" value="9999999"');
  const d = m.parseEkichikaDiaryDetail(html);
  eq('★ girls_id が2種類あれば決めない', d.castId, null);
  eq('理由が出る', d.problems.filter((s) => s.indexOf('2 種類') > 0).length, 1);
}

console.log('\n── 8. 詳細: 写真は1枚（§370） ──');
{
  const d = m.parseEkichikaDiaryDetail(detail({ imgs: [], flg: '1' }));
  eq('写真が無い日記も読める', d.imageUrl, null);
  eq('問題なし', d.problems, []);
  eq('本文があるので使ってよい', m.diaryDetailUsable(d), true);
}
{
  const d = m.parseEkichikaDiaryDetail(detail({
    flg: '1',
    imgs: [
      IMG + '414840669/diaries_414840669_file_name20260831171241.jpeg',
      IMG + '414840669/diaries_414840669_file_name20260831171300.jpeg',
    ],
  }));
  eq('★★★ 2枚あったら1枚目を黙って採らない', d.imageUrl, null);
  eq('★ 設計を見直せと言う', d.problems.filter((s) => s.indexOf('1投稿1画像') > 0).length, 1);
  eq('★ 使ってはいけない', m.diaryDetailUsable(d), false);
}
{
  const u = IMG + '414840669/diaries_414840669_file_name20260831171241.jpeg';
  const d = m.parseEkichikaDiaryDetail(detail({ flg: '1', imgs: [u, u] }));
  eq('同じURLの重複は1枚', d.imageUrl, u);
  eq('問題なし', d.problems, []);
}
{
  const d = m.parseEkichikaDiaryDetail(detail({
    flg: '1', imgs: [], imgField: 'diaries_414840669_file_name20260831171241.jpeg',
  }));
  eq('★ ファイル名だけでもURLに組み立てる',
    d.imageUrl, IMG + '414840669/diaries_414840669_file_name20260831171241.jpeg');
}
{
  const d = m.parseEkichikaDiaryDetail(detail({
    flg: '1', imgs: [IMG + '37168/5232208/img1_20260729000849.jpg'],
  }));
  eq('★ プロフィール写真を日記の写真にしない', d.imageUrl, null);
  eq('問題なし', d.problems, []);
}
{
  // ★★★ 2026-09-01 の見落とし。★ 実物のURLには `/diary/` が挟まっていて、拾えていなかった。
  //   ★ しかも problems は空だった＝【写真が1枚あるのに「0枚」と答えた】。
  const real = IMG + '414840669/diaries_414840669_file_name20260831171241.jpeg';
  const d = m.parseEkichikaDiaryDetail(detail({
    flg: '1', imgs: [real], imgField: '414840669/diaries_414840669_file_name20260831171241.jpeg',
  }));
  eq('★★★ /diary/ 付きの実物のURLを拾う', d.imageUrl, real);
  eq('★ URLと欄が同じ写真を指していても2枚にしない', d.problems, []);
}
{
  // ★★ 紛らわしいホストが同居している（実物のページにある cloudfront の systemfiles…）
  const d = m.parseEkichikaDiaryDetail(detail({
    flg: '1',
    imgs: ['https://dv6drgre1bci1.cloudfront.net/systemfiles.ranking-deli.jp/diary/1/diaries_1_file_name20260831171241.jpeg'],
  }));
  eq('★★ systemfiles.ranking-deli.jp を日記の写真にしない', d.imageUrl, null);
}
{
  // ★ URLがどこにも無いときだけ、欄から組み立てる
  const d = m.parseEkichikaDiaryDetail(detail({
    flg: '1', imgs: [], imgField: '414840669/diaries_414840669_file_name20260831171241.jpeg',
  }));
  eq('★ 欄が <日記ID>/<ファイル名> でも組み立てる',
    d.imageUrl, IMG + '414840669/diaries_414840669_file_name20260831171241.jpeg');
}

console.log('\n── 9. 詳細: 取り違えを見つける ──');
{
  const d = m.parseEkichikaDiaryDetail(detail({ id: '414840669', flg: '1' }), '999999999');
  eq('★★★ 別の日記を開いていたら言う',
    d.problems.filter((s) => s.indexOf('開きに行った日記') > 0).length, 1);
  eq('★ 使ってはいけない', m.diaryDetailUsable(d), false);
}
{
  const html = detail({ id: '414840669', flg: '1' })
    .replace('/414840669/diaries_414840669_', '/111111111/diaries_111111111_');
  const d = m.parseEkichikaDiaryDetail(html);
  eq('★ フォームと写真の日記IDが食い違えば言う',
    d.problems.filter((s) => s.indexOf('食い違う') > 0).length, 1);
}
{
  const d = m.parseEkichikaDiaryDetail('');
  eq('空でも落ちない', d.castId, null);
  eq('理由が出る', d.problems.length > 0, true);
}
{
  const d = m.parseEkichikaDiaryDetail(detail({ flg: '1', body: '', imgs: [] }));
  eq('本文の欄はある', d.bodyHtml, '');
  eq('★ 中身が何も無いものは使わせない', m.diaryDetailUsable(d), false);
}

console.log('\n── 10. どれを開くか（§369・§371・§375・初回40日） ──');
const NOW = '2026-09-01T13:00:00+09:00';
{
  const page = m.parseEkichikaDiaryList(listPage([
    listRow('300', '2026 08/31 17:12'),
    listRow('200', '2026 08/20 10:00'),
    listRow('100', '2026 07/01 10:00'),
  ]));
  const all = m.selectDiariesToFetch(page, { now: NOW });
  eq('何も知らなければ全部開く', all.fetch.map((r) => r.diaryId), ['300', '200', '100']);

  const some = m.selectDiariesToFetch(page, { known: ['200', '100'], now: NOW });
  eq('★ 取り込み済みは開かない（§371 新着だけ）', some.fetch.map((r) => r.diaryId), ['300']);
  eq('理由が分かる', some.skippedDone, ['200', '100']);
  eq('★ 文字列で渡したら【取り込み済み】＝いちばん安全なほうに倒す', some.skippedWaiting, []);

  const ranged = m.selectDiariesToFetch(page, { since: '2026-08-01T00:00:00+09:00', now: NOW });
  eq('★ 期間の外は開かない（初回40日）', ranged.fetch.map((r) => r.diaryId), ['300', '200']);
  eq('古いほうの理由も分かる', ranged.skippedOld, ['100']);
}
{
  // ★★★ 消した日記が戻ってこないこと（§369）
  const page = m.parseEkichikaDiaryList(listPage([listRow('300', '2026 08/31 17:12')]));
  const plan = m.selectDiariesToFetch(page, {
    known: [{ diaryId: '300', status: 'imported', checkedAt: '2026-01-01T00:00:00+09:00' }],
    now: NOW,
  });
  eq('★★★ 店舗様が消した日記を、次の巡回で開かない', plan.fetch.length, 0);
  eq('★★ 何年経っても開かない（1日1回の対象ではない）', plan.skippedDone, ['300']);
}
{
  // ★★ 日付が読めない行を「古い」と読み替えない
  const page = m.parseEkichikaDiaryList(listPage([
    listRow('300', '2026 08/31 17:12'), listRow('400', '', { noStamp: true }),
  ]));
  const plan = m.selectDiariesToFetch(page, { since: '2026-08-01T00:00:00+09:00', now: NOW });
  eq('★★ 日付が読めない行は開く（取りこぼさない）', plan.fetch.map((r) => r.diaryId), ['300', '400']);
  eq('古いとは言わない', plan.skippedOld, []);
}
{
  const page = m.parseEkichikaDiaryList('');
  const plan = m.selectDiariesToFetch(page, { known: ['1'], now: NOW });
  eq('読めない一覧からは何も開かない', plan.fetch.length, 0);
}

console.log('\n── 10-2. ★★ 非公開だった日記の開き直しは【1日1回】（§375） ──');
{
  const page = m.parseEkichikaDiaryList(listPage([listRow('300', '2026 08/31 17:12')]));
  const priv = (checkedAt) => m.selectDiariesToFetch(page, {
    known: [{ diaryId: '300', status: 'skipped:private', checkedAt }], now: NOW,
  });

  eq('★ 23時間前に見たものは、まだ開かない', priv('2026-09-01T14:00:00+09:00').fetch.length, 0);
  eq('★ 待っている理由が分かる（取り込み済みとは別）',
    priv('2026-09-01T14:00:00+09:00').skippedWaiting, ['300']);
  eq('★ 取り込み済みには入れない', priv('2026-09-01T14:00:00+09:00').skippedDone, []);

  eq('★★ ちょうど24時間で開き直す',
    priv('2026-08-31T13:00:00+09:00').fetch.map((r) => r.diaryId), ['300']);
  eq('★★ 25時間前なら開き直す',
    priv('2026-08-31T12:00:00+09:00').fetch.map((r) => r.diaryId), ['300']);
  eq('★★★ 最後に見た時刻が分からなければ開く（分からないを「待て」と読まない）',
    priv(null).fetch.map((r) => r.diaryId), ['300']);
  eq('壊れた時刻でも開く', priv('こわれている').fetch.map((r) => r.diaryId), ['300']);
}
{
  // ★ 当たるセラピストが居なかったものも、同じく1日1回（あとで登録されたら拾う）
  const page = m.parseEkichikaDiaryList(listPage([listRow('300', '2026 08/31 17:12')]));
  const plan = m.selectDiariesToFetch(page, {
    known: [{ diaryId: '300', status: 'skipped:no_match', checkedAt: '2026-08-30T13:00:00+09:00' }],
    now: NOW,
  });
  eq('★ 居なかった子の日記も、1日たてば開き直す', plan.fetch.map((r) => r.diaryId), ['300']);
}
{
  // ★★ 開き直しの相手には、期間（初回40日）を当てない
  const page = m.parseEkichikaDiaryList(listPage([listRow('100', '2026 07/01 10:00')]));
  const plan = m.selectDiariesToFetch(page, {
    known: [{ diaryId: '100', status: 'skipped:private', checkedAt: '2026-08-30T13:00:00+09:00' }],
    since: '2026-08-01T00:00:00+09:00', now: NOW,
  });
  eq('★★ 一度わざと見送ったものを、期間で二重に落とさない', plan.fetch.map((r) => r.diaryId), ['100']);
  eq('古い扱いにしない', plan.skippedOld, []);
}
{
  // ★ 単体でも確かめる
  eq('imported は開き直さない',
    m.shouldRecheckDiary({ diaryId: '1', status: 'imported', checkedAt: null }, NOW), false);
  eq('間隔は24時間', m.DIARY_RECHECK_HOURS, 24);
}

console.log('\n── 10-3. ★ 初回の遡り（ページ送り）の止めどき ──');
{
  const nums = [2, 3, 4, 5];
  eq('次のページへ進む',
    m.planDiaryPaging({ pageNumber: 1, pageNumbers: nums, skippedOldCount: 0, pagesLeft: 9 }).next, 2);
  eq('★ 期間の外が出てきたら、そこで止める',
    m.planDiaryPaging({ pageNumber: 1, pageNumbers: nums, skippedOldCount: 1, pagesLeft: 9 }).next, null);
  eq('★ 次のページ番号が無ければ止める',
    m.planDiaryPaging({ pageNumber: 5, pageNumbers: nums, skippedOldCount: 0, pagesLeft: 9 }).next, null);
  eq('★★ 残りページを使い切ったら止める（歯止め）',
    m.planDiaryPaging({ pageNumber: 1, pageNumbers: nums, skippedOldCount: 0, pagesLeft: 0 }).next, null);
  eq('★ 止めた理由が読める',
    m.planDiaryPaging({ pageNumber: 1, pageNumbers: nums, skippedOldCount: 1, pagesLeft: 9 }).reason.indexOf('古い') > 0, true);
  eq('★ 一覧が空でも落ちない',
    m.planDiaryPaging({ pageNumber: 1, pageNumbers: [], skippedOldCount: 0, pagesLeft: 9 }).next, null);
  eq('歯止めの既定は10ページ', m.DIARY_MAX_PAGES, 10);
}

// ────────────────────────────────────────────────
// 11. ★★★ 実物との突き合わせ（_fixtures/ があるときだけ動く）
// ────────────────────────────────────────────────
//   ★ 作り物が通っても、実物で通る保証は無い（第53便: 作り物は通るのに実物では0件だった）。
//   ★ 保存の仕方は _fixtures/置き方.txt。★ このフォルダはコミットしない。
//   ★★ ここでは **中身を出さない**。出すのは【件数】と【問題の有無】だけ。
//     （実在の本文・写真URL・girls_id を画面やログに出さないため）
console.log('\n── 11. 実物との突き合わせ（_fixtures/） ──');
{
  const dir = path.join(__dirname, '..', '_fixtures');
  const listFile = path.join(dir, 'ekichika_diary_list.html');
  const detailFile = path.join(dir, 'ekichika_diary_detail.html');

  if (!fs.existsSync(listFile) && !fs.existsSync(detailFile)) {
    console.log('-- 実物はまだ保存されていない（_fixtures/置き方.txt を参照）');
    console.log('   ★★ 実物で1回通すまで、巡回には載せないこと');
  }
  if (fs.existsSync(listFile)) {
    const p = m.parseEkichikaDiaryList(fs.readFileSync(listFile, 'utf8'));
    console.log('   実物の一覧: ' + p.rows.length + '件 / 日付が読めた ' +
      p.rows.filter((r) => r.postedAt).length + '件 / ページ番号 ' + JSON.stringify(p.pageNumbers));
    eq('★ 実物の一覧に問題が無い', p.problems, []);
    eq('★ 実物の一覧が20〜40件（1ページ30件のはず）', p.rows.length >= 20 && p.rows.length <= 40, true);
    eq('★ 実物の日付が全件読めている', p.rows.filter((r) => !r.postedAt).length, 0);
  }
  if (fs.existsSync(detailFile)) {
    const rawDetail = fs.readFileSync(detailFile, 'utf8');
    const d = m.parseEkichikaDiaryDetail(rawDetail);
    console.log('   実物の詳細: castId ' + (d.castId ? 'あり' : 'なし') +
      ' / タイトル ' + (d.title === null ? '欄なし' : d.title.length + '字') +
      ' / 本文 ' + d.bodyText.length + '字 / 写真 ' + (d.imageUrl ? '1枚' : '0枚') +
      ' / 公開 ' + String(d.isPublic));
    eq('★ 実物の詳細に問題が無い', d.problems, []);
    eq('★ 実物から castId が取れている', d.castId !== null, true);
    eq('★ 実物の公開・非公開が読めている', d.isPublic !== null, true);
    eq('★ 実物の本文が空でない', d.bodyText.length > 0, true);
    // ★★★ 【HTMLに写真があるのに拾えていない】を捕まえる。
    //   ★ 2026-09-01 は、まさにこれを見逃して「写真 0枚」と答えていた。
    //   ★ 写真の無い日記を保存した場合は、この検査そのものが動かない（それでよい）。
    if (/diaries_\d+_file_name\d+\.(?:jpe?g|png|webp)/i.test(rawDetail)) {
      eq('★★★ HTMLに写真があるなら、必ず拾えていること', d.imageUrl !== null, true);
    }
  }
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
