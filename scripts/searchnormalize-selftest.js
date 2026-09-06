// 検索用のかな正規化（src/lib/searchNormalize.ts）の自己点検（第177便）。
//
// ★★★ なぜ要るか
//   /mypage 出勤ページの「名前で探す」は【手元の一覧を絞る】だけなので、静かに外れる。
//   ★ 0件になっても「そういう名前の人はいない」と読めてしまい、間違いに気づけない。
//   ★★ 規則の正は DB の public.search_normalize（20260715_search_normalize.sql）。
//     ★ ここが食い違うと、TOPの検索バーと出勤ページで結果が変わる。
//
//   使い方:  npm run check:searchnormalize

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'searchNormalize.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// ── ひらがな ⇄ カタカナ ──
eq('さくら で サクラ に当たる', m.matchesSearch('サクラ', 'さくら'), true);
eq('サクラ で さくら に当たる', m.matchesSearch('さくら', 'サクラ'), true);
eq('半角カナでも当たる', m.matchesSearch('さくら', 'ｻｸﾗ'), true);

// ── 濁点・長音・記号・空白 ──
eq('長音の有無を無視する', m.matchesSearch('ルナー', 'るな'), true);
eq('中黒を無視する', m.matchesSearch('ア・カリ', 'あかり'), true);
eq('空白を無視する', m.matchesSearch('さくら もも', 'さくらもも'), true);
eq('濁点の有無を無視する', m.matchesSearch('ガク', 'かく'), true);
// ★ づ(ツ+゙) と ず(ス+゙) は元の字がちがう。★ DBと同じ挙動＝当たらない
eq('★ づ と ず は別（DBと同じ）', m.matchesSearch('ユズキ', 'ゆづき'), false);

// ── 部分一致 ──
eq('途中の一致でも当たる', m.matchesSearch('エレナ', 'れな'), true);
eq('無い名前には当たらない', m.matchesSearch('あかり', 'あき'), false);

// ── 空・欠け ──
eq('★ 空の検索は全部を通す（0件に倒さない）', m.matchesSearch('ナナ', ''), true);
eq('★ 空白だけの検索も全部を通す', m.matchesSearch('ナナ', '   '), true);
eq('★ 名前が無い人は、空の検索なら通る', m.matchesSearch(null, ''), true);
eq('★ 名前が無い人は、検索語があれば外れる', m.matchesSearch(null, 'さくら'), false);

// ── ★★ 漢字の読みは対象外（DBと同じ。できないことを書き残す）──
eq('★★ 桜 では さくら に当たらない', m.matchesSearch('さくら', '桜'), false);
eq('★★ さくら では 桜 に当たらない', m.matchesSearch('桜', 'さくら'), false);

// ── 正規化そのもの ──
eq('正規化: さくら → サクラ', m.searchNormalize('さくら'), 'サクラ');
eq('正規化: ガ → カ', m.searchNormalize('ガ'), 'カ');
eq('正規化: 空白は消える', m.searchNormalize(' さ く ら '), 'サクラ');
eq('正規化: null は空', m.searchNormalize(null), '');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
