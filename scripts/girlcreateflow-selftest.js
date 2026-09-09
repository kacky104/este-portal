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
  eq('★★★ 登録③: 応答では成否を決めず、一覧を読み直す', [r.kind, r.next.purpose, r.next.method], ['next', 'read_girls', 'GET']);
  eq('★★★ 登録③: リダイレクト先の castId を使わない', /5809639/.test(JSON.stringify(r.next.context)), false);
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

  // ★ メッセージが無い画面でも普通に進む
  const q = go('girl_create', 200, {}, '<html><body>ok</body></html>', ctxV);
  eq('★ メッセージが無ければ持ち回さない', q.next.context.createMessage === undefined, true);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
