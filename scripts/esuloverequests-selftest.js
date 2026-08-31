// エステラブへ投げる要求の組み立て（src/lib/esuloveRequests.ts）の自己点検（第77便）。
//
// ★★★ なぜ要るか
//   ここで組んだ要求が、そのまま店舗のアカウントで実行される。
//   ★ 宛先を1文字間違えれば、別のフォームへ投げて【静かに何も起きない】（駅ちか §17-2 で一度起きた形）。
//   ★ 逆に、余計な項目を混ぜれば、店舗が入れていない値を書き込む。
//
//   使い方:  npm run check:esuloverequests

const r = require(require('path').join(__dirname, '..', '_tmpcheck', 'esuloveRequests.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const throws = (name, fn) => {
  try { fn(); console.log('NG ' + name + '\n   例外にならなかった'); fail++; }
  catch { console.log('ok ' + name); }
};

// ── ログイン ──
{
  const q = r.buildEsuloveLoginRequest({ loginId: 'abc', password: 'p@ss w/d' });
  eq('宛先', q.url, 'https://eslove.jp/admin/login');
  eq('POST', q.method, 'POST');
  eq('項目は2つだけ', q.body, 'login_id=abc&login_password=p%40ss%20w%2Fd');
  // ★★ savelogin は送らない（§287）。既定でチェックが付いていても、こちらからは付けない
  eq('★ savelogin を送らない', /savelogin/.test(q.body), false);
  eq('origin を付ける', q.headers.origin, 'https://eslove.jp');
  eq('フォーム送信の content-type', q.headers['content-type'], 'application/x-www-form-urlencoded');
  // ★ 空では組ませない（空のIDでログインを試させない）
  throws('IDが空なら例外', () => r.buildEsuloveLoginRequest({ loginId: '', password: 'x' }));
  throws('パスワードが空なら例外', () => r.buildEsuloveLoginRequest({ loginId: 'x', password: '' }));
}

// ── 読むだけの要求 ──
{
  const q = r.buildEsuloveTherapistListRequest('a=1; b=2');
  eq('一覧はGET', q.method, 'GET');
  eq('一覧の宛先', q.url, 'https://eslove.jp/admin/shop/therapist');
  eq('Cookie を持つ', q.headers.cookie, 'a=1; b=2');
  eq('★ 読むだけなので body は無い', q.body, undefined);
}
{
  eq('出勤の読み取りに日を付ける', r.buildEsuloveWorkReadRequest('c=1', '20260831').url,
    'https://eslove.jp/admin/shop/therapist_schedule/daily?day=20260831');
  // ★ 形が違う日付は付けない（推測でURLを作らない）
  eq('形が違う日は付けない', r.buildEsuloveWorkReadRequest('c=1', '2026-08-31').url,
    'https://eslove.jp/admin/shop/therapist_schedule/daily');
  eq('日を省いてもよい', r.buildEsuloveWorkReadRequest('c=1').url,
    'https://eslove.jp/admin/shop/therapist_schedule/daily');
}

// ── ★★ 出勤の保存（唯一、相手を書き換える要求）──
{
  const body = {
    'TherapistSchedules[0][id]': '',
    'TherapistSchedules[0][shop_id]': '37865',
    'TherapistSchedules[0][therapist_id]': '696450',
    'TherapistSchedules[0][day]': '20260831',
    'TherapistSchedules[0][start_time]': '2000',
    'TherapistSchedules[0][end_time]': '2700',
  };
  const q = r.buildEsuloveWorkSaveRequest('c=1', body);
  eq('保存の宛先', q.url, 'https://eslove.jp/admin/shop/therapist_schedule/daily/edit');
  eq('★ 一覧のURLへ投げない（静かに何も起きないため）',
    q.url === 'https://eslove.jp/admin/shop/therapist_schedule/daily', false);
  eq('POST', q.method, 'POST');
  eq('角括弧はエスケープされる', /TherapistSchedules%5B0%5D%5Btherapist_id%5D=696450/.test(q.body), true);
  eq('項目数ぶん & でつながる', q.body.split('&').length, 6);
  // ★★ 空のまま投げない（「全部消す」の意味になりかねない）
  throws('★ 0件なら例外', () => r.buildEsuloveWorkSaveRequest('c=1', {}));
}

// ── セラピストの新規登録（★ absent のときだけ呼ぶ）──
{
  const q = r.buildEsuloveTherapistCreateRequest('c=1', { shopId: '37865', name: ' さら ' });
  eq('登録の宛先', q.url, 'https://eslove.jp/admin/shop/therapist/edit');
  eq('前後の空白は落とす', /name=%E3%81%95%E3%82%89/.test(q.body), true);
  // ★★ 空で送れる項目を推測で埋めない（入店日は設定後に変更できない）
  eq('★ 送るのは3項目だけ', q.body.split('&').length, 3);
  eq('★ 入店日を送らない', /join_date/.test(q.body), false);
  eq('★ 年齢を送らない', /age/.test(q.body), false);
  eq('既定は表示', /status=1/.test(q.body), true);
  eq('非表示も選べる',
    /status=0/.test(r.buildEsuloveTherapistCreateRequest('c=1', { shopId: '1', name: 'x', visible: false }).body), true);
  throws('名前が空なら例外', () => r.buildEsuloveTherapistCreateRequest('c=1', { shopId: '1', name: '  ' }));
  throws('店舗IDが空なら例外', () => r.buildEsuloveTherapistCreateRequest('c=1', { shopId: '', name: 'x' }));
}

// ── ★ 削除の要求は、そもそも作れない（GETリンクなので置かない・§249）──
eq('★ 削除を組み立てる関数は無い',
  Object.keys(r).some(k => /delete|remove|destroy/i.test(k)), false);

// ── ログインできたかの見分け（★ 決めつけない）──
eq('ログイン画面が返ったら失敗',
  r.judgeEsuloveLogin('<form><input name="login_password" type="password"></form>'), { ok: false });
eq('管理画面が返ったら成功',
  r.judgeEsuloveLogin('<a href="/admin/logout">ログアウト</a>'), { ok: true });
// ★ 見分けがつかないときは null。「たぶん成功」で先へ進めない
eq('両方あれば分からない',
  r.judgeEsuloveLogin('<input name="login_password"><a href="/admin/logout">x</a>'), null);
eq('どちらも無ければ分からない', r.judgeEsuloveLogin('<html><body>メンテナンス中</body></html>'), null);
eq('空は分からない', r.judgeEsuloveLogin(''), null);

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
