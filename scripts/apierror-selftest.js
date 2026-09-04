// APIのエラー本文の読み取り（src/lib/apiErrorMessage.ts）の自己点検（第125便・2026-09-04）。
//
// ★★★ ここで守りたいのは2つ。★ どちらか一方だけでは意味が無い。
//   ① 鍵らしき文字列を【必ず伏せる】（本文をそのまま流さない）
//   ② それ以外は【必ず見せる】（消すと、止まった理由が永久に分からなくなる）
//
//   使い方:  npm run check:apierror

const path = require('path');
const E = require(path.join(__dirname, '..', '_tmpcheck', 'apiErrorMessage.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 鍵を必ず伏せる（いちばん大事）──');
eq('★★★ sk-ant- を伏せる',
   E.maskSecrets('key sk-ant-api03-abcdefghijklmn is invalid'), 'key *** is invalid');
eq('★★ Bearer トークンを伏せる',
   E.maskSecrets('Authorization: Bearer abcdefghijklmnop'), 'Authorization: ***');
eq('★★ api_key= の形も伏せる',
   E.maskSecrets('api_key=abcdefghijklmnop failed').includes('abcdefghijklmnop'), false);
eq('★ 鍵が無ければそのまま', E.maskSecrets('credit balance is too low'), 'credit balance is too low');

console.log('\n── 2. ★★★ それ以外は必ず見せる ──');
// ★★★ 実際に詰まった形。★ この一行が出ていれば30分迷わなかった
eq('★★★ Anthropic の error.message を取り出す',
   E.sanitizeApiErrorMessage('{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'),
   'Your credit balance is too low to access the Anthropic API.');
eq('★★ message が無ければ type を拾う',
   E.sanitizeApiErrorMessage('{"error":{"type":"invalid_request_error"}}'), 'invalid_request_error');
eq('★★ 直下の message も拾う', E.sanitizeApiErrorMessage('{"message":"bad request"}'), 'bad request');
// ★ JSON でなければ本文そのもの（黙って捨てない）
eq('★★ JSON でない本文はそのまま見せる', E.sanitizeApiErrorMessage('Bad Request'), 'Bad Request');
eq('★ 壊れた JSON も本文を見せる',
   E.sanitizeApiErrorMessage('{"error":'), '{"error":');
// ★ 取り出した message にも鍵の伏せ字がかかること（★ 片方だけだと漏れる）
eq('★★★ message の中の鍵も伏せる',
   E.sanitizeApiErrorMessage('{"error":{"message":"invalid key sk-ant-api03-abcdefghij"}}'),
   'invalid key ***');

console.log('\n── 3. ★ 0件と分からないを混ぜない ──');
eq('★★ 空は null（空文字にしない）', E.sanitizeApiErrorMessage(''), null);
eq('★ 空白だけも null', E.sanitizeApiErrorMessage('   '), null);
eq('★ 文字列でなければ null',
   [E.sanitizeApiErrorMessage(null), E.sanitizeApiErrorMessage(undefined), E.sanitizeApiErrorMessage(123)],
   [null, null, null]);
eq('★ message が空文字なら本文へ落ちる',
   E.sanitizeApiErrorMessage('{"error":{"message":"  "}}'), '{"error":{"message":" "}}');

console.log('\n── 4. ★ 読みやすさ ──');
const long = 'x'.repeat(400);
eq('★★ 長すぎる本文は切る', E.sanitizeApiErrorMessage(long).length, E.MAX_ERROR_MESSAGE_LEN + 1);
eq('★ 改行はつめる', E.sanitizeApiErrorMessage('a\n\nb   c'), 'a b c');

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
