// 駅ちかの登録の流れ（relayFlow の girl_create）の自己点検（第234便・2026-09-09）。
//
// ★★★ なぜ要るか
//   ここは **相手に人を増やす** ところ。★ 取り消すには第228便の削除が要る（＝取り返しがつかない）。
//   ★ だから「どこで止まるか」を1つずつ固定する。
//
//   使い方:  npm run check:girlcreateflow

const path = require('path');
const RF = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ── 女の子一覧（実測の形の写し）─────────────────────────────
const cell = (id, name) =>
  '<li class="girls-cell ui-sortable-handle">' +
  '<input type="hidden" name="girls_id[' + id + ']" value="' + id + '">' +
  '<div class="customer_checkbox_wrapper"><label class="customer_checkbox checkall">' +
  '<input class="chck_girls_id" name="chck_girls_id[' + id + ']" type="checkbox" value="' + id + '">' +
  '<span class="checkmark"></span></label></div>' +
  '<p class="girl-name">' + name + '</p>' +
  '<div class="girl-image"><img src="/img/img1234s_5.jpg"></div>' +
  '<div class="girl-btn">' +
  '<a href="https://ranking-deli.jp/admin/girls/edit/' + id + '"><img alt="編集"></a>' +
  '<a href="https://ranking-deli.jp/admin/girls/delete/' + id + '"><img alt="削除"></a>' +
  '</div></li>';
const girlsPage = (...cells) => '<html><body><ul id="girlsList">' + cells.join('') + '</ul></body></html>';

// ── 登録フォーム（§2-3 の欄をなぞった作り物）──────────────────
const CSRF = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const GENRES = ['1', '5', '11', '49', '78'];
function formPage(opt) {
  const o = Object.assign({ marker: true }, opt || {});
  let h = '<html><body><form method="GET"><input type="text" name="keyword" value=""></form>';
  h += '<form method="POST" action="/admin/girls/create/">';
  h += '<input type="hidden" name="fuel_csrf_token" value="' + CSRF + '">';
  h += '<input type="text" name="name" value="" maxlength="20">';
  if (o.marker) h += '<input type="text" name="catchcopy" value="" maxlength="15">';
  h += '<input type="text" name="age" value=""><input type="text" name="tall" value="">';
  h += '<input type="text" name="bust" value=""><input type="text" name="waist" value=""><input type="text" name="hip" value="">';
  h += '<select name="cup"><option value="0">-</option><option value="1">Aカップ</option><option value="4">Dカップ</option></select>';
  for (const g of GENRES) h += '<input type="checkbox" name="genre[' + g + ']" value="1">';
  h += '<input type="hidden" name="girls_genre_max_num" value="19">';
  h += '<input type="submit" name="update-btn" value="">';   // ★ 実物の送信ボタン
  return h + '</form></body></html>';
}

const VALUES = { name: 'さくら', genreIds: [1, 49], age: '24', tall: '158', bust: '85', waist: '58', hip: '86', cup: 'D' };
const base = RF.newFlowContext({ flowId: 'f1', intent: 'girl_create', startedAt: '2026-09-09T21:00:00+09:00' });
const ctx = Object.assign({}, base, { cookie: 'sid=abc', createTherapistId: 602, createGirlValues: VALUES });
const OTHERS = [cell('5232208', 'こう'), cell('5232190', 'おつ')];
const go = (purpose, status, headers, body, c) => RF.advanceFlow({ purpose, status, headers: headers || {}, body, context: c });

// ── ① 一覧を読んだ ────────────────────────────────────────
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS), ctx);
  eq('★ 登録①: 登録フォームを読みに行く', [r.kind, r.next.purpose, r.next.method], ['next', 'girl_create_form', 'GET']);
  eq('★★★ 登録①: いまの castId を全部控える（増えた1人を見つける物差し）',
     r.next.context.createBeforeIds, ['5232208', '5232190']);
  eq('★★ 登録①: この段ではまだ1文字も送っていない', r.next.body, '');
}
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('9999999', 'さくら')), ctx);
  eq('★★★ 登録①: 同じ名前が居たら作らない', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['done', 'stopped', 'already_listed']);
  eq('★★ そのとき次の手順は無い', r.next === undefined, true);
  eq('★ その人の castId を記録に残す', r.audits[0].detail.castId, '9999999');
}
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('9999999', 'サクラ')), ctx);
  eq('★★ 登録①: 「サクラ」と「さくら」は別人として扱う（作りに行く）', r.next.purpose, 'girl_create_form');
}
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS), Object.assign({}, ctx, { createGirlValues: undefined }));
  eq('★★★ 登録①: 送る相手が無ければ何もしない', [r.kind, r.audits[0].detail.reason], ['stop', 'no_name']);
}

