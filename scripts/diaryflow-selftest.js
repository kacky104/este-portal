// 写メ日記の段（src/lib/relayFlow.ts の read_diary_list / read_diary_detail）の自己点検（第94便）。
//
// ★★★ この段は【読むだけ】。★ 駅ちかへ POST は1本も投げない。それをここで固定する。
//
// ★★★ この点検の芯は4つ。
//   ① 読めなかったものを「0件」と言わない（★ 空の一覧を信じると、以後1件も取り込まれない）
//   ② ログインが切れたときは【ログインの失敗】として言う（★ 日記の失敗と混ぜない）
//   ③ ★★ 日記1件が読めなくても【店ごと止めない】
//      ★ stop にすると、次の周も同じ日記で止まり、その店は永久に1件も入らなくなる
//   ④ ★★★ 開きに行った日記IDを文脈に残し、別の日記が返ってきたら見つける
//      ★ 取り違えると、Aさんの日記がBさんの名前で載る
//
// ★★ HTMLは作り物。実在の日記・名前・写真URLは入れていない。
//
//   使い方:  npm run check:diaryflow

const f = require(require('path').join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const ctx = (o) => Object.assign({
  v: f.RELAY_FLOW_VERSION, flowId: 'F1', intent: 'diary_read', cookie: 'S=1',
  startedAt: '2026-09-01T00:00:00Z',
}, o || {});
const run = (purpose, o) => f.advanceFlow(Object.assign({
  purpose, status: 200, headers: {}, body: '', context: ctx(),
}, o || {}));

const IMG = 'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/diary/';
const row = (id, stamp) =>
  '<li class="md_list_column_disp clearfix">' +
  '<div class="md_column md_delete_column"><input name="delete[]" value="' + id + '" type="checkbox" /></div>' +
  '<div class="md_column md_date_column">' + stamp + '</div>' +
  '<div class="md_column md_poster_column">ゆき</div>' +
  '<div class="md_column md_diary_column"><span class="title">あ</span><span class="body">い</span></div>' +
  "<div class=\"md_column md_edit_column\"><a href='https://ranking-deli.jp/admin/maildiary/edit/" +
  id + "/'>編集する</a></div></li>";
const listHtml = (...rows) => '<html><body><ul class="md_list">' + rows.join('') + '</ul></body></html>';
const detailHtml = (id, o) => {
  const opt = o || {};
  return '<html><body><form action="/admin/maildiary/edit/' + id + '/" method="post">' +
    '<input type="hidden" name="girls_id" value="5232208">' +
    '<input type="text" name="title" value="きょうのごはん">' +
    '<textarea name="body"><p>おはよう</p><br></textarea>' +
    '<input type="radio" name="display_flg" value="1"' + (opt.hidden ? '' : ' checked') + '>' +
    '<input type="radio" name="display_flg" value="0"' + (opt.hidden ? ' checked' : '') + '>' +
    (opt.noImg ? '' : '<img src="' + IMG + id + '/diaries_' + id + '_file_name20260831171241.jpeg">') +
    '</form></body></html>';
};
const LOGIN_PAGE = '<html><head><title>駅ちかランキング | ログイン</title></head><body></body></html>';

console.log('── 1. URL の組み立て ──');
eq('1ページ目は番号を付けない', f.ekichikaDiaryListUrl(1), 'https://ranking-deli.jp/admin/maildiary/');
eq('0や負でも1ページ目', f.ekichikaDiaryListUrl(0), 'https://ranking-deli.jp/admin/maildiary/');
eq('2ページ目', f.ekichikaDiaryListUrl(2), 'https://ranking-deli.jp/admin/maildiary/2');
eq('詳細', f.ekichikaDiaryDetailUrl('414840669'), 'https://ranking-deli.jp/admin/maildiary/edit/414840669/');
{
  let threw = false;
  try { f.ekichikaDiaryDetailUrl('../../evil'); } catch { threw = true; }
  eq('★ 数字でない日記IDではURLを組み立てない', threw, true);
}

console.log('\n── 2. ログインの次に、一覧を読みに行く ──');
{
  const r = f.advanceFlow({
    purpose: 'login', status: 302, headers: { 'set-cookie': 'S=1' }, body: '',
    context: ctx({ cookie: '' }),
  });
  eq('次の段がある', r.kind, 'next');
  eq('★ 一覧を読みに行く', r.next.purpose, 'read_diary_list');
  eq('★★ GET だけ（駅ちかへ書かない）', r.next.method, 'GET');
  eq('本文は空', r.next.body, '');
  eq('1ページ目', r.next.url, 'https://ranking-deli.jp/admin/maildiary/');
  eq('★ 何ページ目かを文脈に残す', r.next.context.diaryPage, 1);
  eq('★ ログインの成否はここでは書かない', r.audits, []);
}

console.log('\n── 3. 一覧の応答 ──');
{
  const r = run('read_diary_list', {
    body: listHtml(row('300', '2026 08/31 17:12'), row('200', '2026 08/30 09:05')),
    context: ctx({ diaryPage: 1 }),
  });
  eq('★ 読めたら呼び出し側へ返す（次のジョブを積まない＝駅ちかへ何も飛ばない）', r.kind, 'diary_list');
  eq('2件', r.page.rows.length, 2);
  eq('ページ番号も返す', r.pageNumber, 1);
  eq('★ 一覧が読めた＝ログインできた', r.audits[0].event + ':' + r.audits[0].outcome, 'login:ok');
  eq('一覧の記録も残る', r.audits[1].event + ':' + r.audits[1].outcome, 'read_diary_list:ok');
  eq('★ 記録に入るのは件数とページだけ',
    Object.keys(r.audits[1].detail).sort(), ['diaries', 'flowId', 'page']);
}
{
  const r = run('read_diary_list', { body: listHtml(row('300', '2026 08/31 17:12')), context: ctx({ diaryPage: 3 }) });
  eq('★ 3ページ目もそのまま返る', r.pageNumber, 3);
}
{
  // ★★★ 空を成功にしない
  const r = run('read_diary_list', { body: '<html><body><ul class="md_list"></ul></body></html>' });
  eq('★★★ 読めない一覧は止める（0件と言わない）', r.kind, 'stop');
  eq('理由は店舗が読める文', /読み取れませんでした/.test(r.audits[0].summary), true);
}
{
  const r = run('read_diary_list', { status: 302, headers: { location: 'https://ranking-deli.jp/admin/login' } });
  eq('★ ログイン画面へ戻されたら【ログインの失敗】', r.audits[0].event, 'login');
  eq('止める', r.kind, 'stop');
}
{
  const r = run('read_diary_list', { body: LOGIN_PAGE });
  eq('★ 200 でもログイン画面なら【ログインの失敗】', r.audits[0].event, 'login');
}
{
  const r = run('read_diary_list', { status: 500 });
  eq('500 は止める', r.kind, 'stop');
  eq('★ 日記の段の失敗として記録する', r.audits[0].event, 'read_diary_list');
}

console.log('\n── 4. 日記1件の応答 ──');
{
  const r = f.advanceFlow({
    purpose: 'read_diary_detail', status: 200, headers: {},
    body: detailHtml('414840669'), context: ctx({ diaryId: '414840669' }),
  });
  eq('読めた', r.kind, 'diary_detail');
  eq('どの日記かを返す', r.diaryId, '414840669');
  eq('castId が取れている', r.detail.castId, '5232208');
  eq('公開', r.detail.isPublic, true);
  eq('記録は ok', r.audits[0].event + ':' + r.audits[0].outcome, 'read_diary_detail:ok');
  eq('★ 記録に日記の中身を入れない',
    Object.keys(r.audits[0].detail).sort(), ['flowId', 'hasImage', 'isPublic']);
}
{
  const r = f.advanceFlow({
    purpose: 'read_diary_detail', status: 200, headers: {},
    body: detailHtml('414840669', { hidden: true }), context: ctx({ diaryId: '414840669' }),
  });
  eq('★ 非公開でも【読めた】として返す（読めないと混ぜない）', r.kind, 'diary_detail');
  eq('非公開と分かる', r.detail.isPublic, false);
  eq('記録は ok', r.audits[0].outcome, 'ok');
}
{
  // ★★★ 1件おかしいだけで店ごと止めない
  const r = f.advanceFlow({
    purpose: 'read_diary_detail', status: 200, headers: {},
    body: '<html><body>こわれている</body></html>', context: ctx({ diaryId: '414840669' }),
  });
  eq('★★★ 読めなくても stop にしない（次の周も同じ日記で止まらないように）', r.kind, 'diary_detail');
  eq('★ 使えないことは分かる', r.detail.castId, null);
  eq('★ 記録は failed', r.audits[0].outcome, 'failed');
}
{
  const r = f.advanceFlow({
    purpose: 'read_diary_detail', status: 404, headers: {}, body: '',
    context: ctx({ diaryId: '414840669' }),
  });
  eq('★ 1件が404でも店ごと止めない', r.kind, 'diary_detail');
  eq('記録は failed', r.audits[0].outcome, 'failed');
}
{
  // ★★★ 取り違えを見つける
  const r = f.advanceFlow({
    purpose: 'read_diary_detail', status: 200, headers: {},
    body: detailHtml('999999999'), context: ctx({ diaryId: '414840669' }),
  });
  eq('★★★ 別の日記が返ってきたら使わせない', r.detail.problems.length > 0, true);
  eq('★ 記録は failed', r.audits[0].outcome, 'failed');
}
{
  const r = f.advanceFlow({
    purpose: 'read_diary_detail', status: 200, headers: {},
    body: detailHtml('414840669'), context: ctx({}),
  });
  eq('★ どの日記を開いたか分からない応答は進めない', r.kind, 'stop');
}
{
  const r = f.advanceFlow({
    purpose: 'read_diary_detail', status: 200, headers: {},
    body: LOGIN_PAGE, context: ctx({ diaryId: '414840669' }),
  });
  eq('★ ログインが切れていたら【ログインの失敗】として止める', r.kind, 'stop');
  eq('その理由', r.audits[0].event, 'login');
}

console.log('\n── 5. 次のジョブの組み立て ──');
{
  const c = ctx({ diaryPage: 1, diaryId: '111' });
  const next = f.buildReadDiaryListRequest(c, 2);
  eq('2ページ目を読む', next.url, 'https://ranking-deli.jp/admin/maildiary/2');
  eq('GET', next.method, 'GET');
  eq('★ 前の段の日記IDを持ち越さない', next.context.diaryId, undefined);
  eq('ページ番号は入る', next.context.diaryPage, 2);
  eq('Cookie を引き継ぐ', next.headers.cookie, 'S=1');
}
{
  // ★★ 投稿日時は【一覧にしか無い】。詳細の段まで運べていることを固定する
  const next = f.buildReadDiaryDetailRequest(ctx({}), '414840669', '2026-08-31T17:12:00+09:00');
  eq('★★ 投稿日時を詳細の段まで運ぶ', next.context.diaryPostedAt, '2026-08-31T17:12:00+09:00');
  eq('渡さなければ null', f.buildReadDiaryDetailRequest(ctx({}), '1').context.diaryPostedAt, null);
}
{
  const next = f.buildReadDiaryDetailRequest(ctx({}), '414840669');
  eq('詳細を読む', next.purpose, 'read_diary_detail');
  eq('URL', next.url, 'https://ranking-deli.jp/admin/maildiary/edit/414840669/');
  eq('★★★ 開きに行った日記IDを文脈に残す', next.context.diaryId, '414840669');
  eq('★ 本文は空（GETなので）', next.body, '');
}

console.log('\n── 6. ★★ この段は駅ちかへ書かない ──');
{
  // ★ 一覧・詳細のどちらからも、POST を積む道が無いことを確かめる
  const a = f.advanceFlow({
    purpose: 'read_diary_list', status: 200, headers: {},
    body: listHtml(row('300', '2026 08/31 17:12')), context: ctx({ diaryPage: 1 }),
  });
  eq('★★ 一覧を読んでも次のジョブを積まない', a.kind === 'next', false);
  const b = f.advanceFlow({
    purpose: 'read_diary_detail', status: 200, headers: {},
    body: detailHtml('300'), context: ctx({ diaryId: '300' }),
  });
  eq('★★ 詳細を読んでも次のジョブを積まない', b.kind === 'next', false);
  eq('★ 組み立てられるのは GET だけ', f.buildReadDiaryListRequest(ctx({}), 1).method, 'GET');
  eq('★ 組み立てられるのは GET だけ（詳細）', f.buildReadDiaryDetailRequest(ctx({}), '1').method, 'GET');
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
