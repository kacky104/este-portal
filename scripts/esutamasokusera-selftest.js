// 即セラの読み取りと判断（src/lib/esutamaSokuseraParse.ts）の自己点検（第143便・2026-09-04）。
//
// ★★★ ここで守りたいのは3つ。
//   ① 読めなかったものを「OFF」と決めつけない（★ 二重にONを打たない）
//   ② ★★ ひとこと呼びかけを読めなかったら打たない（★ 空で送ると本人の文が消える・実測）
//   ③ null（読めない）と ''（本人が空にしている）を混ぜない
//
//   使い方:  npm run check:esutamasokusera

const path = require('path');
const S = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaSokuseraParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ★ 実物に近い形（2026-09-04 実測: 文字のあいだにタグが挟まる）
const page = (st, msgAttr) =>
  '<div class="x"><p>現在のステータス</p><span class="big">' + st + '</span></div>'
  + '<input type="text" id="sokuthera-message" class="c-input"' + msgAttr + '>'
  + '<button id="sokuthera-start-btn">即セラをONにする</button>';

console.log('── 1. 状態を読む ──');
eq('★ OFF を読む', S.parseSokuseraPage(page('OFF', ' value="あ"')).status, 'off');
eq('★ ON を読む', S.parseSokuseraPage(page('ON', ' value="あ"')).status, 'on');
// ★★★ 読めなかったものを OFF と決めつけない（★ OFFだと思って打つと二重になる）
eq('★★★ 見つからなければ unknown', S.parseSokuseraPage('<div>なにもない</div>').status, 'unknown');
eq('★ 空でも落ちない', S.parseSokuseraPage('').status, 'unknown');

console.log('\n── 2. ★★★ 呼びかけ: null と 空文字を混ぜない ──');
eq('★ 値を読む', S.parseSokuseraPage(page('OFF', ' value="９月もお待ちしてます♡"')).message, '９月もお待ちしてます♡');
// ★★★ 本人が空にしている（value=""）は '' で返す。★ 打ってよい
eq('★★★ 本人が空なら空文字', S.parseSokuseraPage(page('OFF', ' value=""')).message, '');
// ★★★ value 属性そのものが無い＝読めなかった → null。★ 打たない
eq('★★★ value が無ければ null', S.parseSokuseraPage(page('OFF', '')).message, null);
eq('★ 欄そのものが無ければ null', S.parseSokuseraPage('<div>現在のステータス OFF</div>').message, null);
eq('★ 実体参照は戻す', S.parseSokuseraPage(page('OFF', ' value="A&amp;B"')).message, 'A&B');

console.log('\n── 3. ★★★ 打ってよいかの判断（★ 迷ったら打たない）──');
const d = (o) => S.decideSokuseraStart({ status: 'off', message: 'こんばんは', ...o });
eq('★ OFFで呼びかけが読めれば打つ', d({}).send, true);
eq('★ 送る文は読んだものそのまま', d({}).message, 'こんばんは');
// ★★ すでにONなら打ち直さない（★ 60分で相手が勝手に切る。★ 延長は要らない）
eq('★★★ すでにONなら打たない', d({ status: 'on' }).send, false);
eq('★ その理由は already_on', d({ status: 'on' }).reason, 'already_on');
// ★★★ 状態が読めないのに「たぶんOFF」で打たない
eq('★★★ 状態が読めなければ打たない', d({ status: 'unknown' }).send, false);
// ★★★ 2026-09-04 20:10 の事故。★ 空で送ると本人の呼びかけが【消える】（実測）
eq('★★★ 呼びかけが読めなければ打たない', d({ message: null }).send, false);
eq('★★ その理由が読める', d({ message: null }).note.includes('本人の文を消さない'), true);
// ★ 本人が空にしているのは【読めている】。★ 打ってよい
eq('★★★ 本人が空にしているなら打つ', d({ message: '' }).send, true);

console.log('\n── 4. ★ 送る本文 ──');
eq('★ message だけを送る', S.sokuseraStartBody('あ'), 'message=%E3%81%82');
eq('★ 空も送れる（★ 本人が空にしているとき）', S.sokuseraStartBody(''), 'message=');
// ★ 20文字を超えていても切らない（★ 本人が書いたもの。★ こちらで削らない）
eq('★★ 長くても切らない', decodeURIComponent(S.sokuseraStartBody('あ'.repeat(25)).slice(8)).length, 25);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