// ── ② フォームを読んだ → 組み立てて送る ─────────────────────
const ctxF = Object.assign({}, ctx, { createBeforeIds: ['5232208', '5232190'] });
{
  const r = go('girl_create_form', 200, {}, formPage(), ctxF);
  eq('★★★ 登録②: 登録は POST', [r.kind, r.next.purpose, r.next.method], ['next', 'girl_create', 'POST']);
  const got = (n) => r.next.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)).filter(([k]) => k === n).map(([, v]) => v);
  eq('★ 登録②: 名前が入る', got('name'), ['さくら']);
  eq('★★★ 登録②: ジャンルは選んだものだけ', [got('genre[1]'), got('genre[49]'), got('genre[5]')], [['1'], ['1'], []]);
  eq('★★★★ 登録②: 新人マークを混ぜる（画面に欄は無いが通る）', got('rookie_flg'), ['1']);
  eq('★★★ 登録②: カップはラベルで引いた番号（D→4）', got('cup'), ['4']);
  eq('★★ 登録②: 使い捨てトークンを持って行く', got('fuel_csrf_token'), [CSRF]);
  eq('★★★★ 登録②: 押したボタンを送る（2026-09-09 の実弾で欠けていたもの）', got('update-btn'), ['']);
  eq('★★ 登録②: 照合の段へ進む', r.next.context.createStage, 'verify');
  eq('★★ 登録②: 控えた顔ぶれは持ち回す', r.next.context.createBeforeIds, ['5232208', '5232190']);
}
{
  const r = go('girl_create_form', 200, {}, formPage(),
    Object.assign({}, ctxF, { createGirlValues: Object.assign({}, VALUES, { genreIds: [1, 999] }) }));
  eq('★★★ 登録②: 画面に無いジャンルなら送らない', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'stopped', 'blocked']);
  eq('★★ 止めた理由をそのまま記録に残す', /画面に無い/.test(r.audits[0].detail.note), true);
}
{
  const r = go('girl_create_form', 200, {}, formPage(),
    Object.assign({}, ctxF, { createGirlValues: Object.assign({}, VALUES, { name: 'あ'.repeat(21) }) }));
  eq('★★★ 登録②: 画面の maxlength を超えたら送らない', [r.kind, r.audits[0].detail.reason], ['stop', 'blocked']);
}
{
  const r = go('girl_create_form', 200, {}, formPage({ marker: false }), ctxF);
  eq('★★★ 登録②: 登録フォームを見分けられなければ送らない', [r.kind, r.audits[0].detail.reason], ['stop', 'parse_failed']);
}
{
  const r = go('girl_create_form', 200, {}, '<html>メンテナンス中</html>', ctxF);
  eq('★★★ 登録②: 読めない画面では送らない', [r.kind, r.audits[0].detail.reason], ['stop', 'parse_failed']);
}
{
  const r = go('girl_create_form', 302, { location: 'https://ranking-deli.jp/admin/login' }, '', ctxF);
  eq('★★ 登録②: ログイン画面へ戻されたら止める', [r.kind, r.audits[0].event], ['stop', 'login']);
}

// ── ③ POST の応答: 成否を決めず読み直す ─────────────────────
const ctxV = Object.assign({}, ctxF, { createStage: 'verify' });
{
  // ★★★ 保存に成功すると編集ページへ飛ぶ。★ **その番号を使わない**
  const r = go('girl_create', 302, { location: 'https://ranking-deli.jp/admin/girls/edit/5809639' }, '', ctxV);
  // ★★★★ 302 のときは、まず**突き返された先**を読む（赤字はそこに出る・2026-09-09 実測）
  eq('★★★★ 登録③: 302 なら飛んだ先を読みに行く', [r.kind, r.next.purpose, r.next.method], ['next', 'girl_create_msg', 'GET']);
  eq('★★★ 登録③: 読みに行く先は駅ちかが指した場所', r.next.url, 'https://ranking-deli.jp/admin/girls/edit/5809639');
  // ★★★ リダイレクト先の castId は【記録にだけ】残す。★ 判定には使わない（§2-4・第46便 §35）
  //   ★ 2026-09-09 の実弾で 302 に当たり、行き先が分からず足踏みしたので、記録には残すことにした。
  {
    const c = Object.assign({}, r.next.context);
    delete c.createDiag;   // ★ 記録用の1行だけは castId を含んでよい
    eq('★★★ 登録③: リダイレクト先の castId を判定に持ち込まない', /5809639/.test(JSON.stringify(c)), false);
    eq('★★★★ 登録③: 行き先は記録には残す', /5809639/.test(r.next.context.createDiag), true);
  }
  eq('★★ 登録③: まだ「できました」と記録しない', r.audits, []);
}
{
  const r = go('girl_create', 500, {}, '', ctxV);
  eq('★★ 登録③: 5xx は失敗として残す', [r.kind, r.audits[0].event, r.audits[0].outcome], ['stop', 'create_girl', 'failed']);
}

