// 取り込みで作る方に「新人（NEW）」を付けるか（src/lib/importNewFace.ts）の自己点検（第1257便・2026-10-07）。
//
// ★★★ ここで危ないのは:
//   ・その店の最初の取り込みで付けてしまう → 昔から在籍している方が全員「新人」になる（AMAZE 様で 59名）
//   ・ふだんの取り込みで付けなくなる       → 駅ちかの新人がフクエスで新人として出ない（第227便の決定を壊す）
//
//   使い方:  npm run check:importnewface

const N = require(require('path').join(__dirname, '..', '_tmpcheck', 'importNewFace.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const now = new Date('2026-10-07T00:10:00+09:00');
const ago = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

console.log('── 1. ★★★ その店の最初の取り込みでは付けない ──');
eq('★★★ 結びが1件も無い（null）', N.importNewFaceOnCreate(null, now), false);
eq('★★ undefined', N.importNewFaceOnCreate(undefined, now), false);
eq('★ 空文字', N.importNewFaceOnCreate('', now), false);
eq('★★★ 最初の結びが5分前（2つ目の chunk・枠2）', N.importNewFaceOnCreate(ago(5 / 60), now), false);
eq('★★ 最初の結びが23時間前（1日1回の周がまだ来ていない）', N.importNewFaceOnCreate(ago(23), now), false);

console.log('\n── 2. ★★★ ふだんの取り込みでは今までどおり付ける ──');
eq('★ ちょうど24時間', N.importNewFaceOnCreate(ago(24), now), true);
eq('★★ 25時間前', N.importNewFaceOnCreate(ago(25), now), true);
eq('★★★ 既存の店（2026-08-28 に写した結び）', N.importNewFaceOnCreate('2026-08-28T03:00:00+00:00', now), true);

console.log('\n── 3. ★ 壊れた値・先の時刻 ──');
eq('★★ 読めない時刻は今までどおり付ける', N.importNewFaceOnCreate('こわれた値', now), true);
eq('★ 先の時刻（時計のずれ）は最初の取り込みとして扱う', N.importNewFaceOnCreate(ago(-1), now), false);
eq('★ 線は24時間', N.IMPORT_FIRST_PERIOD_HOURS, 24);

console.log(fail === 0 ? '\n★ すべて通った' : `\n★★ ${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
