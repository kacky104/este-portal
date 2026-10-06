// 即ヒメの読み違いの見張り（src/lib/ekichikaListParse.ts の sokuhimeMisread）の自己点検（第1255便・2026-10-06）。
//
// ★★★ ここで危ないのは:
//   ・枠の多い店で、正しい内容なのに止まる → フクエスの「今すぐ」に出なくなる（以前の「在籍の半数」の弁がこれだった）
//   ・読み違い（休みの方にも即ヒメの印）を通す → 出勤中の方が全員「今すぐ」になる
//
//   使い方:  npm run check:listsokuhime

const L = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaListParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const many = (n, status, sokuhime) => Array.from({ length: n }, () => ({ status, sokuhime }));

console.log('── 1. ★★★ 正しい内容は、即ヒメが何人でも止めない ──');
eq('★ ふつうの店（在籍30・出勤10・即ヒメ5）', L.sokuhimeMisread([...many(5, 'work', true), ...many(5, 'work', false), ...many(20, 'off', false)]).misread, false);
eq('★★★ 枠の多い店（在籍30・出勤22・即ヒメ20）＝以前の弁では止まっていた', L.sokuhimeMisread([...many(20, 'work', true), ...many(2, 'work', false), ...many(8, 'off', false)]).misread, false);
eq('★★ 出勤中の全員が即ヒメ（在籍20・出勤15・即ヒメ15）', L.sokuhimeMisread([...many(15, 'work', true), ...many(5, 'off', false)]).misread, false);
eq('★ 即ヒメが0人', L.sokuhimeMisread([...many(8, 'work', false), ...many(12, 'off', false)]).misread, false);
eq('★ 一覧が空', L.sokuhimeMisread([]), { misread: false, off: 0, offFlagged: 0 });

console.log('\n── 2. ★★★ 読み違い（休みの方にも印）は止める ──');
eq('★★★ 全員に印（在籍30・出勤10・休み20）', L.sokuhimeMisread([...many(10, 'work', true), ...many(20, 'off', true)]), { misread: true, off: 20, offFlagged: 20 });
eq('★★ 出勤が少ない日でも止める（出勤2・休み28）', L.sokuhimeMisread([...many(2, 'work', true), ...many(28, 'off', true)]).misread, true);
eq('★ 休みが1人で、その方に印', L.sokuhimeMisread([...many(9, 'work', true), ...many(1, 'off', true)]).misread, true);

console.log('\n── 3. ★★ 1人だけの想定外の表記では止めない ──');
eq('★★ 休み20人のうち1人だけ印', L.sokuhimeMisread([...many(5, 'work', true), ...many(19, 'off', false), ...many(1, 'off', true)]), { misread: false, off: 20, offFlagged: 1 });
eq('★ ちょうど半数は止めない（超えたら止める）', L.sokuhimeMisread([...many(4, 'off', true), ...many(4, 'off', false)]).misread, false);
eq('★ 半数を1人超えたら止める', L.sokuhimeMisread([...many(5, 'off', true), ...many(4, 'off', false)]).misread, true);

console.log('\n── 4. ★ 数えるのは「休み」と読めた方だけ ──');
eq('★★ 読めなかった方（unknown）の印は数えない', L.sokuhimeMisread([...many(6, 'unknown', true), ...many(10, 'off', false)]), { misread: false, off: 10, offFlagged: 0 });
eq('★ 休みが1人も居ない日は止めない（見分けられない）', L.sokuhimeMisread([...many(12, 'work', true)]), { misread: false, off: 0, offFlagged: 0 });

console.log('\n── 5. ★★ 実物の形の HTML を通す（パーサとつないで） ──');
const card = (id, name, cls, inner) =>
  `<li class="girl-box"><a href="/fukuoka/area175/style8/99999/${id}/"><p class="data-name ellipsis">${name}<span class="age">(25)</span></p>` +
  `<div class="waiting sokuiku ${cls === 'normal' ? ' normal ' : ''}"><ul class="md-state"><li class="waiting-cont ${cls}">${inner}</li></ul></div></a></figure></li>`;
const html =
  Array.from({ length: 18 }, (_, i) => card(100 + i, 'そく' + i, 'sokuiku', '17:00<span> ▶︎ </span>00:00')).join('') +
  Array.from({ length: 2 }, (_, i) => card(200 + i, 'でる' + i, 'today', '18:00<span> ▶︎ </span>01:00')).join('') +
  Array.from({ length: 6 }, (_, i) => card(300 + i, 'やすみ' + i, 'normal', '要TEL')).join('');
const parsed = L.parseEkichikaList(html, '99999');
eq('★ 26人読めた', parsed.length, 26);
eq('★★ 即ヒメ18・出勤20・休み6', [parsed.filter((c) => c.sokuhime && c.status === 'work').length, parsed.filter((c) => c.status === 'work').length, parsed.filter((c) => c.status === 'off').length], [18, 20, 6]);
eq('★★★ 外側の div に sokuiku があっても、休みの方には印を付けない', parsed.filter((c) => c.status === 'off' && c.sokuhime).length, 0);
eq('★★★ 在籍26のうち即ヒメ18（半数超え）でも止めない', L.sokuhimeMisread(parsed).misread, false);

console.log(fail === 0 ? '\n★ すべて通った' : `\n★★ ${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