// ── ④ 照合 ────────────────────────────────────────────────
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), ctxV);
  eq('★★★ 登録④: 増えた1人を見つけて「できました」', [r.kind, r.audits[0].event, r.audits[0].outcome], ['done', 'create_girl', 'ok']);
  eq('★★★ 登録④: 回収した castId を返す（★ 表に書くのは呼び出し側）',
     r.mediaCreated, { therapistId: 602, castId: '5809639', name: 'さくら' });
}
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS), ctxV);
  eq('★★★ 登録④: 増えていなければ失敗として残す', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'failed', 'not_created']);
}
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら'), cell('5809640', 'ゆい')), ctxV);
  eq('★★ 登録④: 2人増えても名前で絞れれば通す', [r.kind, r.mediaCreated.castId], ['done', '5809639']);
}
{
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'あや'), cell('5809640', 'ゆい')), ctxV);
  eq('★★★ 登録④: どれを登録したのか決められなければ止める', [r.kind, r.audits[0].detail.reason], ['stop', 'ambiguous']);
}

// ── ⑤ 網羅の見張り（★ 登録が出勤ページへ迷い込んだら止める）──
{
  const r = go('read_work', 200, {}, '<html><body>出勤</body></html>', ctx);
  eq('★★★ 登録が出勤ページへ迷い込んだら止める', r.kind, 'stop');
}


// ── ⑥ ★★★★ 書き込みのあと、画面のメッセージを読む（第234便の修正）──
//
// ★★★ 設計メモ §2-6 の教訓:
//   > 原因はエラーメッセージにそのまま書いてあった。保存直後の画面を読まずに次へ進んだのが遠回りの理由。
//   ★ 2026-09-09 の実弾で**同じ遠回りをした**（登録が通らない理由が記録に残らなかった）。
// ★★ 判定には使わない。★ 記録に残すためだけ。★ 判定は今までどおり「読み直して増えたか」。
{
  const err = '<html><body><div class="message" style="color:rgb(255,0,0)">ジャンルは最低１つ選択してください。</div></body></html>';
  const r = go('girl_create', 200, {}, err, ctxV);
  eq('★★★★ 画面のことばを持ち回す', r.next.context.createMessage, 'ジャンルは最低１つ選択してください。');
  eq('★★ それでも次は読み直し（応答では判定しない）', r.next.purpose, 'read_girls');

  const v = go('read_girls', 200, {}, girlsPage(...OTHERS), r.next.context);
  eq('★★★★ 失敗の記録に駅ちかの文言が載る', /ジャンルは最低１つ選択してください。/.test(v.audits[0].summary), true);
  eq('★★ detail にも残る', v.audits[0].detail.note, 'ジャンルは最低１つ選択してください。');
  eq('★ 判定そのものは変わらない（増えていない＝失敗）', v.audits[0].detail.reason, 'not_created');

  // ★★★★ 応答の正体も残す（第234便の修正3）。★ 「届いたのに登録されない」を推測で追わないため
  const back = go('girl_create', 200, {}, formPage(), ctxV);
  eq('★★★★ 差し戻し（登録フォームの再表示）だと分かる', /差し戻し/.test(back.next.context.createDiag), true);
  const v2 = go('read_girls', 200, {}, girlsPage(...OTHERS), back.next.context);
  eq('★★★★ 失敗の記録に応答の正体が載る', /HTTP 200/.test(v2.audits[0].detail.response), true);
  const ok2 = go('girl_create', 302, { location: 'https://ranking-deli.jp/admin/girls/edit/1' }, '', ctxV);
  eq('★★ 差し戻しでなければそう分かる', /されていない/.test(ok2.next.context.createDiag), true);
  // ★★★★ 行き先が最重要（2026-09-09 の実弾で 302 に当たり、行き先が分からず足踏みした）
  eq('★★★★ 行き先（Location）を残す', /→ https:\/\/ranking-deli\.jp\/admin\/girls\/edit\/1/.test(ok2.next.context.createDiag), true);
  const noloc = go('girl_create', 302, {}, '', ctxV);
  eq('★ 行き先が無ければ「行き先なし」と書く', /行き先なし/.test(noloc.next.context.createDiag), true);

  // ★★★ Cookie を畳み直す（第234便の書き漏らし）
  const c1 = go('read_girls', 200, { 'set-cookie': ['sid=new1; Path=/'] }, girlsPage(...OTHERS), ctx);
  eq('★★★ 一覧の応答の Cookie を畳む', /sid=new1/.test(c1.next.context.cookie), true);
  const c2 = go('girl_create_form', 200, { 'set-cookie': ['sid=new2; Path=/'] }, formPage(), ctxF);
  eq('★★★ フォームの応答の Cookie を畳む', /sid=new2/.test(c2.next.context.cookie), true);
  const c3 = go('girl_create', 200, { 'set-cookie': ['sid=new3; Path=/'] }, '<html>ok</html>', ctxV);
  eq('★★★ 登録の応答の Cookie を畳む', /sid=new3/.test(c3.next.context.cookie), true);

  // ★ メッセージが無い画面でも普通に進む
  const q = go('girl_create', 200, {}, '<html><body>ok</body></html>', ctxV);
  eq('★ メッセージが無ければ持ち回さない', q.next.context.createMessage === undefined, true);
}


