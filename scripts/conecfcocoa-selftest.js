// コネックエフのココア店長ブログ（src/lib/conecfCocoa.ts）の自己点検（第404便）。
//   使い方:  npm run check:conecfcocoa
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfCocoa.js'));
let fail = 0;
const eq = (name, got, want) => { const a=JSON.stringify(got),b=JSON.stringify(want); if(a!==b){console.log('NG '+name+'\n   got  '+a+'\n   want '+b);fail++;}else console.log('ok '+name); };

console.log('── 1. 文字数 ──');
eq('全角は2', v.widthCount('あい'), 4);
eq('半角は1', v.widthCount('abc'), 3);
eq('★ タイトル48全角はOK', v.titleTooLong('あ'.repeat(48)), false);
eq('★ タイトル49全角はNG', v.titleTooLong('あ'.repeat(49)), true);

console.log('── 2. 1日1回の判定 ──');
// salonId=6 → autoPostMinuteOfDay = (6*337)%1440 = 2022%1440 = 582分 → 6:00+582 = 15:42
const base = { salonId: 6, enabled: true, activeCount: 3, lastAutoDay: null };
const at = (h,m)=>new Date(Date.UTC(2026,8,17, (h-9+24)%24, m)); // JST h:m → UTC
eq('★ 無効は出さない', v.shouldPostCocoa({...base, enabled:false, now:at(16,0)}).post, false);
eq('★ テンプレ0は出さない', v.shouldPostCocoa({...base, activeCount:0, now:at(16,0)}).post, false);
eq('★ 割り当て時刻(15:42)前は出さない', v.shouldPostCocoa({...base, now:at(15,0)}).post, false);
eq('割り当て時刻を過ぎたら出す', v.shouldPostCocoa({...base, now:at(16,0)}).post, true);
eq('★ 今日もう出したら出さない', v.shouldPostCocoa({...base, lastAutoDay:'2026-09-17', now:at(16,0)}).post, false);

console.log('── 3. 選ぶ（古い順）──');
const T=(id,last,so=0)=>({id,title:'t'+id,body:'b',imageUrl:null,isActive:true,sortOrder:so,lastPostedAt:last});
eq('未投稿を先に', v.pickCocoaTemplate([T(1,'2026-09-16T00:00:00Z'),T(2,null)]).id, 2);
eq('古い順', v.pickCocoaTemplate([T(1,'2026-09-16T10:00:00Z'),T(2,'2026-09-15T10:00:00Z')]).id, 2);
eq('★ 非公開は選ばない', v.pickCocoaTemplate([{...T(1,null),isActive:false},T(2,'2026-09-16T00:00:00Z')]).id, 2);
eq('全部非公開は null', v.pickCocoaTemplate([{...T(1,null),isActive:false}]), null);

console.log('── 4. ★★★ 第1318便: 送る本文は、改行を <br> にする（ココアは本文を HTML として表示する）──');
{
  const m = v.cocoaMailBody;
  eq('★★★ 改行1つ → <br> 1つ（改行そのものも残す）', m('1行目\n2行目'), '1行目<br>\n2行目');
  eq('★★★ 空の行は空の行のまま（段落の間があく）', m('挨拶です。\n\n【給与】\n70分15,000円'), '挨拶です。<br>\n<br>\n【給与】<br>\n70分15,000円');
  eq('★ 最後の行には足さない', m('a\nb').endsWith('b'), true);
  eq('★ 1行だけなら何も足さない', m('改行なしの本文'), '改行なしの本文');
  eq('★ 空なら空', [m(''), m(null), m('\n\n')], ['', '', '']);
  eq('★★ 末尾の改行・空白は落とす（記事の終わりに空の行を作らない）', m('a\nb\n\n  \n'), 'a<br>\nb');
  eq('★ 頭の空行は落とす', m('\n\na\nb'), 'a<br>\nb');
  eq('★★ Windows の改行（\\r\\n）も同じ', m('a\r\nb\r\n\r\nc'), 'a<br>\nb<br>\n<br>\nc');
  // ★ 手で <br> を打ったテンプレ（ラビリンス様・10/8 の「✨…セラピスト募集✨」）を二重に改行しない
  eq('★★★ 行の終わりにもう <br> があれば足さない',
    m('大募集！<br>\nお待ちしております。<br>\n<br><br>\n福岡トップクラスの報酬額\n・MAX報酬'),
    '大募集！<br>\nお待ちしております。<br>\n<br><br>\n福岡トップクラスの報酬額<br>\n・MAX報酬');
  eq('★ <br/>・<BR> ・</p> で終わる行にも足さない', m('a<br/>\nb<BR>\n<p>c</p>\nd'), 'a<br/>\nb<BR>\n<p>c</p>\nd');
  eq('★ 行の途中の <br> は関係ない（行の終わりだけ見る）', m('a<br>b\nc'), 'a<br>b<br>\nc');
  eq('★ ほかの文字には触らない（& や記号）', m('A&B\n※注意 12:00～19:00'), 'A&B<br>\n※注意 12:00～19:00');
  // ★ 文字数は【送る形】で数える（1改行につき半角4文字ぶん増える）
  eq('★★ 長さの判定は送る形で数える', [v.bodyTooLong('あ'.repeat(3333)), v.bodyTooLong(('あ'.repeat(10) + '\n').repeat(2000))], [false, true]);

  const fs = require('fs'), path = require('path');
  const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r/g, '');
  eq('★★★ メールの本文は cocoaMailBody を通す', /text: cocoaMailBody\(pick\.body \?\? ''\)/.test(src('src/app/lib/conecf/cocoaPost.ts')), true);
  eq('★★ 画面の「長すぎ」も、保存のときと同じ関数', /const bOver = bodyTooLong\(body\);/.test(src('src/app/conecf/cocoa/page.tsx')), true);
}

