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

if (fail) { console.log('\n★ '+fail+' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った');
