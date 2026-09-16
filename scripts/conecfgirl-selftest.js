// コネックエフの女性の値（src/lib/conecfGirl.ts）の自己点検（第398便）。
//   使い方:  npm run check:conecfgirl
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfGirl.js'));
const bt = require(require('path').join(__dirname, '..', '_tmpcheck', 'bodyType.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const today = new Date(2026, 8, 17); // 2026-09-17

console.log('── 1. body_type の形（★ /mypage・公開ページと同じ読み方で読める）──');
const s1 = v.bodyTypeFromSizes({ height: 160, bust: 89, cup: 'F', waist: 56, hip: 85 });
eq('全部', s1, 'T160 B89(F) W56 H85');
eq('★ parseBodyType で読み戻せる', bt.parseBodyType(s1), { height: '160', bust: '89', cup: 'F', waist: '56', hip: '85' });
eq('カップ無し', v.bodyTypeFromSizes({ height: null, bust: 85, cup: null, waist: null, hip: null }), 'B85');
eq('★ バスト無しでカップだけは書かない', v.bodyTypeFromSizes({ height: 150, bust: null, cup: 'C', waist: null, hip: null }), 'T150');
eq('何も無い', v.bodyTypeFromSizes({ height: null, bust: null, cup: null, waist: null, hip: null }), '');

console.log('── 2. 年齢 ──');
eq('誕生日前', v.ageFromBirthDate('2000-09-18', today), 25);
eq('誕生日当日', v.ageFromBirthDate('2000-09-17', today), 26);
eq('読めない', v.ageFromBirthDate('2000/09/17', today), null);

console.log('── 3. 確かめ ──');
const ok = v.normalizeConecfGirl({ name: ' さら ', height: '160', bust: 89, cup: 'F', waist: '56', hip: '85', style: 'スレンダー', bloodType: 'AB', isNewFace: true }, today);
eq('ふつう', ok.ok && [ok.value.name, ok.value.height, ok.value.cup, ok.value.style, ok.value.bloodType, ok.value.isNewFace], ['さら', 160, 'F', 'スレンダー', 'AB', true]);
eq('★ 名前が空は断る', v.normalizeConecfGirl({ name: '  ' }, today).ok, false);
eq('★ 名前11文字は断る', v.normalizeConecfGirl({ name: 'あいうえおかきくけこさ' }, today).ok, false);
eq('名前10文字は通す', v.normalizeConecfGirl({ name: 'あいうえおかきくけこ' }, today).ok, true);
eq('★ 身長が範囲外は断る', v.normalizeConecfGirl({ name: 'a', height: 300 }, today).ok, false);
eq('★ 小数は断る', v.normalizeConecfGirl({ name: 'a', bust: '85.5' }, today).ok, false);
eq('★ 知らないカップは捨てる', (() => { const r = v.normalizeConecfGirl({ name: 'a', cup: 'ZZ' }, today); return r.ok && r.value.cup; })(), null);
eq('★ 知らないスタイルは捨てる', (() => { const r = v.normalizeConecfGirl({ name: 'a', style: '謎' }, today); return r.ok && r.value.style; })(), null);
eq('空欄は null', (() => { const r = v.normalizeConecfGirl({ name: 'a', height: '' }, today); return r.ok && r.value.height; })(), null);
eq('生年月日と連動', (() => { const r = v.normalizeConecfGirl({ name: 'a', birthDate: '2000-01-01', ageFromBirth: true, age: 40 }, today); return r.ok && r.value.age; })(), 26);
eq('★ 連動なのに生年月日なしは断る', v.normalizeConecfGirl({ name: 'a', ageFromBirth: true }, today).ok, false);
eq('★ 18歳未満の生年月日は断る', v.normalizeConecfGirl({ name: 'a', birthDate: '2010-01-01', ageFromBirth: true }, today).ok, false);
eq('★ 年齢17は断る', v.normalizeConecfGirl({ name: 'a', age: 17 }, today).ok, false);
eq('★ 変な日付は断る', v.normalizeConecfGirl({ name: 'a', joinedOn: '2026-13-40' }, today).ok, false);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った');
