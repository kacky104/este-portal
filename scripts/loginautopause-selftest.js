// 「ID・パスワードが違うときは、ログインを自動で一時停止する」（src/lib/loginAutoPause.ts）の自己点検（第1378便・2026-10-10）。
//
//   使い方:  npm run check:loginautopause
//
// ★ この判定は、相手サイトに間違ったログインを打ち続けないと確かめられない。ここで記録の形を作って確かめる。

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const m = require(path.join(root, '_tmpcheck', 'loginAutoPause.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

const EKI_REJECT = '駅ちかにログインできませんでした（ログイン画面へ戻されました）。店舗ID・ログインID・パスワードをご確認ください';
const rejected = () => ({ event: 'login', outcome: 'failed', summary: EKI_REJECT, detail: { httpStatus: 302, reason: 'back_to_login' } });
const session = () => ({ event: 'login', outcome: 'failed', summary: '駅ちかのセッションが切れました（登録は行っていません）', detail: { httpStatus: 302, reason: 'back_to_login' } });
const siteDown = () => ({ event: 'login', outcome: 'failed', summary: '駅ちかにログインできませんでした（セッションが発行されませんでした）', detail: { reason: 'no_cookie' } });
const ok = () => ({ event: 'login', outcome: 'ok', summary: '駅ちかにログインしました', detail: {} });
const cred = (event, detail) => ({ event, outcome: event === 'credential_disabled' && detail ? 'stopped' : 'ok', summary: '', detail: detail || {} });

console.log('── 1. 失敗の種類 ──');
eq('★★★ ログイン直後にログイン画面へ戻された＝ID・パスワードが違う', m.loginFailKind(rejected()), 'rejected');
eq('★★★ 流れの途中のセッション切れは、同じ reason でも数えない', m.loginFailKind(session()), 'session');
eq('★★ 相手サイトの不調（セッションが発行されない）は数えない', m.loginFailKind(siteDown()), 'other');
eq('★ エステ魂の「入力を断られた」も ID・パスワード違い',
   m.loginFailKind({ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした。メールアドレス・パスワードをご確認ください', detail: { reason: 'rejected' } }), 'rejected');
eq('★ 画面の形が変わった・応答が変、は数えない',
   [m.loginFailKind({ event: 'login', outcome: 'failed', summary: 'エステ魂のログイン画面の形が変わったため、ログインできませんでした', detail: { reason: 'csrf_missing' } }),
    m.loginFailKind({ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした（応答 500）', detail: { reason: 'http_error' } })],
   ['other', 'other']);
eq('★ 文が空（古い記録）は数えない', m.loginFailKind({ event: 'login', outcome: 'failed', summary: '', detail: { reason: 'back_to_login' } }), 'other');

console.log('── 2. ★★★ ソースにある全部のログイン失敗が、どれかに分かれること ──');
{
  // ★ 各フローの「ログインに失敗した」記録（summary と reason）を、ソースから拾って分類する。
  //   言い回しを変えて「ID・パスワードが違う」が数えられなくなったら、ここで落ちる。
  const files = [...fs.readdirSync(path.join(root, 'src', 'lib')).filter((f) => f.endsWith('.ts')).map((f) => path.join(root, 'src', 'lib', f))];
  const found = [];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    const re = /event:\s*'login',\s*outcome:\s*'failed',/g;
    let mt;
    while ((mt = re.exec(s))) {
      const seg = s.slice(mt.index, mt.index + 800);
      const sm = /summary:\s*((?:\s*'[^']*'\s*\+?)+)/.exec(seg);
      const rs = /reason:\s*'([a-z_]+)'/.exec(seg);
      const summary = sm ? sm[1].replace(/'\s*\+\s*'/g, '').replace(/^\s*'|'\s*\+?\s*$/g, '').replace(/\s+/g, ' ') : '';
      found.push({ file: path.basename(f), summary, reason: rs ? rs[1] : '' });
    }
  }
  const kindOf = (x) => m.loginFailKind({ event: 'login', outcome: 'failed', summary: x.summary, detail: { reason: x.reason } });
  eq('★ ログイン失敗の記録がソースに見つかっている（拾えていないと、この点検が空回りする）', found.length >= 30, true);
  const sessions = found.filter((x) => x.summary.includes('セッションが切れました'));
  eq('★★★ 「セッションが切れました」は全部 session（ID・パスワード違いに数えない）', sessions.filter((x) => kindOf(x) !== 'session').map((x) => x.file + ':' + x.summary), []);
  eq('★ セッション切れの記録が拾えている', sessions.length >= 8, true);
  const wrong = found.filter((x) => /ログイン画面(へ戻されました|が返りました)/.test(x.summary));
  eq('★★★ 「ログイン画面へ戻されました／が返りました」は全部 rejected', wrong.filter((x) => kindOf(x) !== 'rejected').map((x) => x.file + ':' + x.reason + ':' + x.summary), []);
  eq('★ ID・パスワード違いの記録が拾えている', wrong.length >= 15, true);
  const down = found.filter((x) => ['http_error', 'no_cookie', 'csrf_missing', 'unexpected_response', 'credential_read_failed'].includes(x.reason));
  eq('★★★ 相手サイトの不調（応答が無い・形が変わった など）は1つも rejected にならない', down.filter((x) => kindOf(x) === 'rejected').map((x) => x.file + ':' + x.reason + ':' + x.summary), []);
  eq('★ 相手サイトの不調の記録が拾えている', down.length >= 6, true);
}

console.log('── 3. 続いている回数 ──');
eq('★★★ オイルクエスト様・駅ちか枠2（10/10）: 登録のあと5回とも戻された', m.loginRejectStreak([rejected(), rejected(), rejected(), rejected(), rejected(), cred('credential_saved')]), 5);
eq('★ 通った回があれば、そこまで', m.loginRejectStreak([rejected(), rejected(), ok(), rejected(), rejected()]), 2);
eq('★★ 途中のセッション切れ＝その流れのログインは通っていた。そこまで', m.loginRejectStreak([rejected(), rejected(), session(), rejected()]), 2);
eq('★★ 相手サイトの不調は、数えないが切りもしない', m.loginRejectStreak([rejected(), siteDown(), rejected(), siteDown(), rejected()]), 3);
eq('★★ 相手サイトの不調だけなら 0', m.loginRejectStreak([siteDown(), siteDown(), siteDown(), siteDown()]), 0);
eq('★ 保存し直したら数え直し', m.loginRejectStreak([rejected(), cred('credential_saved'), rejected(), rejected(), rejected()]), 1);
eq('★ 再開したら数え直し（古い失敗ですぐ止め直さない）', m.loginRejectStreak([cred('credential_enabled'), rejected(), rejected(), rejected()]), 0);
eq('★ 止めたあとの記録より前は数えない', m.loginRejectStreak([cred('credential_disabled'), rejected(), rejected(), rejected()]), 0);

console.log('── 4. 止めるかどうか ──');
const NOW = Date.UTC(2026, 9, 10, 0, 0, 0);
const hoursAgo = (h) => NOW - h * 3600000;
eq('★★★ 決まりは 5回・24時間（はじめ3回と決めたが、3回は10〜20分でたまるので5回にした）', [m.LOGIN_REJECT_PAUSE_STREAK, m.LOGIN_REJECT_PAUSE_HOURS_IF_WORKED], [5, 24]);
eq('★★★ 登録してから1度も通っていない枠は、5回で止める', m.decideLoginAutoPause({ streak: 5, everWorked: false, firstFailAtMs: null, nowMs: NOW }), { pause: true, rule: 'new' });
eq('★★ 4回では止めない', m.decideLoginAutoPause({ streak: 4, everWorked: false, firstFailAtMs: null, nowMs: NOW }), { pause: false, rule: null });
eq('★★★ 前は通っていた枠は、回数では止めない（相手サイトの不調で全店を止めないため）',
   m.decideLoginAutoPause({ streak: 8, everWorked: true, firstFailAtMs: hoursAgo(1), nowMs: NOW }), { pause: false, rule: null });
eq('★★ 23時間59分でも止めない', m.decideLoginAutoPause({ streak: 8, everWorked: true, firstFailAtMs: hoursAgo(24) + 60000, nowMs: NOW }), { pause: false, rule: null });
eq('★★★ 24時間ちょうどで止める', m.decideLoginAutoPause({ streak: 5, everWorked: true, firstFailAtMs: hoursAgo(24), nowMs: NOW }), { pause: true, rule: 'long' });
eq('★ 通っていた枠で、いつから失敗しているか分からなければ止めない', m.decideLoginAutoPause({ streak: 8, everWorked: true, firstFailAtMs: null, nowMs: NOW }), { pause: false, rule: null });
eq('★ 24時間たっていても、いま5回続いていなければ止めない', m.decideLoginAutoPause({ streak: 1, everWorked: true, firstFailAtMs: hoursAgo(48), nowMs: NOW }), { pause: false, rule: null });

console.log('── 5. 自動で止めた枠か（店舗様が自分で止めた枠と分ける）──');
const mark = { reason: m.LOGIN_REJECT_REASON, rule: 'new', streak: 5 };
eq('★★★ いちばん新しい記録が、印の付いた一時停止', m.isPausedByLoginReject([cred('credential_disabled', mark), cred('credential_saved')]), true);
eq('★★★ 店舗様が自分で止めた（印なし）', m.isPausedByLoginReject([cred('credential_disabled'), cred('credential_saved')]), false);
eq('★★ 自動で止めたあと、再開して自分で止め直した', m.isPausedByLoginReject([cred('credential_disabled'), cred('credential_enabled'), cred('credential_disabled', mark)]), false);
eq('★ 保存し直した（＝再開している）', m.isPausedByLoginReject([cred('credential_saved'), cred('credential_disabled', mark)]), false);
eq('★ 記録が無ければ false', m.isPausedByLoginReject([]), false);

console.log('── 6. 文 ──');
eq('★★★ 帯は、状態と、することを1つ',
   m.loginRejectNoticeText(['駅ちか（枠2）']),
   { title: 'ID・パスワードが違っています', body: '駅ちか（枠2）にログインできなかったため、ログインを止めています。正しいID・パスワードを入れ直してください。' });
eq('★ 2つあれば並べる（同じ名前は1つに）', m.loginRejectNoticeText(['駅ちか', 'エステ魂', '駅ちか']).body.startsWith('駅ちか・エステ魂に'), true);
eq('★ 記録に残す1行（入れ間違い）', m.loginRejectPauseSummary('駅ちか（枠2）', 'new'), '駅ちか（枠2）のID・パスワードが違うため、ログインを止めました（5回続けてログインできませんでした）。正しいID・パスワードを登録し直してください');
eq('★ 記録に残す1行（長く続いた）', m.loginRejectPauseSummary('駅ちか', 'long').includes('24時間以上ログインできませんでした'), true);

console.log('── 7. つながり（ソースの形）──');
{
  const relay = fs.readFileSync(path.join(root, 'src', 'app', 'lib', 'media', 'relayFlow.ts'), 'utf8');
  const a = relay.indexOf('decideLoginAutoPause({');
  const b = relay.indexOf('const bo = loginBackoff({');
  eq('★★★ 一時停止の判断は、60分の見送りより【前】にある（見送りで帰ると、いつまでも止まらない）', a > 0 && b > a, true);
  eq('★★ 自動の周の中だけで判断する（人が押した操作では止めない）', relay.lastIndexOf('if (isAutomaticActor(params.actor)) {', a) > 0, true);
  eq('★★ 動いている鍵だけを倒す（2つの周が同時に来ても、記録は1回）', /\.update\(\{ is_enabled: false[^}]*\}\)[\s\S]{0,200}\.eq\('is_enabled', true\)/.test(relay), true);
  eq('★★ 止めた印を記録に残す', relay.includes("detail: { reason: LOGIN_REJECT_REASON, rule: pauseDecision.rule, streak: rejectStreak }"), true);
  const cr = fs.readFileSync(path.join(root, 'src', 'app', 'actions', 'mediaCredentials.ts'), 'utf8');
  eq('★★★ ID・パスワードを保存すると再開する（保存は is_enabled: true で書く）', (cr.match(/is_enabled: true,/g) || []).length >= 2, true);
  const watch = fs.readFileSync(path.join(root, 'src', 'app', 'lib', 'media', 'stallOverview.ts'), 'utf8');
  eq('★★★ 運営の見張りは、自動で止めた枠を同じ名前（problem・login）で残す（「全部直りました」を出さない）',
     /const b4 = \{ watch: 'problem', salonId, provider: p\.provider, slot: p\.slot, reason: 'login' \} as const;/.test(watch), true);
  eq('★★ 読めなかった回は errors に入れる（直ったと数えない）', watch.includes('loadLoginRejectPaused(svc, salonId, list, (m) => errors.push(m))'), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : `\n★★★ NG ${fail} 件`);
process.exit(fail === 0 ? 0 : 1);
