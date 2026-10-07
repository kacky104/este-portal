// セラピストの削除で「各サイトから消えたことを確かめてから、コネックエフ側を消す」判断（src/lib/girlDeleteFinish.ts）の自己点検（第1279便・2026-10-07）。
//
// ★★★ ここで見張っているのは:
//   ① 確かめられていないのに「消えた」と数えて、本人を消してしまうこと（★ 退店した方が駅ちかに残り、やり直せなくなる）
//   ② 別の方・別のサイト・前に失敗した回の記録を、今回の結果と取り違えること
//
//   使い方:  npm run check:girldeletefinish

const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'girlDeleteFinish.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const EKI = { provider: 'ekichika', slot: 1, castId: '5232208' };
const TAMA = { provider: 'esutama', slot: 1, castId: '99001' };
const R = (provider, event, outcome, detail, slot) => ({ provider, slot: slot || 1, event, outcome, detail: detail || {} });

console.log('── 1. ★★★ 「そのサイトから居なくなったことを確かめた」記録だけを数える ──');
eq('★★★ 駅ちか: 削除して、読み直したら居なかった（ok）', m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'ok', { castId: '5232208', before: 38, after: 37 }), EKI), true);
eq('★★ 駅ちか: 行ったらもう居なかった（stopped・not_listed）', m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'stopped', { castId: '5232208', reason: 'not_listed' }), EKI), true);
eq('★★★ 駅ちか: 失敗（削除リンクが読めない・まだ居る など）は数えない',
  [m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'failed', { castId: '5232208', reason: 'still_listed' }), EKI),
   m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'failed', { castId: '5232208', reason: 'no_delete_link' }), EKI),
   m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'stopped', { reason: 'no_cast_id' }), EKI)], [false, false, false]);
eq('★★★ エステ魂: 非表示を確かめた（ok）', m.isSiteGoneAudit(R('esutama', 'hide_cast', 'ok', { castId: '99001' }), TAMA), true);
eq('★★ エステ魂: もともと非表示・一覧に居ない・非表示にしたら消えていた',
  [m.isSiteGoneAudit(R('esutama', 'hide_cast', 'stopped', { castId: '99001', reason: 'already_hidden' }), TAMA),
   m.isSiteGoneAudit(R('esutama', 'hide_cast', 'stopped', { castId: '99001', reason: 'not_listed' }), TAMA),
   m.isSiteGoneAudit(R('esutama', 'hide_cast', 'failed', { castId: '99001', reason: 'gone' }), TAMA)], [true, true, true]);
eq('★★★ エステ魂: まだ表示中・応答がおかしい・値を読めない は数えない',
  [m.isSiteGoneAudit(R('esutama', 'hide_cast', 'failed', { castId: '99001', reason: 'still_shown' }), TAMA),
   m.isSiteGoneAudit(R('esutama', 'hide_cast', 'failed', { castId: '99001', reason: 'http_error' }), TAMA),
   m.isSiteGoneAudit(R('esutama', 'hide_cast', 'failed', { castId: '99001', reason: 'no_ctk' }), TAMA)], [false, false, false]);
eq('★★★ 別の方（castId が違う）の記録は数えない', m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'ok', { castId: '5232190' }), EKI), false);
eq('★★★ 別のサイト・別の枠の記録は数えない',
  [m.isSiteGoneAudit(R('esutama', 'hide_cast', 'ok', { castId: '5232208' }), EKI), m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'ok', { castId: '5232208' }, 2), EKI)], [false, false]);
eq('★★★ ログインできなかった・ほかの種類の記録は数えない',
  [m.isSiteGoneAudit(R('ekichika', 'login', 'failed', { castId: '5232208' }), EKI), m.isSiteGoneAudit(R('ekichika', 'relay_expired', 'stopped', { castId: '5232208' }), EKI)], [false, false]);