// ── ⑦ ★★★★ 突き返された先を読む（第234便の修正5）──
//
// ★★★ 駅ちかは弾いたとき 302 で飛ばし、**赤字は飛んだ先に出す**（2026-09-09 実測）。
//   ★ 2種類ある: /index/「ページ遷移が正しくありません」（トークン）／ /create/「名前は必須入力です」（検証）
{
  const tokenErr = '<html><body>ページ遷移が正しくありません</body></html>';
  const validErr = '<html><body>名前は必須入力です。ジャンルは最低１つ選択してください。</body></html>';
  const r1 = go('girl_create_msg', 200, {}, tokenErr, ctxV);
  eq('★★★★ トークンの取り違えを文字で残す', /ページ遷移が正しくありません/.test(r1.next.context.createMessage), true);
  eq('★★ そのあと一覧を読み直す（判定は変えない）', r1.next.purpose, 'read_girls');
  const r2 = go('girl_create_msg', 200, {}, validErr, ctxV);
  eq('★★★★ 入力の検証で弾かれたことを文字で残す', /名前は必須入力です/.test(r2.next.context.createMessage), true);
  const v = go('read_girls', 200, {}, girlsPage(...OTHERS), r2.next.context);
  eq('★★★★ 失敗の記録に文言が載る', /名前は必須入力です/.test(v.audits[0].summary), true);
  const r3 = go('girl_create_msg', 200, {}, '<html>なにも書いていない</html>', ctxV);
  eq('★ 文言が無くても止まらない', r3.next.purpose, 'read_girls');
}

