// エステラブのフローの段（src/lib/relayFlow.ts の esulove_login / esulove_therapists）の自己点検（第78便）。
//
// ★★★ なぜ要るか
//   この2段は【ログインして名簿を読む】だけで、1文字も書き換えない。
//   ★ だが「読めた」と誤って言うと、その先の突き合わせ（mediaMatch）が
//     **空の名簿を「0人」と信じて全員を新規登録する** —— ㉟ の事故が全員ぶん起きる。
//   → 「読めなかった」を「0人」と言わないことを、ここで固定する。
//
// ★★ HTMLは作り物。実在の名前は入れていない。
//
//   使い方:  npm run check:esuloveflow

const f = require(require('path').join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const ctx = (o) => Object.assign({
  v: f.RELAY_FLOW_VERSION, flowId: 'F1', intent: 'connect_test', cookie: '', startedAt: '2026-08-31T00:00:00Z',
}, o || {});
const run = (purpose, o) => f.advanceFlow(Object.assign({
  purpose, status: 200, headers: {}, body: '', context: ctx(),
}, o || {}));

// 実測の形を写した1人ぶん（★ 編集リンクは2本）
const cell = (id, name) =>
  '<a class="castName" href="/admin/shop/therapist/edit/' + id + '">' + name + '</a>' +
  '<a class="editBtn" href="/admin/shop/therapist/edit/' + id + '"></a>';

// ── ログインの段 ──
eq('★ Cookie が返らなければ止める',
  run('esulove_login', { headers: {} }).kind, 'stop');
eq('その理由は店舗が読める文',
  /ログインできませんでした/.test(run('esulove_login', { headers: {} }).audits[0].summary), true);
eq('4xx は止める',
  run('esulove_login', { status: 403, headers: { 'set-cookie': 'S=1' } }).kind, 'stop');
// ★ ログイン画面が返ってきたら失敗（エステラブは失敗でも200を返す）
eq('★ 200 でもログイン画面なら止める',
  run('esulove_login', { headers: { 'set-cookie': 'S=1' }, body: '<input name="login_password">' }).kind, 'stop');
// ★ 見分けがつかないときは止めない（画面が少し変わっただけで全部止めない）
{
  const r = run('esulove_login', { headers: { 'set-cookie': 'S=1' }, body: '<html>なにか</html>' });
  eq('★ 見分けがつかなくても止めない', r.kind, 'next');
  eq('★ そのことを note に書く', /確証は次の段で/.test(r.note), true);
}
{
  const r = run('esulove_login', { headers: { 'set-cookie': 'S=1' }, body: '<a href="/admin/logout">x</a>' });
  eq('入れたら次の段を積む', r.kind, 'next');
  eq('次は一覧の読み取り', r.next.purpose, 'esulove_therapists');
  eq('次はGET', r.next.method, 'GET');
  eq('次の宛先', r.next.url, 'https://eslove.jp/admin/shop/therapist');
  eq('Cookie を引き継ぐ', r.next.context.cookie, 'S=1');
  // ★ 読むだけなので body は空
  eq('★ 読むだけ（body は空）', r.next.body, '');
  // ★ ログインの段では監査ログを書かない（まだ成否が分からない・駅ちかと同じ作法）
  eq('★ ログインの段では監査ログを書かない', r.audits.length, 0);
}

// ── 一覧の段 ──
{
  const body = '<html>' + cell('696449', 'さら') + cell('696450', 'るい') + '</html>';
  const r = run('esulove_therapists', { body, context: ctx({ cookie: 'S=1' }) });
  eq('読めたら esulove_roster', r.kind, 'esulove_roster');
  eq('人数ぶん返る', r.rows.length, 2);
  eq('castId と名前', r.rows.map(x => [x.castId, x.name]), [['696449', 'さら'], ['696450', 'るい']]);
  // ★★ 次を積まない＝エステラブへ何も飛ばない
  eq('★ 次を積まない', r.next, undefined);
  eq('監査ログは ok', r.audits[0].outcome, 'ok');
  // ★ 名前を監査ログに入れない（件数だけ）
  eq('★ 監査ログに名前を入れない', /さら|るい/.test(JSON.stringify(r.audits[0])), false);
  eq('件数は入れる', r.audits[0].detail.count, 2);
}
{
  // ★★★ 同名が2人（㉟ の形）。★ まとめずに返し、監査ログでも件数を言う
  const body = '<html>' + cell('1', 'てすら') + cell('2', 'てすら') + '</html>';
  const r = run('esulove_therapists', { body });
  eq('同名でも2人として返す', r.rows.length, 2);
  eq('★ 同名の組数を監査ログに出す', r.audits[0].detail.duplicates, 1);
  eq('★ note にも出す', /同名 1組/.test(r.note), true);
}

// ── ★★★ 「読めなかった」を「0人」と言わない ──
{
  const r = run('esulove_therapists', { body: '<html><body>ログインしてください</body></html>' });
  eq('★ 読めなければ止める（0人と言わない）', r.kind, 'stop');
  eq('理由は parse_empty', r.audits[0].detail.reason, 'parse_empty');
  eq('★ 「0人でした」と書かない', /0人/.test(r.audits[0].summary), false);
}
{
  const r = run('esulove_therapists', { status: 302, headers: { location: 'https://eslove.jp/admin/login' } });
  eq('ログイン画面へ戻されたら止める', r.kind, 'stop');
  eq('★ 認証の問題として記録する', r.audits[0].event, 'login');
  eq('理由は back_to_login', r.audits[0].detail.reason, 'back_to_login');
}
eq('別の場所へ転送されたら止める',
  run('esulove_therapists', { status: 302, headers: { location: 'https://eslove.jp/admin/home' } }).kind, 'stop');
eq('5xx は止める', run('esulove_therapists', { status: 500 }).kind, 'stop');

// ── ★ 駅ちかの段に触っていないことの確認 ──
eq('知らない段はこれまでどおり止まる', run('nanika').kind, 'stop');
// ★ 文脈の版は据え置き（走っている駅ちかのジョブを止めない）
eq('★ フロー文脈の版は 2 のまま', f.RELAY_FLOW_VERSION, 2);
eq('版が違えば止まる（既存の守り）',
  f.advanceFlow({ purpose: 'esulove_login', status: 200, headers: {}, body: '', context: ctx({ v: 99 }) }).kind, 'stop');

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
