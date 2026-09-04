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

console.log('\n── 5. ★★ 投稿の応答から【合図】だけ取り出す（第133便）──');
// ★★★ ここでは成否を決めない。★ 相手が成功時に何を返すかを、まだ実物で見ていない
const postOkBody = '<html><body>投稿しました</body></html>';
const postBackBody = '<form><input type="hidden" name="ctk" value="abc"><span>本文は必須です</span></form>';
eq('★ 素直な応答はフォームが無い', T.esutamaDiaryPostSignals(postOkBody).formStillThere, false);
eq('★★ 差し戻しはフォームが戻ってくる', T.esutamaDiaryPostSignals(postBackBody).formStillThere, true);
eq('★★ 差し戻しらしい語を拾う', T.esutamaDiaryPostSignals(postBackBody).hasErrorWord, true);
eq('★ 素直な応答には差し戻しの語が無い', T.esutamaDiaryPostSignals(postOkBody).hasErrorWord, false);
eq('★ 長さも合図（空も残す）', T.esutamaDiaryPostSignals('').length, 0);
// ★ null / undefined でも落ちない（★ 応答が無いことも合図）
eq('★ 空でも落ちない', T.esutamaDiaryPostSignals(undefined).formStillThere, false);

console.log('\n── 6. ★★★ 誰として入っているかを読み取る（第134便）──');
// ★★ 2026-09-04 の1通目がここで止まった。★ 「入れなかった」だけでは理由が分からなかった
eq('★ 名前を取り出す',
   T.parseProxyLoggedInName('<div>【さら】さんにログイン中です</div>'), 'さら');
// ★★★ 表記が違う人に入っていたことも分かる（サラ／さら）
eq('★★★ 頼んだ人と違えば、その名前がそのまま返る',
   T.parseProxyLoggedInName('<div>【さくら】さんにログイン中です</div>'), 'さくら');
// ★ 表示そのものが無い＝入れていない。★ 「別人」とは別の話
eq('★★ 表示が無ければ null（空文字にしない）',
   T.parseProxyLoggedInName('<div>ログイン</div>'), null);
eq('★ 空でも落ちない', T.parseProxyLoggedInName(''), null);
eq('★ null でも落ちない', T.parseProxyLoggedInName(undefined), null);

console.log('\n── 7. ★★★ 投稿の結果を判定する（第136便・実測1件）──');
const sig = T.esutamaDiaryPostSignals;
const J = (st, body) => T.judgeEsutamaDiaryPost(st, sig(body || ''));
// ★★★ 2026-09-04 16:42、1通目が実際に載ったときの応答: 303・本文0
eq('★★★ 303＋本文0 は送れた（実測）', J(303, '').verdict, 'sent');
eq('★ 302 でも送れた扱い', J(302, '').verdict, 'sent');
// ★★★ ここが今回の穴。★ 200＋フォームが戻る＝差し戻し。★ 以前は「送れた」と数えていた
eq('★★★ 200＋投稿フォームが戻ったら送れていない',
   J(200, '<form><input name="ctk" value="x"><span>本文は必須です</span></form>').verdict, 'rejected');
eq('★★ 差し戻しの理由が読める',
   J(200, '<input name="ctk" value="x">').reason.includes('投稿フォームが戻ってきました'), true);
// ★ 通信そのものの失敗
eq('★ 500 は送れていない', J(500, '').verdict, 'rejected');
eq('★ 403 は送れていない', J(403, '').verdict, 'rejected');
// ★★★ 見たことのない形は【決めつけない】。★ 印は残す側（消せない相手なので）
eq('★★★ 200でフォームも無い形は unknown', J(200, '<div>ありがとうございました</div>').verdict, 'unknown');
eq('★★ 差し戻しらしい語だけあるのも unknown',
   J(200, '<div>エラーが起きました</div>').verdict, 'unknown');
eq('★ unknown の理由にも中身が入る', J(200, '<div>x</div>').reason.includes('見たことのない'), true);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
