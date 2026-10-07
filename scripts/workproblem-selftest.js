// 「うまくいっていないこと」を画面に出す判断（src/lib/workProblem.ts）と、
// ログイン失敗が続いたときの見送り（src/lib/loginBackoff.ts）の自己点検（第1275便・2026-10-07）。
//
//   使い方:  npm run check:workproblem

const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'workProblem.js'));
const b = require(path.join(__dirname, '..', '_tmpcheck', 'loginBackoff.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
// 新しい順に並べて渡す。時刻は「分」で作る（大きいほど新しい）
const at = (min) => new Date(Date.UTC(2026, 9, 7, 6, 0, 0) + min * 60000).toISOString();
const R = (min, event, outcome, detail) => ({ event, outcome, createdAt: at(min), detail: detail || {} });
const kind = (rows) => { const p = m.workProblemOf(rows); return p ? p.kind : null; };

console.log('── 1. ★★★ ラビリンス様の駅ちか（10/6〜10/7）: 送ったのに入っていない ──');
{
  // 第1270便より後の記録の形: write_work failed ＋ verify_work failed
  const rows = [R(30, 'verify_work', 'failed', { problems: 4 }), R(30, 'write_work', 'failed', { reason: 'verify_mismatch' }), R(29, 'read_work', 'ok'), R(29, 'login', 'ok'), R(0, 'write_work', 'ok')];
  eq('★★★ 読み直して合わなかった → 「反映できていません」', m.workProblemOf(rows), { kind: 'not_reflected', at: at(30) });
  eq('★★★ そのあと通ったら、消える', kind([R(60, 'verify_work', 'ok'), R(60, 'write_work', 'ok'), ...rows]), null);
  eq('★★ そのあと「確かめて同じだった」でも消える（駅ちか・変更0件の確認）', kind([R(60, 'plan_work', 'ok', { changes: 0, targets: 38 }), ...rows]), null);
  eq('★★ 変わるところがある確認（まだ送っていない）では消えない', kind([R(60, 'plan_work', 'ok', { changes: 2, targets: 38 }), ...rows]), 'not_reflected');
}

console.log('\n── 2. うまくいった形 ──');
eq('★ 記録なし', kind([]), null);
eq('★ 反映できた', kind([R(10, 'verify_work', 'ok'), R(10, 'write_work', 'ok'), R(9, 'login', 'ok')]), null);
eq('★★★ エステ魂の「変更はありませんでした」（stopped・saved 0・changed 0）は問題にしない', kind([R(10, 'write_work', 'stopped', { people: 29, saved: 0, changed: 0 })]), null);
eq('★★ 送る前に止めた理由（plan_work stopped）は、ここでは出さない（計画の赤い枠が出している）', kind([R(10, 'plan_work', 'stopped', { blockers: 1 }), R(5, 'write_work', 'failed')]), null);

console.log('\n── 3. うまくいかなかった形 ──');
eq('★★ 保存できなかった（write_work failed）', kind([R(10, 'write_work', 'failed', { reason: 'http_error' })]), 'not_reflected');
eq('★★ 送らずに止めた（内容が新しくなっていた など）', kind([R(10, 'write_work', 'stopped', { reason: 'fingerprint_mismatch' })]), 'not_sent');
eq('★★ 出勤ページを読めなかった', kind([R(10, 'read_work', 'failed', { reason: 'page_broken' })]), 'not_reflected');
eq('★★ 出勤を書く・読み直す段で通信が切れた → 「届いたか確認できませんでした」',
  [kind([R(10, 'relay_expired', 'stopped', { purpose: 'verify_work' })]), kind([R(10, 'relay_gave_up', 'stopped', { purpose: 'write_work', attempts: 3 })]), kind([R(10, 'relay_expired', 'stopped', { purpose: 'esutama_work_save' })])],
  ['unconfirmed', 'unconfirmed', 'unconfirmed']);
eq('★★★ ほかの流れ（写メ日記の取り込み・即ヒメ・ログイン）で切れた行は、出勤の話にしない',
  [kind([R(10, 'relay_expired', 'stopped', { purpose: 'read_diary_list' })]), kind([R(10, 'relay_gave_up', 'stopped', { purpose: 'login' })]), kind([R(10, 'relay_expired', 'stopped', { graceMinutes: 30 })])],
  [null, null, null]);
eq('★★ ほかの流れの打ち切りは飛ばして、その前の出勤の失敗を見る', kind([R(20, 'relay_expired', 'stopped', { purpose: 'sokuhime_set' }), R(10, 'write_work', 'failed')]), 'not_reflected');
eq('★★★ 自動が切られた', m.workProblemOf([R(40, 'link_mode_changed', 'stopped', { mode: 'write', from: 'write_auto', reason: 'auto_gave_up' }), R(30, 'write_work', 'failed')]), { kind: 'auto_off', at: at(40) });
eq('★★★ 店舗様が自動を入れ直したら、それより前の失敗は出さない（仕切り直し）', kind([R(50, 'link_mode_changed', 'ok', { mode: 'write_auto' }), R(40, 'link_mode_changed', 'stopped', { reason: 'auto_gave_up' }), R(30, 'write_work', 'failed')]), null);

console.log('\n── 4. ★★★ ログイン ──');
{
  const L = (min, o) => R(min, 'login', o);
  eq('★★ 1回きりの失敗では赤くしない', kind([L(10, 'failed'), L(5, 'ok')]), null);
  eq('★★★ 続けて2回失敗 → 「ログインできていません」（いちばん新しい失敗の時刻）', m.workProblemOf([L(20, 'failed'), L(10, 'failed'), L(5, 'ok')]), { kind: 'login', at: at(20) });
  eq('★★ 間に通った回があれば数えない', kind([L(20, 'failed'), L(15, 'ok'), L(10, 'failed')]), null);
  eq('★★★ 失敗のあとに通った → 消える', kind([L(30, 'ok'), L(20, 'failed'), L(10, 'failed')]), null);
  eq('★★★ ID・パスワードを保存し直した → 消える（数え直し）', kind([R(25, 'credential_saved', 'ok'), L(20, 'failed'), L(10, 'failed')]), null);
  eq('★★ 出勤ページを読めた回があれば、それより古い失敗は数えない', kind([L(30, 'failed'), R(25, 'read_work', 'ok', { shopVisible: false }), L(20, 'failed')]), null);
  eq('★★★ ログインの失敗が続いていれば、出勤の失敗より先に言う（直す場所が違う）', kind([L(40, 'failed'), L(30, 'failed'), R(20, 'write_work', 'failed')]), 'login');
  eq('★★ 出勤の失敗より古いログインの失敗は数えない', kind([R(40, 'write_work', 'failed'), L(30, 'failed'), L(20, 'failed')]), 'not_reflected');
}

console.log('\n── 5. たたんである行（途中経過）は決め手にしない ──');
eq('★★ エステ魂の人ごとの確認（plan_work stopped・たたむ印）で、前の失敗を隠さない',
  kind([R(30, 'plan_work', 'ok', { people: 29, changed: 1 }), R(30, 'plan_work', 'stopped', { shopVisible: false, castId: '1' }), R(20, 'write_work', 'failed')]), 'not_reflected');
eq('★★★ たたむ印が付いていても、失敗は見る', kind([R(30, 'write_work', 'failed', { shopVisible: false })]), 'not_reflected');

console.log('\n── 6. 画面の文 ──');
{
  const names = { loginScreen: 'ID・パスワード登録', logScreen: '更新結果', autoOn: true };
  const t = (k) => m.workProblemText({ kind: k, at: at(0) }, '駅ちか', '10/7 15:20', names);
  eq('★ ログイン: 直す場所を言う', [t('login').title, t('login').link, /「ID・パスワード登録」/.test(t('login').body)], ['駅ちかにログインできていません（10/7 15:20）', 'login', true]);
  eq('★ 反映できていない: 次にすることを言う', [t('not_reflected').title, /「いますぐ更新する」/.test(t('not_reflected').body), /「更新結果」/.test(t('not_reflected').body)], ['10/7 15:20 の更新が、駅ちかに反映できていません', true, true]);
  eq('★ 自動が止まった', t('auto_off').title, '3回続けて反映できなかったため、10/7 15:20 に自動更新を止めました');
  for (const k of ['login', 'not_reflected', 'not_sent', 'unconfirmed', 'auto_off']) {
    const x = t(k);
    eq('★★★ ' + k + ': 内部の言葉が出ない', /verify|write_work|slot|枠1|dryrun|castId|flow/i.test(x.title + x.body + m.workProblemShort({ kind: k, at: at(0) })), false);
  }
  eq('★ ホームの1行', m.workProblemShort({ kind: 'auto_off', at: at(0) }), '出勤の自動更新が止まりました');
}

console.log('\n── 7. ★★★ ログインに続けて失敗したら、自動の周は60分あける ──');
{
  const L = (min, o) => ({ event: 'login', outcome: o, createdAt: at(min) });
  const now = (min) => Date.parse(at(min));
  const three = [L(30, 'failed'), L(20, 'failed'), L(10, 'failed')];
  eq('★★★ 3回続けて失敗 → 最後の失敗から60分は行かない', b.loginBackoff({ rows: three, nowMs: now(45) }), { hold: true, streak: 3, untilISO: at(90) });
  eq('★★★ 60分たったら1回試す（永久には止めない）', b.loginBackoff({ rows: three, nowMs: now(90) }).hold, false);
  eq('★★ 2回では止めない', b.loginBackoff({ rows: [L(30, 'failed'), L(20, 'failed'), L(10, 'ok')], nowMs: now(31) }).hold, false);
  eq('★★ 間に通った回があれば止めない', b.loginBackoff({ rows: [L(30, 'failed'), L(25, 'ok'), L(20, 'failed'), L(10, 'failed')], nowMs: now(31) }).hold, false);
  eq('★★★ 保存し直したら、すぐ試せる', b.loginBackoff({ rows: [{ event: 'credential_saved', outcome: 'ok', createdAt: at(35) }, ...three], nowMs: now(36) }).hold, false);
  eq('★★ 保存し直したあとに、また3回失敗したら止める', b.loginBackoff({ rows: [L(60, 'failed'), L(50, 'failed'), L(40, 'failed'), { event: 'credential_saved', outcome: 'ok', createdAt: at(35) }], nowMs: now(61) }).hold, true);
  eq('★ 記録なし', b.loginBackoff({ rows: [], nowMs: now(0) }), { hold: false, streak: 0, untilISO: null });
  eq('★ しきい値', [b.LOGIN_BACKOFF_STREAK, b.LOGIN_BACKOFF_MIN], [3, 60]);

  eq('★★★ 自動の周', ['cron:diary-import', 'cron:sokuhime-push', 'system:auto-push', 'system', '', undefined, null].map(b.isAutomaticActor), [true, true, true, true, true, true, true]);
  eq('★★★ 人が押した操作は、いつでも通す', ['shop:abc', 'conecf:girl-delete', 'admin:work-flow', 'admin:xyz'].map(b.isAutomaticActor), [false, false, false, false]);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
