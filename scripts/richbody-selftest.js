// 駅ちか新着情報の本文の「全体の色の枠」と style の掃除（src/lib/richBody.ts）の自己点検（第1966便）。
//   使い方:  npm run check:richbody
const a = require(require('path').join(__dirname, '..', '_tmpcheck', 'richBody.js'));
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const W = { bg: '#ffffff', fg: '#000000' };
const wrapped = '<div style="background-color:#ffffff;color:#000000;padding:10px;">あ<br>い</div>';
eq('包む', a.wrapRichBody('あ<br>い', W), wrapped);
eq('枠が無ければそのまま', a.wrapRichBody('あ', null), 'あ');
eq('中身が空なら包まない', a.wrapRichBody('', W), '');
eq('色が読めなければ包まない', a.wrapRichBody('あ', { bg: 'red', fg: '#000000' }), 'あ');
eq('分ける', a.splitRichBody(wrapped), { wrap: W, inner: 'あ<br>い' });
eq('包んで分けると元に戻る', a.splitRichBody(a.wrapRichBody('<div>1行目</div><div>2行目</div>', W)), { wrap: W, inner: '<div>1行目</div><div>2行目</div>' });
eq('枠の無い本文', a.splitRichBody('あ<br>い'), { wrap: null, inner: 'あ<br>い' });
// 同じ形の div が2つ並んでいるだけの本文は、枠ではない（最初の div の閉じが最後ではない）
const two = '<div style="background-color:#ffffff;color:#000000;padding:10px;">あ</div><div>い</div>';
eq('枠が先頭だけの本文は枠として扱わない', a.splitRichBody(two), { wrap: null, inner: two });
eq('ふつうの文', a.splitRichBody('本日も元気に営業中です'), { wrap: null, inner: '本日も元気に営業中です' });

eq('inherit は落とす', a.cleanStyleText('font-weight: inherit; margin: 0px; color: rgb(255, 255, 255); user-select: auto !important;'), 'margin:0px;color:rgb(255, 255, 255)');
eq('グラデーションの背景は残す', a.cleanStyleText('background: -webkit-gradient(linear, 0% 0%, 100% 100%, from(rgb(255, 110, 2)), to(rgb(255, 255, 0)))'), 'background:-webkit-gradient(linear, 0% 0%, 100% 100%, from(rgb(255, 110, 2)), to(rgb(255, 255, 0)))');
eq('外の画像を引く背景は落とす', a.cleanStyleText('background: url(https://example.com/a.png); color: red'), 'color:red');
eq('位置の指定は落とす', a.cleanStyleText('position: fixed; top: 0; font-size: 20px'), 'font-size:20px');
eq('危ない書き方は落とす', a.cleanStyleText('width: expression(alert(1)); color: blue'), 'color:blue');
eq('空', a.cleanStyleText(''), '');

eq('ソースは読みやすく改行', a.htmlToSource('<div>あ</div><div>い<br>う</div>'), '<div>あ</div>\n<div>い<br>\nう</div>');
eq('ソースを1行に戻す', a.sourceToHtml('<div>あ</div>\n  <div>い<br>\nう</div>\n'), '<div>あ</div><div>い<br>う</div>');
eq('戻して同じ', a.sourceToHtml(a.htmlToSource('<div>あ</div><div>い<br>う</div>')), '<div>あ</div><div>い<br>う</div>');

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