// ── ⑧ ★★★★ 送り先は【読んだフォームの action】／送った全文を記録に残す（第235便・§17-8/§17-5）──
//
// ★★★ 2026-09-09 の切り分け: 駅ちかへの書き込みで**動いているのは出勤だけ**で、
//   出勤だけが「読んだフォームの action」へ送っていた。★ 登録と削除は URL を決め打ちしていた。
//   ★★ ここは **決め打ちに戻らないための番人**。
{
  const r = go('girl_create_form', 200, {}, formPage(), ctxF);
  eq('★★★★ 送り先は読んだ action', r.next.url, 'https://ranking-deli.jp/admin/girls/create/');
  eq('★★★ 何をどこへ送るかを送る前に残す', /送り先 https:\/\/ranking-deli\.jp\/admin\/girls\/create\/（action）/.test(r.note), true);
  eq('★★★★ 送った全文を持ち回す（★ §17-5 の突き合わせ用）', r.next.context.createSent.body, r.next.body);
  eq('★ 新人マークの有無も持ち回す', r.next.context.createSent.rookie, true);

  // ★ 相手が action を変えたら、こちらは黙って追随する
  const r2 = go('girl_create_form', 200, {}, formPage().replace('action="/admin/girls/create/"', 'action="/admin/girls/create_exe/"'), ctxF);
  eq('★★★★ action が変わったらそちらへ送る', r2.next.url, 'https://ranking-deli.jp/admin/girls/create_exe/');
  eq('★★ 決め打ちと違ったことを note に残す', /決め打ちと action が違っていた/.test(r2.note), true);

  // ★★★ 切り分け用の逃げ道（★ コードを直さずに元へ戻せる）
  const rf = go('girl_create_form', 200, {}, formPage(), Object.assign({}, ctxF, { createPostTo: 'fixed' }));
  eq('★★ createPostTo:fixed なら決め打ち', rf.next.url, 'https://ranking-deli.jp/admin/girls/create/');
  const rr = go('girl_create_form', 200, {}, formPage(), Object.assign({}, ctxF, { createRookie: false }));
  eq('★★★★ createRookie:false なら rookie_flg を混ぜない', /rookie_flg/.test(rr.next.body), false);
  eq('★ 混ぜなかったことを残す', rr.next.context.createSent.rookie, false);

  // ★★★★ 失敗の記録に「送った全文」が載る（★ これが無くて 2026-09-09 は4回とも推測で終わった）
  const sent = r.next.context;
  const v = go('read_girls', 200, {}, girlsPage(...OTHERS), Object.assign({}, sent, { createStage: 'verify' }));
  eq('★★★★ 失敗の記録に送った全文が（分けて）載る',
     Object.keys(v.audits[0].detail).filter((k) => /^b\d\d$/.test(k)).sort().map((k) => v.audits[0].detail[k]).join(''),
     r.next.body.replace(/fuel_csrf_token=[^&]*/, 'csrftk=(伏せた)'));
  eq('★★★ 送り先と決め方も載る', [v.audits[0].detail.sentPath, v.audits[0].detail.sentTo],
     ['/admin/girls/create/', 'action']);
  eq('★★ 新人マークの有無も載る', v.audits[0].detail.rookie, true);
}

// ── ⑨ ★★★★★ 削除は【一覧の削除リンクを GET】（第238便・2026-09-10 実測）──
//
// ★★★ ブラウザで手押し削除した実物（2026-09-10 02:13）:
//   GET https://ranking-deli.jp/admin/girls/delete/5810254&gl=Hdly → 302 → /admin/girls
//   ★ 一括削除フォームの POST では消えなかった（実弾で確認）。
//   ★★ `&gl=` は毎回変わる。★ だから **読んだ href をそのまま使う**（組み立てない）。
{
  const dbase = RF.newFlowContext({ flowId: 'f2', intent: 'girl_delete', startedAt: '2026-09-09T21:00:00+09:00' });
  const dctx = Object.assign({}, dbase, { cookie: 'sid=abc', deleteCastId: '5810099' });
  const href = 'https://ranking-deli.jp/admin/girls/delete/5810099&gl=Hdly';

  const d1 = RF.buildGirlDeleteStep(dctx, href);
  eq('★★★★★ 削除は GET', d1.method, 'GET');
  eq('★★★★ 読んだ削除リンクをそのまま叩く（gl も込み）', d1.url, href);
  eq('★★ 本文は空（フォームではない）', d1.body, '');
  eq('★ 何を叩いたかを記録に残す', [d1.context.deleteSent.url, d1.context.deleteSent.sentTo], [href, 'link']);

  // ★★★★★ 見張り: 別人のリンクは絶対に叩かない（★ 取り返しがつかない）
  const throwsD = (name, fn, re) => {
    try { fn(); console.log('NG ' + name + '（例外にならなかった）'); fail++; }
    catch (e) { if (re && !re.test(e.message)) { console.log('NG ' + name + '（違う例外: ' + e.message + '）'); fail++; } else console.log('ok ' + name); }
  };
  throwsD('★★★★★ 別人の castId のリンクは叩かない',
    () => RF.buildGirlDeleteStep(dctx, 'https://ranking-deli.jp/admin/girls/delete/9999999&gl=Hdly'),
    /castId 5810099 のものではありません/);
  throwsD('★★★★ 番号の先頭一致で騙されない（58100991 は別人）',
    () => RF.buildGirlDeleteStep(dctx, 'https://ranking-deli.jp/admin/girls/delete/58100991&gl=Hdly'),
    /castId 5810099 のものではありません/);
  throwsD('★★★★★ 別サイトのリンクは叩かない（Cookie を他所へ飛ばさない）',
    () => RF.buildGirlDeleteStep(dctx, 'https://cocoa-job.jp/admin/girls/delete/5810099'),
    /駅ちかではありません/);

  // ★ 一覧に削除リンクが無ければ【消さない】
  const noLink = girlsPage(...OTHERS).replace(/<a href="https:\/\/ranking-deli\.jp\/admin\/girls\/delete\/\d+"><img alt="削除"><\/a>/g, '');
  const out = go('read_girls', 200, {}, noLink, Object.assign({}, dbase, { cookie: 'sid=abc', deleteCastId: '5232208' }));
  eq('★★★★ 削除リンクが読めなければ消さない', out.audits[0].detail.reason, 'no_delete_link');
}

