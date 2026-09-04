// 写メ日記の段が【本当に呼ばれるか】の自己点検（第133便・2026-09-04）。
//
// ★★★ なぜ要るか（2026-09-04 に見つけた）
//   第130便で6つの段（一覧→token→代理ログイン→投稿ページ→投稿→end_proxy）を書いた。
//   ★ 自己点検も通っていた。★ しかし **advanceFlow に1つも繋がっていなかった。**
//   ★★ さらに、ログインの次に一覧を読みに行く道も無かった。
//   → **書いただけで、一度も呼ばれない段が5日間そこにあった。**
//   ★★★ 「関数が正しい」と「その関数が呼ばれる」は別。★ ここは【繋がっているか】だけを見る。
//
//   使い方:  npm run check:esutamadiarywire

const path = require('path');
const F = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));
const E = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const ctx = (intent) => ({ v: F.RELAY_FLOW_VERSION, flowId: 'f1', intent, cookie: 'PHPSESSID=x', startedAt: '2026-09-04T00:00:00Z' });
const LOGIN_OK = JSON.stringify(['REDIRECT_OK', '/admin/']);
const H = { 'set-cookie': 'PHPSESSID=y; Path=/' };

console.log('── 1. ★★★ ログインの次に、日記の道へ分かれる ──');
const d = E.afterEsutamaLogin({ status: 200, headers: H, body: LOGIN_OK }, ctx('diary_dryrun'));
eq('★★★ 下見はログインの次に魂セラピスト一覧へ行く', d.next && d.next.purpose, 'esutama_therapist_list');
const p = E.afterEsutamaLogin({ status: 200, headers: H, body: LOGIN_OK }, ctx('diary_push'));
eq('★★★ 実弾も同じ道を通る', p.next && p.next.purpose, 'esutama_therapist_list');
// ★ 出勤の用事は今までどおり名簿へ（★ 道を分けても既存を壊していない）
// ★★★ 第137便: 自動の周（diary_auto）も同じ道を通ること
const a = E.afterEsutamaLogin({ status: 200, headers: H, body: LOGIN_OK }, ctx('diary_auto'));
eq('★★★ 自動の周も魂セラピスト一覧へ行く', a.next && a.next.purpose, 'esutama_therapist_list');
const w = E.afterEsutamaLogin({ status: 200, headers: H, body: LOGIN_OK }, ctx('work_dryrun'));
eq('★★ 出勤の用事は名簿のまま', w.next && w.next.purpose, 'esutama_roster');
// ★ 日記の用事では出勤名簿を読みに行かない（用の無いページを開かない）
eq('★★ 日記の道では名簿を読まない', d.next.purpose === 'esutama_roster', false);

console.log('\n── 2. ★★★ 6つの段が advanceFlow に繋がっている ──');
const LIST = '<button class="btn btn-proxy-login" data-cast-id="757481" data-cast-name="さら" data-cast-state="active"></button>'
  + '<input type="hidden" name="ctk" value="abcdefghij0123456789">';
const r1 = F.advanceFlow({ purpose: 'esutama_therapist_list', status: 200, headers: {}, body: LIST, context: ctx('diary_dryrun') });
// ★★★ 繋がっていなければ「知らない段」で stop になる。★ ここが今回の見張り
eq('★★★ 一覧の段が呼ばれる', r1.kind, 'esutama_therapists');
eq('★ 代理ログインできる人を読めている', r1.rows.length, 1);
eq('★ ctk も読めている', typeof r1.ctk, 'string');

for (const purpose of ['esutama_diary_token', 'esutama_diary_proxy', 'esutama_diary_page', 'esutama_diary_post', 'esutama_diary_end']) {
  const r = F.advanceFlow({ purpose, status: 200, headers: {}, body: '', context: ctx('diary_push') });
  // ★ 中身の成否はここでは問わない。★ 「知らない段」で落ちないことだけを見る
  eq('★★★ ' + purpose + ' が呼ばれる（知らない段ではない）',
     String(r.note || '').includes('知らない段'), false);
}
// ★ 逆に、本当に知らない段は「知らない段」で止まる（★ 見張りが働いていることの確認）
const unknown = F.advanceFlow({ purpose: 'esutama_diary_nothing', status: 200, headers: {}, body: '', context: ctx('diary_push') });
eq('★★ 知らない段はちゃんと止まる', String(unknown.note).includes('知らない段'), true);

console.log('\n── 3. ★★★ ログイン画面へ戻されたのを「0名」と読まない ──');
// ★★ セッションが切れると 302 で /login へ返る。★ 中身は空
const back = F.advanceFlow({
  purpose: 'esutama_therapist_list', status: 302,
  headers: { location: 'https://estama.jp/admin/login/' }, body: '', context: ctx('diary_dryrun'),
});
eq('★★★ 戻されたら止まる（0名にしない）', back.kind, 'stop');
eq('★★ 「0名ではありません」と書いてある', String(back.note).includes('0名ではありません'), true);
eq('★ 記録は failed', back.audits[0].outcome, 'failed');

console.log('\n── 4. ★ 一覧が0名でも止めない（故障ではない）──');
const empty = F.advanceFlow({ purpose: 'esutama_therapist_list', status: 200, headers: {}, body: '<div></div>', context: ctx('diary_dryrun') });
// ★★ 「まだ誰も魂セラピストを始めていない」は正常。★ stop にしない
eq('★★ 0名は正常に読めた扱い', empty.kind, 'esutama_therapists');
eq('★ 0名', empty.rows.length, 0);
eq('★ ctk が無ければ null（空文字にしない）', empty.ctk, null);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