console.log('── 5. ★★★ 第1319便: 絵文字は番号の書き方にして送る（そのままではココアのメール投稿で落ちる）──');
{
  const m = v.cocoaMailBody;
  eq('★★★ 絵文字（U+10000 以上）は &#番号; にする', m('💸🌟📋'), '&#128184;&#127775;&#128203;');
  eq('★★ 文の中の絵文字も、改行と一緒に', m('💸 報酬額\n・MAX'), '&#128184; 報酬額<br>\n・MAX');
  eq('★★ ✨ ⭐ ♪ • など U+FFFF までの記号は、そのまま', m('✨⭐♪•※【】～'), '✨⭐♪•※【】～');
  eq('★ つなぎの文字（ZWJ・異体字の印）はそのまま残す', m('\u{1F64B}‍♀️'), '&#128587;‍♀️');
  eq('★ 手で打った番号の書き方は、二重に変えない', m('&#128184;'), '&#128184;');
  eq('★ 日本語・英数字には触らない', m('セラピスト募集 THE LABYRINTH 70分15,000円'), 'セラピスト募集 THE LABYRINTH 70分15,000円');
  // ★ 文字数は送る形で数える（絵文字1つ＝半角9〜10文字ぶん）
  eq('★ 長さの判定も送る形で', v.bodyTooLong('💸'.repeat(1200)), true);
}

