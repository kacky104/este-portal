// 魂セラピスト一覧の読み取り（src/lib/esutamaTherapistParse.ts）の自己点検（第129便・2026-09-04）。
//
// ★★★ ここで守りたいのは3つ。★ どれも「別の人に入らない」ための守り。
//   ① 代理ログインできる人だけを拾う（ボタンが無い人＝始めていない人を拾わない）
//   ② 知らない状態（active 以外）では代理ログインしない
//   ③ 入ったあと【名前で確かめる】（人違いは実際に起きた）
//
//   使い方:  npm run check:esutamatherapist

const path = require('path');
const T = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaTherapistParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ★ 実物と同じ形（2026-09-04・ラビリンス様の画面で確認）
const BTN = (id, name, state) =>
  `<button class="btn btn-default btn-proxy-login" data-cast-id="${id}" data-cast-name="${name}" data-cast-state="${state}">本人の代わりにログイン</button>`;

console.log('── 1. ★★★ 代理ログインできる人だけを拾う ──');
const html = `
<tr><td>うみ</td><td>開始前</td><td><span class="btn disabled">本人の代わりにログイン</span>初回設定完了後にログインできます</td></tr>
<tr><td>みお</td><td>利用中</td><td>${BTN('930445', 'みお', 'active')}</td></tr>
<tr><td>さら</td><td>利用中</td><td>${BTN('757481', 'さら', 'active')}</td></tr>
`;
eq('★★★ ボタンがある人だけ拾う（開始前は入らない）',
   T.parseEsutamaProxyTherapists(html).map((x) => [x.castId, x.name]),
   [['930445', 'みお'], ['757481', 'さら']]);
// ★★★ 知らない状態では代理ログインしない（相手の仕様が変わった合図）
eq('★★★ active 以外は落とす',
   T.parseEsutamaProxyTherapists(BTN('1', 'あ', 'pending') + BTN('2', 'い', 'active')).map((x) => x.castId),
   ['2']);
eq('★★ 番号の形でないものは使わない',
   T.parseEsutamaProxyTherapists(BTN('abc', 'あ', 'active')).length, 0);
eq('★ 同じ番号は1回だけ',
   T.parseEsutamaProxyTherapists(BTN('5', 'あ', 'active') + BTN('5', 'あ', 'active')).length, 1);
eq('★ ボタンが無ければ0人', T.parseEsutamaProxyTherapists('<div>なにもない</div>'), []);
eq('★ 空でも落ちない', T.parseEsutamaProxyTherapists(''), []);
// ★ 属性の並び順に依存しない
eq('★★ 属性の順が違っても読める',
   T.parseEsutamaProxyTherapists('<button data-cast-state="active" data-cast-name="れみ" class="btn-proxy-login" data-cast-id="99">x</button>')
     .map((x) => [x.castId, x.name]), [['99', 'れみ']]);
eq('★ 名前の実体参照は戻す',
   T.parseEsutamaProxyTherapists(BTN('7', 'A&amp;B', 'active'))[0].name, 'A&B');

console.log('\n── 2. ★★ ctk ──');
eq('★ hidden の ctk を拾う',
   T.parseEsutamaCtk('<input type="hidden" name="ctk" value="0123456789abcdef0123456789abcdef">'),
   '0123456789abcdef0123456789abcdef');
eq('★★ 属性の順が違っても拾う',
   T.parseEsutamaCtk('<input value="abcdef0123456789abcdef0123456789" name="ctk" type="hidden">'),
   'abcdef0123456789abcdef0123456789');
// ★★★ 見つからなければ null。★ 空文字にしない（「無い」と「空」を混ぜない）
eq('★★★ 無ければ null', T.parseEsutamaCtk('<div>x</div>'), null);
eq('★★ 短すぎる値は採らない', T.parseEsutamaCtk('<input name="ctk" value="abc">'), null);
eq('★ 別の名前の hidden は拾わない',
   T.parseEsutamaCtk('<input name="token" value="0123456789abcdef0123456789abcdef">'), null);

console.log('\n── 3. ★★★ 代理ログイン用トークンの応答 ──');
// ★ 実物の形（2026-09-04 実測）
const okBody = JSON.stringify({ success: true, message: '店舗代理ログイン用URLを発行しました', login_token: 'a'.repeat(64), login_url: 'https://estama.jp/...', expires_at: '2026-09-04 12:49:31' });
eq('★★ 成功なら token と期限が読める',
   (() => { const r = T.parseEsutamaShopToken(okBody); return [r.ok, r.token.length, r.expiresAt]; })(),
   [true, 64, '2026-09-04 12:49:31']);
// ★★★ success が false なら理由をそのまま返す。★ 握りつぶさない
eq('★★★ 断られたら理由を返す',
   T.parseEsutamaShopToken(JSON.stringify({ success: false, message: '利用中ではありません' })),
   { ok: false, error: '利用中ではありません' });
eq('★ message が無くても理由を作る',
   T.parseEsutamaShopToken(JSON.stringify({ success: false })).error, '発行を断られました');
// ★★ 変な値でURLを組み立てない
eq('★★★ トークンの形が違えば断る',
   T.parseEsutamaShopToken(JSON.stringify({ success: true, login_token: 'short' })).ok, false);
eq('★ JSON でなければ理由を返す', T.parseEsutamaShopToken('<html>').ok, false);
eq('★ 空なら理由を返す', T.parseEsutamaShopToken(''), { ok: false, error: '応答が空でした' });

console.log('\n── 4. ★★★ 別の人に入っていないことを確かめる ──');
// ★★★ 2026-09-04: 探す道具が「さら」を探して【さくら】を返した。★ 人違いは実際に起きる
eq('★★★ 名前が一致すれば true',
   T.isProxyLoggedInAs('<div>【さら】さんにログイン中です</div>', 'さら'), true);
eq('★★★ 別の人なら false（さくら ≠ さら）',
   T.isProxyLoggedInAs('<div>【さくら】さんにログイン中です</div>', 'さら'), false);
eq('★★ 印が無ければ false', T.isProxyLoggedInAs('<div>ログイン</div>', 'さら'), false);
eq('★ 名前が空なら false', T.isProxyLoggedInAs('<div>【さら】さんにログイン中です</div>', ''), false);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