eq('★★★ この便が書く「コネックエフから削除しました」「残しています」の行（castId なし）は、サイトの結果に数えない',
  [m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'ok', { therapistId: 12, reason: 'local_deleted', sites: 2 }), EKI),
   m.isSiteGoneAudit(R('ekichika', 'delete_girl', 'stopped', { therapistId: 12, reason: 'kept_site_not_confirmed' }), EKI)], [false, false]);

console.log('\n── 2. ★★★ 待っているサイトが全部済んだときだけ「消してよい」 ──');
{
  const both = [EKI, TAMA];
  const ekiOk = R('ekichika', 'delete_girl', 'ok', { castId: '5232208' });
  const tamaOk = R('esutama', 'hide_cast', 'ok', { castId: '99001' });
  const tamaNg = R('esutama', 'hide_cast', 'failed', { castId: '99001', reason: 'still_shown' });
  const p = (waitFor, rows, alsoDone) => m.girlDeleteProgress({ waitFor, rows, alsoDone });
  eq('★★★ 2サイトとも確かめた → 消してよい', p(both, [tamaOk, ekiOk]), { ready: true, pending: [] });
  eq('★★★ 駅ちかだけ済んだ → まだ消さない（エステ魂を待つ）', p(both, [ekiOk]), { ready: false, pending: [TAMA] });
  eq('★★★ エステ魂が失敗 → 消さない', p(both, [tamaNg, ekiOk]), { ready: false, pending: [TAMA] });
  eq('★★ いま終わった流れ自身は、記録が無くても「済んだ」と渡せる（駅ちかの照合が通った回）', p(both, [tamaOk], ['ekichika#1']), { ready: true, pending: [] });
  eq('★★ いま終わったのが駅ちか、エステ魂はまだ', p(both, [], ['ekichika#1']), { ready: false, pending: [TAMA] });
  eq('★★ 1サイトだけ待つ', [p([EKI], [ekiOk]).ready, p([EKI], []).ready, p([EKI], [], ['ekichika#1']).ready], [true, false, true]);
  eq('★★★ 待つサイトが1つも無い文脈は「消してよい」としない（取り違え。消さない側に倒す）', p([], [ekiOk, tamaOk], ['ekichika#1']), { ready: false, pending: [] });
  eq('★★ 2枠（駅ちか 枠1・枠2）は、両方済むまで待つ',
    [p([EKI, { provider: 'ekichika', slot: 2, castId: '777' }], [ekiOk]).ready,
     p([EKI, { provider: 'ekichika', slot: 2, castId: '777' }], [ekiOk, R('ekichika', 'delete_girl', 'ok', { castId: '777' }, 2)]).ready], [false, true]);
}

console.log('\n── 3. 文脈の値が崩れていたら、消さない ──');
{
  const ok = { therapistId: 12, requestedAt: '2026-10-07T08:00:00.000Z', waitFor: [EKI, TAMA] };
  eq('★ ふつうの形はそのまま読める', m.parseDeleteAfter(ok), ok);
  eq('★ 文字で入っていても数に直す', m.parseDeleteAfter({ therapistId: '12', requestedAt: ok.requestedAt, waitFor: [{ provider: 'ekichika', slot: '1', castId: '5232208' }] }),
    { therapistId: 12, requestedAt: ok.requestedAt, waitFor: [EKI] });
  eq('★★★ 形が崩れていたら null（消さない側に倒す）',
    [m.parseDeleteAfter(null), m.parseDeleteAfter({}), m.parseDeleteAfter({ ...ok, therapistId: 0 }), m.parseDeleteAfter({ ...ok, requestedAt: 'x' }),
     m.parseDeleteAfter({ ...ok, waitFor: [] }), m.parseDeleteAfter({ ...ok, waitFor: [{ provider: 'ekichika', slot: 1, castId: 'abc' }] }),
     m.parseDeleteAfter({ ...ok, waitFor: [{ provider: '', slot: 1, castId: '1' }] })],
    [null, null, null, null, null, null, null]);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
