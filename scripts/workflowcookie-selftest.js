// 駅ちかの出勤の流れ（読む → 書く → 読み直す）の自己点検（第1270便・2026-10-07）。
//
// ★★★ ここで見張っているのは2つ:
//   ① 出勤ページを読んだ応答の Cookie を、書き込みに持っていくこと。
//      ★ 実際に起きた（ラビリンス様・10/6〜10/7）: 更新12回が12回とも「読み直したら一致しない」。1件も入っていなかった。
//        駅ちかのフォームの fuel_csrf_token はページを開くたびに変わる（10/7 に実物で確認）。
//        この流れだけ、読んだページの Set-Cookie を捨てて、ログイン直後の Cookie で書き込んでいた。
//   ② 読み直して合わなかった回を「送れた」と記録しないこと。
//      ★ write_work 'ok' と書いていたので、「3回続けて反映できなかったら自動をやめて知らせる」が働かなかった。
//
//   使い方:  npm run check:workflowcookie

const path = require('path');
process.env.MEDIA_CRED_KEY = process.env.MEDIA_CRED_KEY || require('crypto').randomBytes(32).toString('base64');
const RF = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));
const W = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaWorkParse.js'));
const A = require(path.join(__dirname, '..', '_tmpcheck', 'mediaAudit.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ── 出勤ページの形（tools-test-relay-flow.mjs と同じ。2026-08-28 に実物から写した形）──
const DATES = ['10/07(水)', '10/08(木)', '10/09(金)', '10/10(土)', '10/11(日)', '10/12(月)', '10/13(火)'];
const header = (counts) => '<div><dl><dt><span>日付</span></dt><dd><span>出勤人数</span></dd></dl>'
  + DATES.map((d, i) => '<dl><dt class="x"> <span>' + d + '</span> </dt><dd><span class="y">' + counts[i] + '</span></dd></dl>').join('') + '</div>';
const girlBlock = (girlId, name, cells) => '<ul><li><p></p><span class="name">' + name + '</span></li>'
  + cells.map((c, d) => '<li><div>'
    + (d === 0 ? '<input name="girl_work[' + girlId + '][0][girl_id]" value="' + girlId + '" type="hidden">' : '')
    + '<select class="s" name="girl_work[' + girlId + '][' + d + '][start_time]"><optgroup><option value="00:00">0:00</option>'
    + '<option value="' + c.start + '" selected="selected">' + c.start + '</option></optgroup></select> ～ '
    + '<select class="s" name="girl_work[' + girlId + '][' + d + '][end_time]"><optgroup><option value="' + c.end + '" selected="selected">disp</option>'
    + '<option value="47:30">23:30</option></optgroup></select>'
    + '<div><input name="girl_work[' + girlId + '][' + d + '][work_flg]" value="1"' + (c.work ? ' checked="checked"' : '') + ' type="checkbox"><label>出勤</label></div>'
    + '</div></li>').join('') + '</ul>';
const OFF = { start: '00:00', end: '00:00', work: false };
const NIGHT = { start: '20:00', end: '27:00', work: true };
const DAY = { start: '10:00', end: '19:00', work: true };
const pageHtml = (girls, counts, token) => '<!DOCTYPE html><html><head><title>駅ちかランキング|出勤管理</title></head><body>'
  + '<input type="hidden" name="shopid" value="">'
  + '<form action="https://cocoa-job.jp/entry/login/" method="post"><input name="email" type="hidden" value="x"><input name="password" type="hidden" value="y"></form>'
  + '<form action="https://ranking-deli.jp/admin/girlswork" method="post" id="frmSearch"></form>'
  + '<form id="frmfix" action="https://ranking-deli.jp/admin/girlswork/1/" accept-charset="utf-8" method="post">'
  + '<input type="hidden" name="fuel_csrf_token" value="' + token + '">'
  + header(counts) + girls.map((g) => girlBlock(g.girlId, g.name, g.cells)).join('')
  + '<input name="work_btn" value="" type="submit"></form></body></html>';

// いまの駅ちか: さら＝木・金 夜／るい＝水・金 昼
const BEFORE = [
  { girlId: '5232208', name: 'さら（新人）', cells: [OFF, NIGHT, NIGHT, OFF, OFF, OFF, OFF] },
  { girlId: '5232190', name: 'るい', cells: [DAY, OFF, DAY, OFF, OFF, OFF, OFF] },
];
// 送りたい形: さら が 水 も夜に出る
const WANT = [
  { girlId: '5232208', name: 'さら（新人）', cells: [NIGHT, NIGHT, NIGHT, OFF, OFF, OFF, OFF] },
  { girlId: '5232190', name: 'るい', cells: [DAY, OFF, DAY, OFF, OFF, OFF, OFF] },
];
const TOKEN_A = 'a'.repeat(128), TOKEN_B = 'b'.repeat(128);
const HTML_BEFORE = pageHtml(BEFORE, [1, 1, 2, 0, 0, 0, 0], TOKEN_B);
const HTML_AFTER = pageHtml(WANT, [2, 1, 2, 0, 0, 0, 0], TOKEN_A);

const ctxOf = (intent, o) => Object.assign(
  RF.newFlowContext({ flowId: 'f1', intent, startedAt: '2026-10-07T15:00:00+09:00' }),
  { cookie: 'fuelcid=LOGIN; fuel_csrf_token=OLD' }, o || {});
const step = (purpose, res, context) => RF.advanceFlow({ purpose, status: res.status, headers: res.headers || {}, body: res.body || '', context });
const evs = (out) => out.audits.map((a) => a.event + ':' + a.outcome);

console.log('── 1. ★★★ 出勤ページを読んだ応答の Cookie を、書き込みへ持っていく ──');
for (const intent of ['work_push', 'work_auto', 'work_dryrun']) {
  const out = step('read_work', {
    status: 200, body: HTML_BEFORE,
    headers: { 'set-cookie': ['fuel_csrf_token=NEW; path=/; HttpOnly', 'fuelcid=ROTATED; path=/; HttpOnly'] },
  }, ctxOf(intent));
  eq('★ ' + intent + ': 計画の段へ進む', out.kind, 'plan_work');
  eq('★★★ ' + intent + ': 読んだページが配った Cookie に入れ替わっている（古い合言葉のまま書かない）', out.cookie, 'fuelcid=ROTATED; fuel_csrf_token=NEW');
}
{
  const out = step('read_work', { status: 200, body: HTML_BEFORE, headers: { 'set-cookie': 'fuel_csrf_token=NEW; path=/' } }, ctxOf('work_push'));
  eq('★★ Set-Cookie が1本（配列でない）でも足す。配られなかった Cookie は残す', out.cookie, 'fuelcid=LOGIN; fuel_csrf_token=NEW');
}
{
  const out = step('read_work', { status: 200, body: HTML_BEFORE, headers: {} }, ctxOf('work_push'));
  eq('★★ 何も配られなければ、いまの Cookie のまま（空にしない）', out.cookie, 'fuelcid=LOGIN; fuel_csrf_token=OLD');
}
{
  // ★ 書き込みの組み立て（呼び出し側が outcome.cookie を渡す）: フォームの合言葉と Cookie が同じ回のもの
  const page = W.parseWorkPage(HTML_BEFORE);
  const sent = W.parseWorkPage(HTML_AFTER).girls;
  const req = RF.buildWriteWorkRequest(page, sent, 'fuelcid=ROTATED; fuel_csrf_token=NEW');
  eq('★★★ 書き込みの Cookie は渡したもの', req.headers.cookie, 'fuelcid=ROTATED; fuel_csrf_token=NEW');
  eq('★★★ フォームの fuel_csrf_token は【読んだページのもの】', req.body.includes('fuel_csrf_token=' + TOKEN_B), true);
  eq('★ 宛先は読んだページの form action', req.url, 'https://ranking-deli.jp/admin/girlswork/1/');
}

console.log('\n── 2. 書き込みの応答 → 読み直し ──');
const sentGirls = W.parseWorkPage(HTML_AFTER).girls;
const writeCtx = ctxOf('work_push', {
  cookie: 'fuelcid=ROTATED; fuel_csrf_token=NEW',
  sentPacked: W.encodeGirlWork(sentGirls), sentCount: sentGirls.length, expectedDateLabels: DATES, changeCount: 1,
});
let verifyCtx;
{
  const out = step('write_work', {
    status: 302, body: '',
    headers: { location: 'https://ranking-deli.jp/admin/girlswork/1/?x=1', 'set-cookie': ['fuel_csrf_token=AFTERWRITE; path=/'] },
  }, writeCtx);
  eq('★ 読み直しの段を積む', [out.kind, out.next && out.next.purpose, out.next && out.next.method], ['next', 'verify_work', 'GET']);
  eq('★★ ここではまだ何も記録しない（成否は読み直しだけが知っている）', out.audits, []);
  eq('★★ 読み直しは、書き込みの応答が配った Cookie を足して行く', out.next.headers.cookie, 'fuelcid=ROTATED; fuel_csrf_token=AFTERWRITE');
  eq('★★ 応答の番号と転送先（パスだけ・? より後ろは持たない）を控える', [out.next.context.writeHttpStatus, out.next.context.writeRedirect], [302, '/admin/girlswork/1/']);
  verifyCtx = out.next.context;
}
{
  const out = step('write_work', { status: 200, body: '<html></html>', headers: {} }, writeCtx);
  eq('★ 転送でない応答（200）でも読み直しへ進む。転送先は控えない', [out.next.purpose, out.next.context.writeHttpStatus, out.next.context.writeRedirect], ['verify_work', 200, undefined]);
  eq('★ Cookie が配られなければそのまま', out.next.headers.cookie, 'fuelcid=ROTATED; fuel_csrf_token=NEW');
}
eq('★★ ログイン画面へ戻されたら止める（読み直しへ行かない）',
  evs(step('write_work', { status: 302, body: '', headers: { location: '/admin/login' } }, writeCtx)), ['write_work:failed']);

console.log('\n── 3. ★★★ 読み直して合わなかった回を「送れた」と記録しない ──');
{
  // ★ ラビリンス様で起きた形: 送ったのに、駅ちかは元のまま
  const out = step('verify_work', { status: 200, body: HTML_BEFORE, headers: {} }, verifyCtx);
  eq('★ 止まる', out.kind, 'stop');
  eq('★★★ write_work は failed（ok と書かない）。verify_work も failed', evs(out), ['write_work:failed', 'verify_work:failed']);
  const w = out.audits[0].detail, v = out.audits[1].detail;
  eq('★★ 理由は「読み直したら合わない」', w.reason, 'verify_mismatch');
  // ★ 変えたマス1つ＋その日の出勤人数1つ＝2件（10/6〜10/7 の記録の「変更2件 → 合わない4件」と同じ数え方）
  eq('★★ 合わなかった内訳が残る（マス・日別の人数・人数・日付）', [v.problems, v.cells, v.dayCounts, v.girlCount, v.dateShifted], [2, 1, 1, 0, 0]);
  eq('★★ 書き込みの応答の番号と転送先が残る', [v.writeStatus, v.writeTo], [302, '/admin/girlswork/1/']);
  eq('★★★ 最初の1件が残る。★ 名前は入れない（番号と日と時刻だけ）', v.sample, 'cell_mismatch 5232208 日0: 送った 20:00〜27:00 / 戻り 休み');
  for (const a of out.audits) {
    const s = A.scrubAuditDetail(a.detail);
    eq('★★★ ' + a.event + ' の記録は、秘密よけ（scrubAuditDetail）に1つも落とされない', s.dropped, []);
  }
  eq('★★★ 記録のどこにも名前が出ない', JSON.stringify(out.audits).includes('さら'), false);
  // ★ 「3回続けて反映できなかったら自動をやめる」は write_work の結果だけを数える（mediaLinkMode の shouldGiveUpAuto）
  eq('★★★ この回は「反映できなかった回」として数えられる', out.audits.some((a) => a.event === 'write_work' && a.outcome === 'ok'), false);
}
{
  const out = step('verify_work', { status: 200, body: HTML_AFTER, headers: {} }, verifyCtx);
  eq('★★★ 合っていれば、ここで初めて write_work ok', [out.kind, evs(out)], ['done', ['write_work:ok', 'verify_work:ok']]);
}
{
  const out = step('verify_work', { status: 500, body: '', headers: {} }, verifyCtx);
  eq('★★ 読み直せなかった回は verify_work failed だけ（「送れた」とも「送れなかった」とも書かない）', evs(out), ['verify_work:failed']);
}

// ══════════════════════════════════════════════════════════════════════════════
// ★★★ 第1281便（2026-10-07）: 同じ形（応答の Set-Cookie を捨てて、前の段の Cookie のまま次を送る）が
//   駅ちかの 即ヒメ・削除・写真 の段に残っていた。ここで「どの段も、いま受け取った応答の Cookie を次へ持っていく」を固定する。
//   ★ 段を足すときは、ここに1行足す。
const SET = { 'set-cookie': ['fuel_csrf_token=NEW; path=/; HttpOnly', 'fuelcid=ROTATED; path=/; HttpOnly'] };
const MERGED = 'fuelcid=ROTATED; fuel_csrf_token=NEW';
const KEPT = 'fuelcid=LOGIN; fuel_csrf_token=OLD';
const nextCookie = (out) => [out.kind, out.next && out.next.purpose, out.next && out.next.headers.cookie, out.next && out.next.context.cookie];

console.log('\n── 4. ★★★ 即ヒメ: 読む → 確認 → 設定 → 解除 → 読み直し ──');
{
  const box = (i, o) => o
    ? '<div id="setbox4" class="image-set-box droparea sokuiku_set_box sokuikuSetBoxList-item" data-girlid="' + o.girl + '" data-sokuikuid="' + o.sid + '">'
      + '<div id="sokuiku_set0' + (i + 1) + '" class="sokuiku_image_set"><p class="setboxTitle1">即ヒメ-設定中</p>'
      + '<p class="time_info sokuikuSetBoxList-item-timeInfo">[～ ' + o.until + ' 迄]</p>'
      + '<p class="timer on sokuikuSetBoxList-item-timer is-countdown" data-expired-at="' + o.exp + '">残り28分26秒</p>'
      + '<div class="sokuikuSetBoxList-item-imgWrap"><img class="girlimage" src="x.jpg"></div>'
      + '<p id="imgdel_toppriority" class="sokuikuDelBtn"><img alt="削除"></p>'
      + '<input id="form_toppriority_girl_id" class="girl_id" type="hidden" value="' + o.girl + '" name="toppriority_girl_id"></div></div>'
    : '<div id="setbox4" class="image-set-box droparea sokuiku_set_box sokuikuSetBoxList-item" data-sokuikuid="">'
      + '<div id="sokuiku_set0' + (i + 1) + '" class="sokuiku_image_set"><p class="setboxTitle1">即ヒメ-未設定</p><p class="time_info">&nbsp;</p></div></div>';
  const scell = (id, name, state) => '<li id="' + id + '" class="girls-cell state-' + state + '"><p class="girl-name" data-sort="name">' + name + '</p><div class="girl-image"><img src="i.jpg"></div>'
    + '<div class="girl-btn"><a href="/admin/girls/edit/' + id + '"><img alt="編集"></a><a href="/admin/girls/delete/' + id + '"><img alt="削除"></a></div></li>';
  const SOKU_HTML = '<html><body><h1>即ヒメ設定画面</h1><input type="hidden" id="hide_shop_id" value="37168"><input type="hidden" id="girl_pic_num" value="8">'
    + '<div id="girlControl" class="clearfix"></div><p class="text"><span class="attend_fast">赤：即ヒメ!!設定中</span><span class="attend_now">ピンク：現在出勤中</span></p>'
    + '<h2>出勤中女の子一覧</h2><div id="girls-list"><ul id="girls-list-box" class="list">' + scell('5257770', 'かな', 'now') + '</ul></div>'
    + '<div id="girls-images-set" class="sokuiku sokuikuSetBoxList">' + [null, null, null].map((b, i) => box(i, b)).join('') + '</div></body></html>';

  const read = step('read_sokuhime', { status: 200, body: SOKU_HTML, headers: SET }, ctxOf('sokuhime_auto'));
  eq('★ 即ヒメ設定画面を読めた', read.kind, 'sokuhime');
  eq('★★★ 読んだ画面が配った Cookie を、計画の側へ渡す（呼び出し側がこれで 確認 → 設定 を組む）', read.cookie, MERGED);
  eq('★★ 何も配られなければ、いまの Cookie のまま', step('read_sokuhime', { status: 200, body: SOKU_HTML, headers: {} }, ctxOf('sokuhime_auto')).cookie, KEPT);

  const T = { therapistId: 1, name: 'かな', castId: '5257770', slotIndex: 0, oldGirlId: null, oldSokuikuId: null, untilUnix: null };
  const D = { castId: '111', slotIndex: 1, expiresAtUnix: 1, sokuikuId: '9' };
  const sctx = (o) => ctxOf('sokuhime_auto', Object.assign({ sokuhimeShopId: '37168', sokuhimeTarget: T, sokuhimeQueue: [], sokuhimeDelQueue: [D], sokuhimeSetDone: [], sokuhimeDelDone: [], sokuhimeApply: true }, o || {}));
  eq('★★★ ① 確認の応答 → 設定は、確認の応答が配った Cookie で送る',
    nextCookie(step('sokuhime_check', { status: 200, body: JSON.stringify({ 0: { name: 'かな' }, is_working: true }), headers: SET }, sctx())),
    ['next', 'sokuhime_set', MERGED, MERGED]);
  eq('★★★ ② 設定の応答 → 次（解除）は、設定の応答が配った Cookie で送る',
    nextCookie(step('sokuhime_set', { status: 200, body: JSON.stringify({ 0: { topprioritytime: '01:00' } }), headers: SET }, sctx())),
    ['next', 'sokuhime_del', MERGED, MERGED]);
  eq('★★★ ③ 解除の応答 → 読み直しは、解除の応答が配った Cookie で行く',
    nextCookie(step('sokuhime_del', { status: 200, body: '{}', headers: SET }, sctx({ sokuhimeTarget: undefined, sokuhimeDel: D, sokuhimeDelQueue: [] }))),
    ['next', 'read_sokuhime', MERGED, MERGED]);
  eq('★★ 1人が飛ばされても（出勤中でない）、次の段は配られた Cookie で送る',
    nextCookie(step('sokuhime_check', { status: 200, body: JSON.stringify({ 0: { name: 'かな' }, is_working: false }), headers: SET }, sctx())),
    ['next', 'sokuhime_del', MERGED, MERGED]);
  eq('★ 配られなければそのまま',
    nextCookie(step('sokuhime_check', { status: 200, body: JSON.stringify({ 0: { name: 'かな' }, is_working: true }), headers: {} }, sctx())),
    ['next', 'sokuhime_set', KEPT, KEPT]);
}

console.log('\n── 5. ★★★ 削除: 一覧を読む → 削除リンク → 読み直し ──');
const gcell = (id, name) =>
  '<li class="girls-cell ui-sortable-handle"><input type="hidden" name="girls_id[' + id + ']" value="' + id + '">'
  + '<div class="customer_checkbox_wrapper"><label class="customer_checkbox checkall"><input class="chck_girls_id" name="chck_girls_id[' + id + ']" type="checkbox" value="' + id + '"><span class="checkmark"></span></label></div>'
  + '<p class="girl-name">' + name + '</p><div class="girl-image"><img src="/img/img1234s_5.jpg"></div><div class="girl-btn">'
  + '<a href="https://ranking-deli.jp/admin/girls/edit/' + id + '"><img alt="編集"></a>'
  + '<a href="https://ranking-deli.jp/admin/girls/delete/' + id + '&gl=Hdly"><img alt="削除"></a></div></li>';
const girlsHtml = (...cells) => '<html><body><ul id="girlsList">' + cells.join('') + '</ul></body></html>';
{
  const dctx = ctxOf('girl_delete', { deleteCastId: '5232208' });
  const out = step('read_girls', { status: 200, body: girlsHtml(gcell('5232208', 'こう'), gcell('5232190', 'おつ')), headers: SET }, dctx);
  eq('★★★ 削除リンクの GET は、一覧を読んだ応答が配った Cookie で送る', nextCookie(out), ['next', 'girl_delete', MERGED, MERGED]);
  eq('★ 叩くのは読んだ削除リンクそのまま（gl 込み）', out.next.url, 'https://ranking-deli.jp/admin/girls/delete/5232208&gl=Hdly');
  const out2 = step('girl_delete', {
    status: 302, body: '',
    headers: { location: 'https://ranking-deli.jp/admin/girls', 'set-cookie': ['fuel_csrf_token=AFTERDEL; path=/'] },
  }, out.next.context);
  eq('★★★ 読み直しは、削除の応答が配った Cookie を足して行く', nextCookie(out2), ['next', 'read_girls', 'fuelcid=ROTATED; fuel_csrf_token=AFTERDEL', 'fuelcid=ROTATED; fuel_csrf_token=AFTERDEL']);
  eq('★ 照合の段として読み直す', out2.next.context.deleteStage, 'verify');
  const out3 = step('read_girls', { status: 200, body: girlsHtml(gcell('5232190', 'おつ')), headers: {} }, out2.next.context);
  eq('★ 居なくなっていれば「削除しました」（流れは今までどおり）', [out3.kind, evs(out3)], ['done', ['delete_girl:ok']]);
  eq('★ 配られなければそのまま', nextCookie(step('read_girls', { status: 200, body: girlsHtml(gcell('5232208', 'こう')), headers: {} }, dctx)).slice(2), [KEPT, KEPT]);
}

console.log('\n── 6. ★★★ 写真: 編集ページを読む → アップロード／切り抜き ──');
{
  const GIRL = '5232208', SHOP = '37168', TOKEN = 'tok'.repeat(40);
  const S3 = 'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/' + SHOP + '/' + GIRL + '/img';
  const hid = (n, v) => '<input type="hidden" name="' + n + '" value="' + v + '">';
  const editPage = (occupied) => {
    let h = '<html><body><form action="https://cocoa-job.jp/entry/login/" method="post">' + hid('email', 'x') + hid('password', 'y') + '</form>';
    h += '<form action="https://ranking-deli.jp/admin/girls/edit/' + GIRL + '" method="post"><select name="girl_work[' + GIRL + '][0][start_time]"></select></form>';
    for (let n = 1; n <= 8; n++) {
      const img = occupied.includes(n) ? S3 + n + '_20260809230626.jpg' : '';
      const common = hid('id', GIRL) + hid('edt_table', 'girls') + hid('image_set_id', n) + hid('shopid', SHOP);
      h += '<div id="con' + n + '">';
      h += '<form class="delete-image" method="post" action="#">' + hid('image_set_id', n) + hid('shopid', SHOP) + hid('id', GIRL) + hid('fuel_csrf_token', TOKEN) + '<button type="submit">削除</button></form>';
      h += '<form id="upload-form" method="post" enctype="multipart/form-data" action="#">' + hid('image_set_id', n) + hid('id', GIRL) + hid('edt_table', 'girls') + '<input type="file" name="upfile">' + hid('shopid', SHOP) + hid('fuel_csrf_token', TOKEN) + '<button type="submit">アップロード</button></form>';
      h += '<form id="check-coords1" action="/admin/girls/edit/' + GIRL + '" method="post">' + hid('x', '') + hid('y', '') + hid('w', '') + hid('h', '') + hid('edt_type', '1') + common + hid('image', '') + '<input type="submit" value="修正する"></form>';
      h += '<form id="check-coords" action="/admin/girls/edit/' + GIRL + '" method="post">' + hid('x', '') + hid('y', '') + hid('w', '') + hid('h', '') + hid('edt_type', '2') + common + hid('image', img) + hid('fuel_csrf_token', TOKEN) + '<input type="submit" value="修正する"></form>';
      h += '</div>';
    }
    return h + '</body></html>';
  };
  const FILE = { bucket: 'therapist-photos', path: '41-1783435524379.jpg', filename: 'fukues_41_8.jpg', contentType: 'image/jpeg', width: 600, height: 800 };
  const pctx = (o) => ctxOf('photo_push', Object.assign({ photoGirlId: GIRL, photoSlot: 8, photoFile: FILE, photoStage: 'upload' }, o || {}));
  const read = (occupied, c, headers) => step('read_photo_page', { status: 200, body: editPage(occupied), headers: headers === undefined ? SET : headers }, c);

  const up = read([1, 2, 3, 4], pctx());
  eq('★★★ アップロードは、編集ページを読んだ応答が配った Cookie で送る', nextCookie(up), ['next', 'upload_photo', MERGED, MERGED]);
  eq('★★★ 送る合言葉は【読んだページのもの】', up.next.multipart.fields.fuel_csrf_token, TOKEN);
  eq('★★★ 3:4 の切り抜きも', nextCookie(read([1, 2, 3, 4], pctx({ photoStage: 'crop_main', photoSrc: 'https://s3/big.jpg' }))), ['next', 'crop_photo', MERGED, MERGED]);
  eq('★★★ サムネイルの切り抜きも', nextCookie(read([1, 2, 3, 4], pctx({ photoStage: 'crop_thumb', photoSrc: 'https://s3/big.jpg' }))), ['next', 'crop_photo', MERGED, MERGED]);
  {
    // ★ 複数枚: 枠8を照合で確かめたあと、次の1枚（枠7）のために読み直す
    const before = up.next.context.photoSlotsBefore;
    const out = read([1, 2, 3, 4, 8], pctx({ photoStage: 'verify', photoSrc: 'https://s3/thumb.jpg', photoSlotsBefore: before, photoMulti: true, photoQueue: [{ slot: 7, file: FILE }] }));
    eq('★★ 複数枚の次の1枚のための読み直しも', nextCookie(out), ['next', 'read_photo_page', MERGED, MERGED]);
  }
  eq('★ 配られなければそのまま', nextCookie(read([1, 2, 3, 4], pctx(), {})), ['next', 'upload_photo', KEPT, KEPT]);
  eq('★★ アップロードの応答 → 読み直しも、その応答の Cookie を足す（もとから）',
    nextCookie(step('upload_photo', { status: 200, body: JSON.stringify({ src: 'https://s3/big.jpg', to_thumb: 0, message: '' }), headers: SET }, up.next.context)).slice(0, 3),
    ['next', 'read_photo_page', MERGED]);
}

console.log('\n── 7. 登録のあとの名簿の読み直し ──');
{
  const cctx = ctxOf('girl_create', { createTherapistId: 602, createGirlValues: { name: 'さくら', genreIds: [1] }, createStage: 'verify', createBeforeIds: ['5232208'] });
  const out = step('read_girls', { status: 200, body: girlsHtml(gcell('5232208', 'こう'), gcell('5810254', 'さくら')), headers: SET }, cctx);
  eq('★★ 登録を確かめたあとの名簿の読み直しも、配られた Cookie で行く', nextCookie(out), ['next', 'read_girls', MERGED, MERGED]);
  eq('★ 番号は先に返っている（今までどおり）', out.mediaCreated && out.mediaCreated.castId, '5810254');
}


console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
