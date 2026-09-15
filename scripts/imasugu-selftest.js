// 「今すぐ」の人数の上限と有効時間（src/lib/imasugu.ts）の自己点検（第390便・2026-09-15）。
//
// ★★★ ここで危ないのは:
//   ・画面と保存で上限がずれる → チェックは付くのに、保存すると黙って切り落とされる
//   ・ワーク掲載の判定が緩い   → 契約の無い店まで10名になる
//   ・文言だけ古い数字のまま   → 「最大3名まで」と出るのに5名押せる
//
//   使い方:  npm run check:imasugu

const I = require(require('path').join(__dirname, '..', '_tmpcheck', 'imasugu.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 同時に出せる人数 ──');
eq('★ ふつうの店は5名', I.imasuguMax(false), 5);
eq('★★ フクエスワーク掲載店は10名', I.imasuguMax(true), 10);
eq('★ 数字は定数で持つ', [I.IMASUGU_MAX_BASE, I.IMASUGU_MAX_JOBS_BONUS], [5, 5]);

console.log('\n── 2. ★★ 掲載の判定は厳しく（true 以外は上乗せしない） ──');
eq('★★★ null は5名（★ 読めていない店を10名にしない）', I.imasuguMax(null), 5);
eq('★★ undefined は5名', I.imasuguMax(undefined), 5);
eq('★★ 文字列 "true" は5名（★ 値が壊れていても上乗せしない）', I.imasuguMax('true'), 5);
eq('★ 数字の1は5名', I.imasuguMax(1), 5);

console.log('\n── 3. ★ 上限に達したときの1行 ──');
eq('★ 5名の店', I.imasuguLimitNote(I.imasuguMax(false)), '今すぐは最大5名までです');
eq('★★ 10名の店', I.imasuguLimitNote(I.imasuguMax(true)), '今すぐは最大10名までです');
eq('★ 文言に「★」を混ぜない', /★/.test(I.imasuguLimitNote(5)), false);
eq('★ 内部の言葉を出さない', /imasugu|jobs|max/i.test(I.imasuguLimitNote(5)), false);

console.log('\n── 4. ★ 有効時間（第326便から変えていない） ──');
eq('★★ 45分', I.IMASUGU_WINDOW_MIN, 45);
{
  // ★ imasuguUntilISO は「いま + 45分」。★ 秒の丸めがあっても数分はずれない
  const until = Date.parse(I.imasuguUntilISO());
  const diffMin = (until - Date.now()) / 60000;
  eq('★ いまから45分後（±1分）', diffMin > 44 && diffMin < 46, true);
}

console.log(fail === 0 ? '\n★ すべて通った' : `\n★★ ${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
