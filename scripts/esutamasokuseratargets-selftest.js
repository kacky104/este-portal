// 即セラの相手選び（src/lib/esutamaSokuseraTargets.ts）の自己点検（第143便・2026-09-04）。
//
// ★★★ ここで守りたいのは3つ。
//   ① 「今すぐ」でなければ何もしない（★ 用が無い）
//   ② 打ちすぎない（★ 相手のアカウントを触る）
//   ③ 名簿の結びは利用状況より【先】（★ 第133便の教訓。結びが無いと利用状況を決められない）
//
//   使い方:  npm run check:esutamasokuseratargets

const path = require('path');
const T = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaSokuseraTargets.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const NOW = new Date('2026-09-04T12:00:00Z');
const minAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();
const OK = { consent: 'agreed', account: 'started', castId: '757481', imasuguLive: true, lastStartedAt: null };
const d = (o) => T.decideSokuseraTarget({ ...OK, ...o }, NOW);

console.log('── 1. ★★★ 「今すぐ」でなければ何もしない ──');
eq('★ 全部そろえばONにする', d({}), { ok: true });
// ★★ これは故障ではない。★ 店舗様にすることも無い
eq('★★★ 今すぐでなければ打たない', d({ imasuguLive: false }).reason, 'not_imasugu');
// ★ しかも【最初】に見る。★ 他の理由を並べても意味が無い
eq('★★★ 今すぐでなければ他の理由より先',
   d({ imasuguLive: false, consent: 'unknown', castId: null }).reason, 'not_imasugu');

console.log('\n── 2. 送れない理由を混ぜない ──');
eq('★ 了承なし', d({ consent: 'unknown' }).reason, 'not_agreed');
eq('★ 断られた', d({ consent: 'declined' }).reason, 'not_agreed');
eq('★★★ 名簿の結びが無い', d({ castId: null }).reason, 'no_cast_id');
eq('★ 未開始', d({ account: 'not_started' }).reason, 'not_started');
eq('★ 利用状況が不明', d({ account: 'unknown' }).reason, 'account_unknown');
// ★★★ 第133便の教訓: 結びが無いと利用状況はそもそも決められない。★ 結びが先
eq('★★★ 結びが無ければ利用状況より先',
   d({ castId: null, account: 'not_started' }).reason, 'no_cast_id');
// ★ ただし了承はさらに前
eq('★★ 了承が無ければ結びより先', d({ consent: 'declined', castId: null }).reason, 'not_agreed');

console.log('\n── 3. ★★★ 打ちすぎない ──');
// ★ 相手は60分で勝手にOFFになる。★ その手前で打ち直しても意味が薄い
eq('★★★ さきほど打っていたら打たない', d({ lastStartedAt: minAgo(10) }).reason, 'cooling');
eq('★ 54分前でもまだ打たない', d({ lastStartedAt: minAgo(54) }).reason, 'cooling');
eq('★ 55分たてば打つ', d({ lastStartedAt: minAgo(55) }).ok, true);
eq('★ ずっと前なら打つ', d({ lastStartedAt: minAgo(600) }).ok, true);
// ★ 時計のずれ（未来）は「経っていない」扱い。★ 打たない側へ倒す
eq('★★ 未来の時刻でも暴走しない', d({ lastStartedAt: '2099-01-01T00:00:00Z' }).reason, 'cooling');
eq('★ 読めない時刻は無いものと同じ', d({ lastStartedAt: 'こわれている' }).ok, true);
// ★★ 打ったばかりは【最後】に見る。★ 他が全部そろっている人にだけ言う
eq('★★★ 今すぐでなければ cooling より先',
   d({ imasuguLive: false, lastStartedAt: minAgo(1) }).reason, 'not_imasugu');