console.log('── 6. ★★★ 第1320便: 文字の飾り（色・大きさ・太字）は印で持ち、送るときにタグにする ──');
{
  const h = v.cocoaMarksToHtml, m = v.cocoaMailBody;
  eq('使える飾りは8つ（色5・大きさ2・太字）', v.COCOA_MARKS.map((x) => x.key), ['赤', 'ピンク', 'オレンジ', '青', '緑', '大', '特大', '太字']);
  // ★★★ ココアのメールの入口は " の前に \ を付けて壊す（10/8 の試し投稿）。作るタグに " を入れない・値に空白を入れない
  const allTags = v.COCOA_MARKS.map((x) => h('[' + x.key + ']あ[/' + x.key + ']')).join('');
  eq('★★★ 作るタグに " も \' も入らない', /["']/.test(allTags), false);
  eq('★★★ 属性の値に空白が入らない', /<[a-z]+ [^>]* [^>]*>/.test(allTags), false);
  eq('★★★ 色: 試し投稿で通った形（style=color:#…）', h('[赤]高収入[/赤]'), '<span style=color:#FF0000>高収入</span>');
  eq('★★★ 大きさ: 試し投稿で通った形（style=font-size:…px）', h('[大]大募集[/大]'), '<span style=font-size:20px>大募集</span>');
  eq('★★ 太字は <strong>', h('[太字]日給3万〜7万円[/太字]'), '<strong>日給3万〜7万円</strong>');
  eq('★★ 重ねがけ（色＋大きさ＋太字）', h('[赤][特大][太字]急募[/太字][/特大][/赤]'), '<span style=color:#FF0000><span style=font-size:26px><strong>急募</strong></span></span>');
  eq('★ 「大」と「特大」を取り違えない', h('[特大]A[/特大][大]B[/大]'), '<span style=font-size:26px>A</span><span style=font-size:20px>B</span>');
  eq('★ 文の途中だけに付けられる', h('報酬は[赤]70分15,000円[/赤]です'), '報酬は<span style=color:#FF0000>70分15,000円</span>です');
  // ★ 対にならない印は、置き換えずに文字のまま残す（壊れたタグを送らない・見え方の確認で気づける）
  eq('★★★ 開きだけの印は文字のまま', h('[赤]閉じ忘れ'), '[赤]閉じ忘れ');
  eq('★★★ 閉じだけの印は文字のまま', h('開き忘れ[/赤]'), '開き忘れ[/赤]');
  eq('★★ 食い違った閉じ（[赤]…[/青]）は、どちらも文字のまま', h('[赤]あ[/青]'), '[赤]あ[/青]');
  eq('★★ 内側の閉じ忘れは文字に戻し、外側は効かせる', h('[赤]あ[大]い[/赤]'), '<span style=color:#FF0000>あ[大]い</span>');
  eq('★ 中身が空の印は捨てる', h('前[赤][/赤]後'), '前後');
  eq('★ 知らない名前は印とみなさない（【】や [ ] を使った文を壊さない）', h('[紫]あ[/紫] [1] 【給与】'), '[紫]あ[/紫] [1] 【給与】');
  eq('★ 印の無い本文は1文字も変わらない', h('普通の文\n2行目 <br> & 💸'), '普通の文\n2行目 <br> & 💸');

  // 送る形（改行・絵文字と一緒に）
  eq('★★★ 送る本文: 印→タグ、改行→<br>、絵文字→番号', m('💸[赤]高収入[/赤]\n[大]大募集[/大]'),
    '&#128184;<span style=color:#FF0000>高収入</span><br>\n<span style=font-size:20px>大募集</span>');
  eq('★★ 行をまたいだ飾りの中の改行も <br> になる', m('[赤]1行目\n2行目[/赤]'), '<span style=color:#FF0000>1行目<br>\n2行目</span>');
  eq('★★ 送る本文に " が残らない（印だけで書いた本文）', /"/.test(m('[赤]あ[/赤]\n[特大][太字]い[/太字][/特大]')), false);

  // 手で打ったタグの " を外す
  const u = v.cocoaUnquoteAttrs;
  eq('★★★ style="…" を、囲まない形に直す（試し投稿で壊れた書き方 → 通った書き方）', u('<span style="color:#FF0000;">赤</span>'), '<span style=color:#FF0000>赤</span>');
  eq('★★ 値の中の空白を詰める', u('<span style="color: #FF0000; font-size: 20px;">a</span>'), '<span style=color:#FF0000;font-size:20px>a</span>');
  eq('★★ 一重の引用符も', u("<strong style='color:#e58aaa'>a</strong>"), '<strong style=color:#e58aaa>a</strong>');
  eq('★ font タグの属性も', u('<font color="#FF0000" size="5">a</font>'), '<font color=#FF0000 size=5>a</font>');
  eq('★★ 空白の要る値は触らない（直せないものを壊さない）', u('<span style="font-family: MS Gothic">a</span>'), '<span style="font-family: MS Gothic">a</span>');
  eq('★★ = を含む値（リンクの URL など）は触らない', u('<a href="https://example.com/?a=1">a</a>'), '<a href="https://example.com/?a=1">a</a>');
  eq('★ タグの外の " には触らない', u('彼女は "安心" と言った <br>'), '彼女は "安心" と言った <br>');
  eq('★★ 送る本文でも、手で打った " は外れる', m('<span style="color:#FF0000;">赤</span>'), '<span style=color:#FF0000>赤</span>');

  // 画面
  eq('★ 飾りを外す: 印だけ消えて文字は残る', v.stripCocoaMarks('[赤]あ[/赤][大]い[/大] [1]'), 'あい [1]');
  eq('★★ 見え方の確認の色・大きさは、送る形と同じ値', [v.cocoaMarkStyle('赤'), v.cocoaMarkStyle('特大'), v.cocoaMarkStyle('太字')], [{ color: '#FF0000' }, { fontSize: '26px' }, { fontWeight: 'bold' }]);
  eq('★ 木: 文字と飾りに分かれる', v.parseCocoaMarks('a[赤]b[/赤]c'), [{ t: 'text', v: 'a' }, { t: 'mark', k: '赤', c: [{ t: 'text', v: 'b' }] }, { t: 'text', v: 'c' }]);

  // 「飾りを外す」: 色の付いた文字だけを選んでも、前後の印ごと外せる
  const t1 = '前[赤][大]文字[/大][/赤]後';
  const ex = v.expandCocoaSelection(t1, t1.indexOf('文字'), t1.indexOf('文字') + 2);
  eq('★★ 選んだ範囲を、すぐ外側の印まで広げる', t1.slice(ex.s, ex.e), '[赤][大]文字[/大][/赤]');
  eq('★ 印がくっついていなければ広げない', v.expandCocoaSelection('a[赤]b[/赤]c', 0, 1), { s: 0, e: 1 });
  eq('★ 広げて外すと、文字だけ残る', t1.slice(0, ex.s) + v.stripCocoaMarks(t1.slice(ex.s, ex.e)) + t1.slice(ex.e), '前文字後');

  const fs = require('fs'), path = require('path');
  const page = fs.readFileSync(path.join(__dirname, '..', 'src/app/conecf/cocoa/page.tsx'), 'utf8').replace(/\r/g, '');
  eq('★★★ 画面の見え方の確認は、送る形と同じ木（parseCocoaMarks）から作る', /parseCocoaMarks\(body\)/.test(page), true);
  eq('★★★ 見え方の確認に dangerouslySetInnerHTML を使わない（打った文字をそのまま HTML にしない）', /dangerouslySetInnerHTML/.test(page), false);
  eq('★★ ボタンは COCOA_MARKS から作る（色を足すのは lib の1行）', /COCOA_MARKS\.filter\(/.test(page), true);
}

if (fail) { console.log('\n★ '+fail+' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った');