// ── ⑩ ★★★★ 監査の見張りを通る形で記録する（第236便・2026-09-10）──
//
// ★★★ 2026-09-10 未明に踏んだ: `sentBody` をそのまま入れたら見張りが丸ごと落とした。
//   ★ 見張りの決まり: 値が URL に見える／`fuel_csrf_token` を含む／120字超 は残さない。
//   ★★ ここは **また落とされないための番人**。
{
  const A = require(path.join(__dirname, '..', '_tmpcheck', 'mediaAudit.js'));

  eq('★★ URL からパスだけ取る', RF.pathOfUrl('https://ranking-deli.jp/admin/girls/create/'), '/admin/girls/create/');
  eq('★ パスが無ければ /', RF.pathOfUrl('https://ranking-deli.jp'), '/');
  eq('★ 空なら null', RF.pathOfUrl(''), null);
  eq('★★★ パスは見張りを通る', A.valueLooksSecret('/admin/girls/create/'), false);
  eq('★★★ もとの URL は見張りに落とされる（★ だからパスにした）',
     A.valueLooksSecret('https://ranking-deli.jp/admin/girls/create/'), true);

  const body = 'fuel_csrf_token=deadbeefdeadbeefdeadbeef&name=%E3%81%A6%E3%81%99%E3%81%A8&age=22'
    + '&genre%5B49%5D=1&genre%5B65%5D=1&update-btn=&rookie_flg=1' + '&pad=' + 'x'.repeat(400);
  const parts = RF.splitBodyForAudit(body);
  const keys = Object.keys(parts).filter((k) => /^b\d\d$/.test(k)).sort();
  eq('★★★★ 使い捨てトークンは【名前ごと】伏せる',
     keys.map((k) => parts[k]).join('').includes('fuel_csrf_token'), false);
  eq('★★★ 順に繋げば元に戻る（トークンだけ伏せた形）',
     keys.map((k) => parts[k]).join(''), body.replace(/fuel_csrf_token=[^&]*/, 'csrftk=(伏せた)'));
  eq('★★★★ どの1枚も見張りを通る', keys.every((k) => A.valueLooksSecret(parts[k]) === false), true);
  eq('★★ 1枚あたり120字を超えない', keys.every((k) => String(parts[k]).length <= 120), true);

  // ★★ 長すぎるときは切るが、切ったことを残す（★ 黙って切らない）
  const huge = RF.splitBodyForAudit('a'.repeat(5000));
  eq('★★★ 20枚で打ち止め', Object.keys(huge).filter((k) => /^b\d\d$/.test(k)).length, 20);
  eq('★★★★ 切ったぶんの字数を残す', huge.bCut, 5000 - 20 * 110);

  // ★★★★ 失敗の記録に、分けた本文とパスが載る
  const r = go('girl_create_form', 200, {}, formPage(), ctxF);
  const v = go('read_girls', 200, {}, girlsPage(...OTHERS),
               Object.assign({}, r.next.context, { createStage: 'verify' }));
  const d = v.audits[0].detail;
  eq('★★★ 送り先はパスで載る', d.sentPath, '/admin/girls/create/');
  eq('★★★ 読んだ action もパスで載る', d.actionPath, '/admin/girls/create/');
  eq('★★★★ 本文が分けて載る',
     Object.keys(d).filter((k) => /^b\d\d$/.test(k)).length > 0, true);
  eq('★★★★ 繋ぐと送った本文に戻る',
     Object.keys(d).filter((k) => /^b\d\d$/.test(k)).sort().map((k) => d[k]).join(''),
     r.next.body.replace(/fuel_csrf_token=[^&]*/, 'csrftk=(伏せた)'));
}