console.log('\n── 3b. ★★ 第1246便: 見に行って打たなかった方は55分あける ──');
eq('★★★ さきほど確かめていたら見に行かない', d({ lastCheckedAt: minAgo(10) }).reason, 'checked');
eq('★ 54分前でもまだ見に行かない', d({ lastCheckedAt: minAgo(54) }).reason, 'checked');
eq('★ 55分たてば見に行く', d({ lastCheckedAt: minAgo(55) }).ok, true);
eq('★ 省略すれば今までどおり', d({}).ok, true);
eq('★ null でも今までどおり', d({ lastCheckedAt: null }).ok, true);
eq('★ 読めない時刻は無いものと同じ', d({ lastCheckedAt: 'こわれている' }).ok, true);
eq('★★ 未来の時刻でも暴走しない', d({ lastCheckedAt: '2099-01-01T00:00:00Z' }).reason, 'checked');
eq('★★ 打ったばかりのほうが先', d({ lastStartedAt: minAgo(1), lastCheckedAt: minAgo(1) }).reason, 'cooling');
eq('★★ 今すぐでなければ checked より先', d({ imasuguLive: false, lastCheckedAt: minAgo(1) }).reason, 'not_imasugu');
eq('★ 55分の定数', T.SOKUSERA_CHECK_HOLD_MIN, 55);

console.log('\n── 4. ★★ 数える・0でも理由が読める ──');
const rows = [
  { ...OK }, { ...OK },
  { ...OK, imasuguLive: false },
  { ...OK, consent: 'unknown' },
  { ...OK, castId: null },
  { ...OK, account: 'not_started' },
  { ...OK, lastStartedAt: minAgo(5) },
  { ...OK, lastCheckedAt: minAgo(5) },
];
eq('★ 理由ごとに数える', T.tallySokusera(rows, NOW), {
  母数: 8, ONにする: 2, 今すぐでない: 1, 了承なし: 1,
  未開始: 1, 利用状況が不明: 0, 名簿未結び: 1, 打ったばかり: 1, 確かめたばかり: 1,
});
eq('★ 空でも落ちない', T.tallySokusera([], NOW).母数, 0);
// ★★★ 「ONにする」は0でも必ず出す（第35便の反省6）
eq('★★★ 0でも数を出す',
   T.sokuseraSummary(T.tallySokusera([{ ...OK, imasuguLive: false }], NOW)).startsWith('即セラをONにする 0名'), true);
eq('★ 在籍の数は必ず出る', T.sokuseraSummary(T.tallySokusera(rows, NOW)).includes('在籍 8名'), true);
eq('★ 確かめたばかりも並ぶ', T.sokuseraSummary(T.tallySokusera(rows, NOW)).includes('さきほど確かめた 1名'), true);
eq('★ 0のものは並べない',
   T.sokuseraSummary(T.tallySokusera([{ ...OK }], NOW)).includes('名簿'), false);

