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

console.log('\n── 4. ★★ 数える・0でも理由が読める ──');
const rows = [
  { ...OK }, { ...OK },
  { ...OK, imasuguLive: false },
  { ...OK, consent: 'unknown' },
  { ...OK, castId: null },
  { ...OK, account: 'not_started' },
  { ...OK, lastStartedAt: minAgo(5) },
];
eq('★ 理由ごとに数える', T.tallySokusera(rows, NOW), {
  母数: 7, ONにする: 2, 今すぐでない: 1, 了承なし: 1,
  未開始: 1, 利用状況が不明: 0, 名簿未結び: 1, 打ったばかり: 1,
});
eq('★ 空でも落ちない', T.tallySokusera([], NOW).母数, 0);
// ★★★ 「ONにする」は0でも必ず出す（第35便の反省6）
eq('★★★ 0でも数を出す',
   T.sokuseraSummary(T.tallySokusera([{ ...OK, imasuguLive: false }], NOW)).startsWith('即セラをONにする 0名'), true);
eq('★ 在籍の数は必ず出る', T.sokuseraSummary(T.tallySokusera(rows, NOW)).includes('在籍 7名'), true);
eq('★ 0のものは並べない',
   T.sokuseraSummary(T.tallySokusera([{ ...OK }], NOW)).includes('名簿'), false);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
