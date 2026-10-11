// お店が 0件のエリアページを検索に出さない（src/app/lib/areas.ts）の自己点検（第1396便・2026-10-11）。
//
// ★★★ ここで守りたいこと
//   ① 店が 0件のエリアは検索に出さない／1件でもあれば出す
//   ② 数が分からない（読めなかった）ときは【出す】側に倒す（店のあるエリアまで検索から外さない）
//   ③ 数え方は画面の一覧（salonInArea）と同じ（古いエリアの値・第2エリア・出張対応を含む）
//   ④ エリアページ・出勤中のページ・サイトマップが、同じ物差しを使っている
//
//   使い方:  npm run check:areaindex

const path = require('path');
const fs = require('fs');
const A = require(path.join(__dirname, '..', '_tmpcheck', 'areas.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 出してよいか ──');
eq('★★★ 0件は出さない', A.isAreaPageIndexable(0), false);
eq('★★★ 1件以上は出す', [A.isAreaPageIndexable(1), A.isAreaPageIndexable(8)], [true, true]);
eq('★★★ 分からない（null・undefined）ときは出す側に倒す', [A.isAreaPageIndexable(null), A.isAreaPageIndexable(undefined)], [true, true]);

console.log('\n── 2. ★★★ 数え方（画面の一覧と同じ）──');
const rows = [
  { area: '博多・天神・中洲', area2: '', dispatchType: 'none' },
  { area: '博多・住吉', area2: null, dispatchType: 'none' },            // 古い値（第1373便より前）
  { area: '中洲・天神・薬院', area2: '', dispatchType: 'available' },    // 古い値＋出張もできる
  { area: '久留米', area2: '博多・天神・中洲', dispatchType: 'none' },   // 第2エリア
];
eq('★★★ 古いエリアの値・第2エリアも、今のエリアとして数える', A.countSalonsInArea(rows, '博多・天神・中洲'), 4);
eq('久留米は1件・北九州は0件・その他は0件', [A.countSalonsInArea(rows, '久留米'), A.countSalonsInArea(rows, '北九州・小倉'), A.countSalonsInArea(rows, '福岡県その他')], [1, 0, 0]);
eq('★★ 出張は「出張ができる店」を数える（dispatch_type が none 以外）', A.countSalonsInArea(rows, '出張'), 1);
eq('全域は全件', A.countSalonsInArea(rows, A.ALL_AREA), 4);
eq('空・null でも落ちない', [A.countSalonsInArea([], '久留米'), A.countSalonsInArea(null, '久留米')], [0, 0]);
// ★ 10/11 の本番の形: 8店ぜんぶ博多・天神・中洲、出張対応は0
const prod = Array.from({ length: 8 }, () => ({ area: '博多・天神・中洲', area2: '', dispatchType: 'none' }));
eq('★★★ 10/11 の本番の形: 出すのは 博多・天神・中洲 だけ',
  A.AREA_SLUGS_LIST.filter((slug) => A.isAreaPageIndexable(A.countSalonsInArea(prod, A.areaFromSlug(slug)))), ['hakata-tenjin-nakasu']);

console.log('\n── 3. 0件のエリアから案内する先 ──');
eq('★★ 店のあるエリアだけ（自分・全域・出張は除く・並びは AREA_ORDER）', A.areasWithSalons(rows, '北九州・小倉'), ['博多・天神・中洲', '久留米']);
eq('自分は出さない', A.areasWithSalons(rows, '久留米'), ['博多・天神・中洲']);
eq('どこにも無ければ空（「すべてのお店を見る」だけが出る）', A.areasWithSalons([], '久留米'), []);

console.log('\n── 4. ★★★ ページとサイトマップが同じ物差しを使っている ──');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const area = read('src', 'app', 'area', '[slug]', 'page.tsx');
const working = read('src', 'app', 'working', '[area]', 'page.tsx');
const sitemap = read('src', 'app', 'sitemap.ts');
const loader = read('src', 'app', 'lib', 'areaSalonRows.ts');
eq('★★★ エリアページ・出勤中のページが、0件なら noindex・あれば canonical',
  [area, working].map((s) => /indexable\s*\? \{ alternates: \{ canonical: [^\n]+? \} \}\s*: \{ robots: \{ index: false, follow: true \}, alternates: \{ canonical: null \} \}/.test(s)), [true, true]);
eq('★★★ 3か所とも isAreaPageIndexable で決めている（式を別に書かない）', [area, working, sitemap].map((s) => /isAreaPageIndexable\(/.test(s)), [true, true, true]);
eq('★★★ 数が読めなかったら null を渡している（0 と決めつけない）', [area, working, sitemap].map((s) => /\? countSalonsInArea\([^)]*\) : null\)/.test(s)), [true, true, true]);
eq('★★★ サイトマップは /area と /working の両方を、出してよいエリアだけにしている',
  [/indexableAreaSlugs\.map\(\(slug\) => \(\{ url: `\$\{SITE_URL\}\/working\//.test(sitemap), /areaPageEntries: MetadataRoute\.Sitemap = indexableAreaSlugs\.map/.test(sitemap), /AREA_SLUGS_LIST\.map\(\(slug\) => \(\{\s*url: `\$\{SITE_URL\}\/(area|working)\//.test(sitemap)], [true, true, false]);
eq('★★ 数える条件は一覧（fetchSalons）と同じ: 非表示でない・standard', [/\.eq\('is_hidden', false\)/.test(loader), /\.eq\('listing_plan', 'standard'\)/.test(loader), /return null;/.test(loader)], [true, true, true]);
eq('★ 0件のときの案内を、エリアページが渡している', [/emptyNote=\{emptyNote\}/.test(area), /\{emptyNote\}/.test(read('src', 'app', 'components', 'ShuffledSalons.tsx'))], [true, true]);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