console.log('\n── 第1288便: ★★★ 途中で失敗した方で、後ろを詰まらせない ──');
{
  const A = { id: 1, lastFailedAt: null }, B = { id: 2, lastFailedAt: null }, C = { id: 3, lastFailedAt: null };
  eq('だれも失敗していなければ先頭（今までどおり）', T.pickSokuseraAuto([A, B, C]).id, 1);
  // ★★★ 直す前の形: 先頭の方が失敗 → 次の周も先頭 → 後ろが1人も ON にならない
  eq('★★★ 先頭の方が直近に失敗していたら、次の方を選ぶ', T.pickSokuseraAuto([{ ...A, lastFailedAt: minAgo(10) }, B, C]).id, 2);
  eq('★★ 先頭と2人目が失敗していたら、3人目', T.pickSokuseraAuto([{ ...A, lastFailedAt: minAgo(20) }, { ...B, lastFailedAt: minAgo(10) }, C]).id, 3);
  eq('★★ ほかに居なければ、失敗した方をもう一度（あけない）', T.pickSokuseraAuto([{ ...A, lastFailedAt: minAgo(10) }]).id, 1);
  eq('★★ 全員が失敗していたら、いちばん前に失敗した方（同じ方ばかりにしない）',
     T.pickSokuseraAuto([{ ...A, lastFailedAt: minAgo(10) }, { ...B, lastFailedAt: minAgo(30) }, { ...C, lastFailedAt: minAgo(20) }]).id, 2);
  eq('★ 時刻が読めない記録は「失敗していない」扱い', T.pickSokuseraAuto([{ ...A, lastFailedAt: 'x' }, B]).id, 1);
  eq('★ 候補が居なければ null', T.pickSokuseraAuto([]), null);

  const sp = T.splitSokuseraChecks([
    { therapistId: 1, checkedAt: minAgo(5), reason: 'page_no_start' },
    { therapistId: 2, checkedAt: minAgo(6), reason: T.SOKUSERA_REASON_RETRY },
    { therapistId: 3, checkedAt: minAgo(7), reason: T.SOKUSERA_REASON_UNCONFIRMED },
    { therapistId: 4, checkedAt: minAgo(8), reason: 'not_started' },
    { therapistId: 5, checkedAt: minAgo(9), reason: null },
    { therapistId: 6, checkedAt: minAgo(9), reason: 'something_new' },
  ]);
  eq('★★★ 送る前の失敗だけが「後ろへ回す」側', [...sp.retried.keys()], [2]);
  eq('★★★ 送ったあと確かめられなかった方は「あける」側', sp.held.has(3), true);
  eq('★ 今までの理由・空・知らない理由は「あける」側', [1, 4, 5, 6].every((x) => sp.held.has(x)), true);
  // ★★★ 「後ろへ回す」方は、あけない（＝ON にしてよい方に残る）。「あける」方は55分 ON にしない
  eq('★★★ 送る前に失敗した方は、次の周も ON にしてよい方に残る', d({ lastCheckedAt: sp.held.get(2) ?? null }), { ok: true });
  eq('★★★ 送ったあと確かめられなかった方は、55分 ON にしない', d({ lastCheckedAt: sp.held.get(3) }).reason, 'checked');

  const o = (purpose, nextPurpose, audits) => T.sokuseraAttemptOutcome({ purpose, nextPurpose, audits: audits || [] });
  const END = 'esutama_sokusera_end';
  eq('発行できた（次へ進む）は覚えない', o('esutama_sokusera_token', 'esutama_sokusera_proxy'), null);
  eq('★★ 発行を断られた → 後ろへ回す', o('esutama_sokusera_token', null, [{ event: 'diary_proxy_token', outcome: 'failed', detail: { use: 'sokusera' } }]), 'retry');
  eq('★★ 代理ログインに入れなかった → 後ろへ回す', o('esutama_sokusera_proxy', END), 'retry');
  eq('代理ログインに入れた（次へ進む）は覚えない', o('esutama_sokusera_proxy', 'esutama_sokusera_page'), null);
  eq('★★ 設定ページに出た名前が違った → 後ろへ回す',
     o('esutama_sokusera_page', END, [{ event: 'diary_proxy_login', outcome: 'failed', detail: { use: 'sokusera', matched: false } }]), 'retry');
  eq('★★ 設定ページが読めなかった（本人の表示はあった）→ 後ろへ回す',
     o('esutama_sokusera_page', END, [{ event: 'diary_proxy_login', outcome: 'ok', detail: { use: 'sokusera' } }]), 'retry');
  eq('★★★ 打たないと決めた回（すでに ON など）は、ここでは覚えない（第1246便が55分あける）',
     o('esutama_sokusera_page', END, [
       { event: 'diary_proxy_login', outcome: 'ok', detail: { use: 'sokusera' } },
       { event: 'read_sokusera', outcome: 'ok', detail: { use: 'sokusera', willStart: false } }]), null);
  eq('ON を送る段へ進む回は覚えない',
     o('esutama_sokusera_page', 'esutama_sokusera_start', [{ event: 'read_sokusera', outcome: 'ok', detail: { use: 'sokusera', willStart: true } }]), null);
  eq('★★★ ON を送ったが応答がエラー → 55分あける', o('esutama_sokusera_start', END, [{ event: 'push_sokusera', outcome: 'failed', detail: { status: 500 } }]), 'unconfirmed');
  eq('送れた（読み返しへ進む）は覚えない', o('esutama_sokusera_start', 'esutama_sokusera_verify', [{ event: 'push_sokusera', outcome: 'ok' }]), null);
  eq('★★★ 読み返すと OFF のまま → 55分あける（打ち直さない）', o('esutama_sokusera_verify', END, [{ event: 'verify_sokusera', outcome: 'failed' }]), 'unconfirmed');
  eq('★★★ 読み返しても状態が読めない → 55分あける', o('esutama_sokusera_verify', END, [{ event: 'verify_sokusera', outcome: 'stopped' }]), 'unconfirmed');
  eq('ON を確かめた回は覚えない（監査の記録で55分あく）', o('esutama_sokusera_verify', END, [{ event: 'verify_sokusera', outcome: 'ok' }]), null);
  eq('代理ログインを終える段・ほかの段は覚えない', [o(END, null), o('login', 'esutama_therapist_list')], [null, null]);
}

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