// ── ⑪ ★★★★★ 媒体から居なくなったら【結びつきも外す】と伝える（第239便・2026-09-10）──
//
// ★★★ 2026-09-10 未明に詰まったこと:
//   駅ちかから人を消しても `therapist_media_ids` の行が残り、同じ方を送ろうとして 409 で止まった。
//   ★★ 逆に castId が別人に再利用されたら **別人に書き込む**。★ こちらのほうが怖い。
//   → 流れは `mediaRemoved` を返し、**外すのは呼び出し側**（このファイルは DB を知らない約束）。
// ★★★★ ここは **また外し忘れないための番人**。
{
  const dbase2 = RF.newFlowContext({ flowId: 'f3', intent: 'girl_delete', startedAt: '2026-09-09T21:00:00+09:00' });
  const dctx2 = Object.assign({}, dbase2, { cookie: 'sid=abc', deleteCastId: '5810099' });

  // ① 消したことを一覧で確かめた → 外す
  const okOut = go('read_girls', 200, {}, girlsPage(...OTHERS),
    Object.assign({}, dctx2, { deleteStage: 'verify', deleteName: 'てすと', deleteBefore: 3 }));
  eq('★ 削除は成功', okOut.audits[0].outcome, 'ok');
  eq('★★★★★ 結びつきを外すよう伝える', okOut.mediaRemoved,
     { castId: '5810099', name: 'てすと', reason: 'deleted' });

  // ② 行ったらもう居なかった → これも外す（★ 手で消された方の行が残るのを防ぐ）
  const goneOut = go('read_girls', 200, {}, girlsPage(...OTHERS), dctx2);
  eq('★ 何もしないで終わる', goneOut.audits[0].outcome, 'stopped');
  eq('★★★★ もう居なくても結びつきは外す', goneOut.mediaRemoved,
     { castId: '5810099', name: null, reason: 'not_listed' });

  // ③ ★★★ まだ残っている（削除できていない）→ **外さない**
  const stillOut = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5810099', 'てすと')),
    Object.assign({}, dctx2, { deleteStage: 'verify', deleteName: 'てすと', deleteBefore: 3 }));
  eq('★ 削除は失敗', stillOut.audits[0].outcome, 'failed');
  eq('★★★★★ 消せていないのに結びつきを外さない', stillOut.mediaRemoved === undefined, true);

  // ④ ★★ 登録の流れは mediaRemoved を返さない（取り違えの番人）
  const created = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('999', 'さくら')), ctxV);
  eq('★★ 登録の done は mediaRemoved を返さない', created.mediaRemoved === undefined, true);
}

