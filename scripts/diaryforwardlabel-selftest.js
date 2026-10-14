// 写メ日記の転送の記録の文言（src/lib/diaryForwardLabel.ts）の自己点検（第1496便・2026-10-15）。
//
// ★★ なぜ要るか: forwardDiary が書く status の値と、画面の文言が食い違うと「送れたのに失敗」「失敗なのに成功」に見える。
//   ★ status の値を足したら、ここにも足すこと。
//
//   使い方:  npm run check:diaryforwardlabel

const path = require('path');
const L = require(path.join(__dirname, '..', '_tmpcheck', 'diaryForwardLabel.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. forwardDiary が書く値を、ぜんぶ知っている ──');
const KNOWN = ['sent', 'retrying', 'waiting_address', 'failed', 'skipped:no_address', 'skipped:disabled', 'skipped:empty',
  'skipped:set_plan_off', 'skipped:diary_gone', 'skipped:taken', 'skipped:source_is_benry', 'skipped:source_is_ekichika',
  'skipped:link_mode_is_read', 'skipped:link_mode_is_null', 'failed:RESEND_API_KEY 未設定'];
for (const k of KNOWN) eq('★ 知っている値: ' + k, L.diaryForwardLabel(k).text !== k, true);

console.log('\n── 2. 色分け ──');
eq('★ 送信済みは ok', L.diaryForwardLabel('sent').tone, 'ok');
eq('★ アドレス待ちは wait', L.diaryForwardLabel('waiting_address').tone, 'wait');
eq('★★★ 10/14 の形（アドレス無しで諦めた）は ng ＝ 目立たせる', L.diaryForwardLabel('skipped:no_address').tone, 'ng');
eq('★★★ 10/14 の形は「連携をご確認」と言う', L.diaryForwardLabel('skipped:no_address').text.includes('連携'), true);
eq('★ 失敗は ng', L.diaryForwardLabel('failed').tone, 'ng');
eq('★ 店舗様の設定で送らないのは skip', L.diaryForwardLabel('skipped:disabled').tone, 'skip');
eq('★ 入口がフクエスでないのは skip', L.diaryForwardLabel('skipped:source_is_ekichika').tone, 'skip');

console.log('\n── 3. 知らない値は黙って「その他」にしない（そのまま出す）──');
eq('★ そのまま', L.diaryForwardLabel('skipped:something_new'), { text: 'skipped:something_new', tone: 'skip' });
eq('★ 空でも落ちない', L.diaryForwardLabel('').text, '');
eq('★ 目立たせるのは ng だけ', [L.diaryForwardNeedsAttention('failed'), L.diaryForwardNeedsAttention('sent'), L.diaryForwardNeedsAttention('waiting_address')], [true, false, false]);

console.log(fail === 0 ? '\nALL OK' : '\n' + fail + ' NG');
process.exit(fail === 0 ? 0 : 1);
