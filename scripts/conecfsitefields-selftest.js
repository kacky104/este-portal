// コネックエフ「女性プロフィールのコメント・Q&A・各サイト項目」（src/lib/conecfSiteFields.ts）の自己点検（第414便）。
//   使い方:  npm run check:conecfsitefields
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfSiteFields.js'));
let fail = 0;
const eq = (name, got, want) => { const a=JSON.stringify(got),b=JSON.stringify(want); if(a!==b){console.log('NG '+name+'\n   got  '+a+'\n   want '+b);fail++;}else console.log('ok '+name); };

console.log('── 1. 候補の数（実物）──');
eq('駅ちかのジャンル候補は61', v.EKICHIKA_GENRES.length, 61);
eq('駅ちかの優先タグ候補は10', v.EKICHIKA_P_GENRES.length, 10);
eq('エステ魂の特徴候補は27', v.ESUTAMA_TYPES.length, 27);

console.log('── 2. コメント ──');
eq('前後の空白を落とす', v.normalizeComments({ catchphrase: ' 癒し ' }).value.catchphrase, '癒し');
eq('★ キャッチ17字はNG', v.normalizeComments({ catchphrase: 'あ'.repeat(17) }).ok, false);
eq('★ 女の子コメント500字はOK', v.normalizeComments({ girlComment: 'あ'.repeat(500) }).ok, true);
eq('★ 駅ちかは200字を超えると注意', v.overSites('あ'.repeat(201), v.COMMENT_SITE_LIMITS.girlComment), ['駅ちか（200字まで）']);
eq('★ お店コメント600字はエステ魂だけ注意', v.overSites('あ'.repeat(600), v.COMMENT_SITE_LIMITS.shopComment), ['エステ魂（500字まで）']);

console.log('── 3. Q&A ──');
eq('末尾の空を落とす', v.normalizeQa([{q:'好き?',a:'はい'},{q:'',a:''}]).value, [{q:'好き?',a:'はい'}]);
eq('★ 11問目は捨てる', v.normalizeQa(Array.from({length:12},(_, i)=>({q:'q'+i,a:'a'}))).value.length, 10);
eq('★ 51字はNG', v.normalizeQa([{q:'あ'.repeat(51),a:''}]).ok, false);

console.log('── 4. 駅ちか ──');
const e = v.normalizeEkichikaFields({ pGenres:['no1','顔出し','ロリ系','高身長','謎'], genres:['癒し系','no1','癒し系','謎'], rookie:'2', constellation:'しし', options:'  パウダー  ' }).value;
eq('★ 優先タグは3つまで・候補外は捨てる', e.pGenres, ['no1','顔出し','ロリ系']);
eq('★ ジャンルは重複なし・選んだ順', e.genres, ['癒し系','no1']);
eq('新人・体験入店', e.rookie, '2');
eq('星座', e.constellation, 'しし');
eq('オプションは空白を落とす', e.options, 'パウダー');
eq('★ ジャンル20個は19に', v.normalizeEkichikaFields({ genres: v.EKICHIKA_GENRES.slice(0,20) }).value.genres.length, 19);
eq('★ 知らない rookie は付けない', v.normalizeEkichikaFields({ rookie:'9' }).value.rookie, '');
eq('★ オプション146字はNG', v.normalizeEkichikaFields({ options:'あ'.repeat(146) }).ok, false);

console.log('── 5. エステ魂 ──');
const s = v.normalizeEsutamaFields({ types:['新人','美人系','小柄','色白肌','上品'], experience:'3', bodyStyle:'普通', answers:{ food:'ラーメン', holiday:'' }, sns:{ twitter:'https://x.com/a' } }).value;
eq('★ 特徴は4つまで', s.types, ['新人','美人系','小柄','色白肌']);
eq('空の答えは持たない', s.answers, { food:'ラーメン' });
eq('SNS', s.sns, { twitter:'https://x.com/a' });
eq('★ エステ歴に文字はNG', v.normalizeEsutamaFields({ experience:'3年' }).ok, false);
eq('★ 質問21字はNG', v.normalizeEsutamaFields({ answers:{ food:'あ'.repeat(21) } }).ok, false);
eq('★ 知らない体型は未選択', v.normalizeEsutamaFields({ bodyStyle:'激やせ' }).value.bodyStyle, '');

console.log('── 6. 振り分け ──');
eq('★ ほかのサイトは断る', v.normalizeSiteFields('esulove', {}).ok, false);

if (fail) { console.log('\n★ '+fail+' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
