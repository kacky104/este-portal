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

if (fail) { console.log('\n★ '+fail+' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った');
