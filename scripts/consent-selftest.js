// セラピスト本人の了承（src/lib/therapistMediaConsent.ts）の自己点検（第118便・2026-09-03）。
//
// ★★★ ここで危ないのは【了承していない人に送ってしまうこと】。
//   ★ 日記は上書きではなく【投稿】。★ 間違えると本人のアカウントから記事が出て、こちらでは消せない。
//   → 迷ったら送らない側に倒っていることを、点検で固定する。
//
//   使い方:  npm run check:consent

const path = require('path');
const v = require(path.join(__dirname, '..', '_tmpcheck', 'therapistMediaConsent.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. 状態の読み取り（★ 分からないものは送らない側へ）──');
eq('★ 3つある', [...v.CONSENT_STATES], ['unknown', 'agreed', 'declined']);
eq('★ 知らない値は unknown に倒す', [v.toConsentState('yes'), v.toConsentState(''), v.toConsentState(null), v.toConsentState(1)],
   ['unknown', 'unknown', 'unknown', 'unknown']);
eq('★ 正しい値はそのまま', [v.toConsentState('agreed'), v.toConsentState('declined')], ['agreed', 'declined']);
eq('★ 見分けられる', [v.isConsentState('agreed'), v.isConsentState('ok')], [true, false]);

console.log('\n── 2. ★★★ 送ってよいか（画面もサーバもこれを呼ぶ）──');
eq('★★★ 了承ありで、始めている人だけ送れる',
   v.canSendDiary({ consent: 'agreed', account: 'started' }), { ok: true });
eq('★★★ 未確認は送らない', v.canSendDiary({ consent: 'unknown', account: 'started' }).reason, 'not_agreed');
eq('★★★ 断られたら送らない', v.canSendDiary({ consent: 'declined', account: 'started' }).reason, 'not_agreed');
// ★★ 断られたのと、まだ聞いていないのとで、言い方を変える（店舗様の次の行動が違う）
eq('★★ 断られたときの文と未確認の文は別',
   v.canSendDiary({ consent: 'declined', account: 'started' }).message ===
   v.canSendDiary({ consent: 'unknown', account: 'started' }).message, false);
// ★★★ 相手側の状態。★ 「始めていない」と「まだ読めていない」を混ぜない
eq('★★★ 始めていない人には送れない',
   v.canSendDiary({ consent: 'agreed', account: 'not_started' }).reason, 'not_started');
eq('★★★ 相手を読めていないときも送らない（始めていると決めつけない）',
   v.canSendDiary({ consent: 'agreed', account: 'unknown' }).reason, 'account_unknown');
eq('★★ 3つの断り方の文が全部違う',
   new Set(['not_agreed', 'not_started', 'account_unknown'].map((r) => {
     if (r === 'not_agreed') return v.canSendDiary({ consent: 'unknown', account: 'started' }).message;
     if (r === 'not_started') return v.canSendDiary({ consent: 'agreed', account: 'not_started' }).message;
     return v.canSendDiary({ consent: 'agreed', account: 'unknown' }).message;
   })).size, 3);
// ★ 断るときは必ず理由と文がある
eq('★ 断り文が空でない',
   [['unknown', 'started'], ['declined', 'started'], ['agreed', 'not_started'], ['agreed', 'unknown']]
     .filter(([c, a]) => { const r = v.canSendDiary({ consent: c, account: a }); return r.ok || !r.message; }), []);

console.log('\n── 3. 言葉 ──');
eq('★ 状態の言い方', v.CONSENT_STATES.map((s) => v.consentLabel(s)),
   ['まだ確認していません', '了承あり', '送らない']);
eq('★★ 次にすることが状態ごとに違う',
   new Set(v.CONSENT_STATES.map((s) => v.consentNextStep(s))).size, 3);
eq('★ 未確認のときは「確認してから」と言う', /確認して/.test(v.consentNextStep('unknown')), true);

console.log('\n── 4. 数える（★ 行が無い人も母数に入れる）──');
{
  const t = v.tallyConsents([1, 2, 3, 4], [
    { therapistId: 1, state: 'agreed' },
    { therapistId: 2, state: 'declined' },
    { therapistId: 3, state: 'unknown' },
    // ★ 4番は行が無い
  ]);
  eq('★★★ 行が無い人は未確認として数える', t, { 全体: 4, 了承あり: 1, 送らない: 1, 未確認: 2 });
  eq('★ 文', v.consentSummary(t), '了承あり 1名 ／ 送らない 1名 ／ 未確認 2名（在籍 4名）');
}
{
  // ★★ 知らない値が入っていても未確認として数える（勝手に了承にしない）
  const t = v.tallyConsents([1], [{ therapistId: 1, state: 'ok' }]);
  eq('★★★ 知らない値は了承にしない', t.了承あり, 0);
  eq('★ 未確認に入る', t.未確認, 1);
}
{
  // ★ 在籍に居ない人の記録は数えない（消えた人の了承で人数が増えない）
  const t = v.tallyConsents([1], [{ therapistId: 1, state: 'agreed' }, { therapistId: 99, state: 'agreed' }]);
  eq('★★ 在籍だけを数える', t, { 全体: 1, 了承あり: 1, 送らない: 0, 未確認: 0 });
}
eq('★ 誰も居なければそう言う', v.consentSummary(v.tallyConsents([], [])), 'セラピストが登録されていません');
eq('★★ 全員未確認のときは「まだ確認していません」',
   v.consentSummary(v.tallyConsents([1, 2], [])), '2名ぶん、まだご本人に確認していません');
eq('★ 全員了承なら送らない・未確認は出さない',
   v.consentSummary(v.tallyConsents([1], [{ therapistId: 1, state: 'agreed' }])), '了承あり 1名（在籍 1名）');

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