// ── ★★★★★★ 第249便: 登録のあと、そのまま枠1へ写真を1枚 ───────────────────
//   ★ ここは【相手に人が増えたあと、さらに書き込む】ところ。★ 止めを数で固定する。
console.log('\n── 第249便: 登録 → 枠1へ写真（withPhoto）──');
{
  const FILE = { bucket: 'therapist-photos', path: '602-1.jpg', filename: 'fukues_602_1.jpg', contentType: 'image/jpeg', width: 600, height: 800 };
  const pctxV = Object.assign({}, ctxV, { photoFile: FILE, photoTop: true, photoThumbRect: { x: 60, y: 0, w: 180, h: 180 } });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), pctxV);

  eq('★★★★★ 登録が通ったら、終わらずに編集ページを読みに行く', [r.kind, r.next.purpose, r.next.method], ['next', 'read_photo_page', 'GET']);
  eq('★★★★★★ 行き先は【読み直して確かめた castId】の編集ページ',
     r.next.url, 'https://ranking-deli.jp/admin/girls/edit/5809639');
  eq('★★★ 送る枠は1・段は upload', [r.next.context.photoSlot, r.next.context.photoStage], [1, 'upload']);
  eq('★★ 枠1へ入れてよいという合図は持ち回る', r.next.context.photoTop, true);
  eq('★ 登録できたことは記録に残る', [r.audits[0].event, r.audits[0].outcome], ['create_girl', 'ok']);
  eq('★★★★★★ **まだ続くのに** castId の結びつけを返す（★ 二重登録を作らない）',
     r.mediaCreated, { therapistId: 602, castId: '5809639', name: 'さくら' });
}
{
  // ★★★ 写真の材料が無ければ、今までどおり done（★ withPhoto を書かなければ何も変わらない）
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), ctxV);
  eq('★★★★ 写真の材料が無ければ、今までどおり done', [r.kind, r.next === undefined], ['done', true]);
}
{
  // ★★ 写真はあるが top の合図が無い → 送らない（★ 枠1は合図があるときだけ）
  const noTop = Object.assign({}, ctxV, { photoFile: { bucket: 'b', path: 'p', filename: 'f.jpg', contentType: 'image/jpeg', width: 600, height: 800 } });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), noTop);
  eq('★★★★★ top の合図が無ければ写真へ進まない', r.kind, 'done');
}
{
  // ★★★★★★ 登録に失敗したら、写真へは進まない（★ 誰の枠か分からないまま送らない）
  const pctxV = Object.assign({}, ctxV, { photoFile: { bucket: 'b', path: 'p', filename: 'f.jpg', contentType: 'image/jpeg', width: 600, height: 800 }, photoTop: true });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS), pctxV);
  eq('★★★★★★ 登録が失敗したら写真へは進まない', [r.kind, r.audits[0].outcome], ['stop', 'failed']);
}
{
  // ★★★ 増えた人が絞れないときも進まない（★ 別人の枠に入れない）
  const pctxV = Object.assign({}, ctxV, { photoFile: { bucket: 'b', path: 'p', filename: 'f.jpg', contentType: 'image/jpeg', width: 600, height: 800 }, photoTop: true });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'あや'), cell('5809640', 'ゆい')), pctxV);
  eq('★★★★★ 誰を登録したのか決められないときは写真へ進まない',
     [r.kind, r.audits[0].detail.reason], ['stop', 'ambiguous']);
}
{
  // ★★★ すでに同じ名前が居て登録しなかったときも、写真へ進まない
  const pctx1 = Object.assign({}, ctx, { photoFile: { bucket: 'b', path: 'p', filename: 'f.jpg', contentType: 'image/jpeg', width: 600, height: 800 }, photoTop: true });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('9999999', 'さくら')), pctx1);
  eq('★★★★ すでに居るので登録しない → 写真へも進まない',
     [r.kind, r.audits[0].detail.reason], ['done', 'already_listed']);
}

// ── ★★★★★ 第250便: 写真を送らなかった理由を記録に残す ───────────────────
//   ★ 既定で写真まで送るようになったので、「入っていない」ときに **なぜか**が残らないと追えない。
console.log('\n── 第250便: 写真を飛ばした理由（photoSkip）──');
{
  const sctxV = Object.assign({}, ctxV, { createPhotoSkip: 'この子のプロフィール写真が therapist-photos に無い（path を指定する）' });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), sctxV);
  eq('★★★ 写真を飛ばしても登録は成功のまま', [r.kind, r.audits[0].outcome], ['done', 'ok']);
  eq('★★★★★ 飛ばした理由が記録に残る', r.audits[0].detail.photoSkip,
     'この子のプロフィール写真が therapist-photos に無い（path を指定する）');
  eq('★★ 結びつけは今までどおり返す', r.mediaCreated.castId, '5809639');
}
{
  // ★★ 理由が無ければ、記録に余計な欄を足さない（★ 空文字で埋めない）
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), ctxV);
  eq('★★★ 飛ばしていなければ photoSkip は出さない', 'photoSkip' in r.audits[0].detail, false);
}
{
  // ★★★ 長い理由は切り詰める（★ 監査の見張りに落とされないため・120字）
  const longCtx = Object.assign({}, ctxV, { createPhotoSkip: 'あ'.repeat(300) });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), longCtx);
  eq('★★ 長い理由は 120 字で切る', r.audits[0].detail.photoSkip.length, 120);
}
{
  // ★★★★★★ 写真を送る流れでは photoSkip は入らない（★ 両方は起きない）
  const FILE = { bucket: 'therapist-photos', path: '602-1.jpg', filename: 'fukues_602_1.jpg', contentType: 'image/jpeg', width: 600, height: 800 };
  const pctxV = Object.assign({}, ctxV, { photoFile: FILE, photoTop: true });
  const r = go('read_girls', 200, {}, girlsPage(...OTHERS, cell('5809639', 'さくら')), pctxV);
  eq('★★★ 写真へ進む流れでは photoSkip を出さない', ['photoSkip' in r.audits[0].detail, r.kind], [false, 'next']);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
