// Google アナリティクス（GA4）をどこで読み込むか（src/lib/ga.ts）の自己点検（第1403便）。
//   使い方:  npm run check:ga
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'ga.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const ID = 'G-ABC123DEF4';

console.log('── 1. ホスト: fukues.com だけ ──');
eq('fukues.com', v.isGaHost('fukues.com'), true);
eq('www も同じ', v.isGaHost('www.fukues.com'), true);
eq('ポート・大文字', v.isGaHost('FUKUES.COM:443'), true);
eq('★ fukuescrm.com は読み込まない', v.isGaHost('fukuescrm.com'), false);
eq('★ conecf.com は読み込まない', v.isGaHost('conecf.com'), false);
eq('★ 店舗様の独自ドメインは読み込まない', v.isGaHost('example-shop.com'), false);
eq('★ 似た名前は読み込まない', v.isGaHost('fukues.com.example.com'), false);
eq('★ notfukues.com は読み込まない', v.isGaHost('notfukues.com'), false);
eq('localhost は読み込まない', v.isGaHost('localhost'), false);
eq('プレビューは読み込まない', v.isGaHost('este-portal-abc.vercel.app'), false);
eq('空は読み込まない', v.isGaHost(''), false);
eq('null は読み込まない', v.isGaHost(null), false);

console.log('── 2. パス: お客様向けページは数える ──');
for (const p of ['/', '/area/hakata', '/salon/labyrinth', '/salons', '/therapist/12', '/therapists', '/diary', '/diary/55',
  '/ranking', '/reviews', '/news', '/column/abc', '/glossary', '/glossary/kenzen-ten', '/about', '/listing', '/terms', '/privacy',
  '/contact', '/join', '/working', '/x', '/x/post/9', '/x/u/abc', '/x/search', '/x-shops', '/jobs', '/jobs/12', '/jobs/area/hakata', '/jobs/column/a']) {
  eq('数える ' + p, v.isGaExcludedPath(p), false);
}

console.log('── 3. パス: 管理・ログイン・合言葉つき・ひとりの画面は数えない ──');
for (const p of ['/admin', '/admin/salons', '/mypage', '/mypage/crm/customers', '/mypage/media', '/cast', '/cast/login', '/owner/dashboard',
  '/moderation', '/crm/login', '/conecf', '/conecf/home', '/login', '/forgot-password', '/reset-password', '/auth/callback',
  '/g/abcdef123456', '/g/done', '/g', '/salon-intake/tok123', '/member', '/member/vip-letters', '/saved',
  '/x/admin', '/x/login', '/x/signup', '/x/onboarding', '/x/messages', '/x/messages/7', '/x/notifications', '/x/settings', '/x/saved',
  '/jobs/saved', '/embed/ranking', '/hp/some-shop', '/hp/example-shop.com/admin', '/api/revalidate']) {
  eq('数えない ' + p, v.isGaExcludedPath(p), true);
}

console.log('── 4. パス: 区切りで見る（前方一致の取りこぼし・巻き込みが無い） ──');
eq('★ /glossary は /g に巻き込まれない', v.isGaExcludedPath('/glossary'), false);
eq('★ /x-shops は /x/... に巻き込まれない', v.isGaExcludedPath('/x-shops'), false);
eq('★ /casting は /cast に巻き込まれない', v.isGaExcludedPath('/casting'), false);
eq('★ /savedx は /saved に巻き込まれない', v.isGaExcludedPath('/savedx'), false);
eq('★ 大文字でも数えない', v.isGaExcludedPath('/G/AbCdEf'), true);
eq('★ 空は数えない側', v.isGaExcludedPath(''), true);
eq('★ null は数えない側', v.isGaExcludedPath(null), true);
eq('★ / で始まらないものは数えない側', v.isGaExcludedPath('g/abc'), true);

console.log('── 5. 測定ID の形 ──');
eq('正しい形', v.isValidGaId(ID), true);
eq('前後の空白は許す', v.isValidGaId(' ' + ID + ' '), true);
eq('★ 空は動かさない', v.isValidGaId(''), false);
eq('★ GTM- は違う', v.isValidGaId('GTM-ABC1234'), false);
eq('★ UA- は違う', v.isValidGaId('UA-12345-1'), false);
eq('★ 記号入りは違う（スクリプトに混ざらない）', v.isValidGaId("G-ABC');alert(1);//"), false);
eq('★ 小文字は違う', v.isValidGaId('G-abc123def4'), false);

console.log('── 6. まとめ ──');
eq('fukues.com のTOP', v.shouldRunGa(ID, 'fukues.com', '/'), true);
eq('★ 同意書は動かさない', v.shouldRunGa(ID, 'fukues.com', '/g/abcdef'), false);
eq('★ CRM のホストは動かさない', v.shouldRunGa(ID, 'fukuescrm.com', '/'), false);
eq('★ ID が空なら動かさない', v.shouldRunGa('', 'fukues.com', '/'), false);
eq('★ いまの GA_MEASUREMENT_ID は 空 か 正しい形', v.GA_MEASUREMENT_ID === '' || v.isValidGaId(v.GA_MEASUREMENT_ID), true);

console.log('── 7. アクリルスタンドの印とリンク（第1404便） ──');
eq('リンクの形', v.acrylicStandSalonHref(5), '/salon/5?utm_source=acrylic_stand&utm_medium=qr&utm_campaign=crm_consent&utm_content=salon');
eq('文字の番号でも同じ', v.acrylicStandSalonHref('12'), '/salon/12?' + v.ACRYLIC_STAND_UTM + '&utm_content=salon');
// ★ 第1655便: 本日のセラピスト
eq('★ セラピストのリンクの形', v.acrylicStandTherapistHref(77), '/therapist/77?' + v.ACRYLIC_STAND_UTM + '&utm_content=therapist');
eq('★ セラピスト: 空・0・記号は出さない', [v.acrylicStandTherapistHref(''), v.acrylicStandTherapistHref('0'), v.acrylicStandTherapistHref('7/../x'), v.acrylicStandTherapistHref(null)], [null, null, null, null]);
eq('★ 空は出さない', v.acrylicStandSalonHref(''), null);
eq('★ null は出さない', v.acrylicStandSalonHref(null), null);
eq('★ 0 は出さない', v.acrylicStandSalonHref('0'), null);
eq('★ 数字以外は出さない', v.acrylicStandSalonHref('5/../admin'), null);
eq('★ よそのアドレスは出さない', v.acrylicStandSalonHref('//evil.example'), null);
eq('★ 記号つきは出さない', v.acrylicStandSalonHref('5?x=1'), null);
eq('★ 印にお客様や予約の値が無い（3つだけ）', v.ACRYLIC_STAND_UTM.split('&').map((x) => x.split('=')[0]), ['utm_source', 'utm_medium', 'utm_campaign']);
eq('★ リンク先のお店ページは数える側', v.isGaExcludedPath('/salon/5'), false);

console.log('── 8. どこから来たか を安全にする（第1404便） ──');
eq('★ 同意書（合言葉入り）から → サイトの頭だけ', v.gaSafeReferrer('https://fukues.com/g/AbCdEf123456'), 'https://fukues.com/');
eq('★ 完了画面から → サイトの頭だけ', v.gaSafeReferrer('https://fukues.com/g/done?t=12:30&s=5'), 'https://fukues.com/');
eq('★ パスワード再設定から → サイトの頭だけ', v.gaSafeReferrer('https://fukues.com/reset-password?code=xyz'), 'https://fukues.com/');
eq('★ www でも同じ', v.gaSafeReferrer('https://www.fukues.com/salon-intake/tok'), 'https://fukues.com/');
eq('★ マイページから → サイトの頭だけ', v.gaSafeReferrer('https://fukues.com/mypage/crm/customers?customer=3'), 'https://fukues.com/');
eq('お客様向けページから → そのまま', v.gaSafeReferrer('https://fukues.com/ranking'), null);
eq('TOP から → そのまま', v.gaSafeReferrer('https://fukues.com'), null);
eq('Google 検索から → そのまま', v.gaSafeReferrer('https://www.google.com/'), null);
eq('よそのサイトの /g/… → そのまま（フクエスの話ではない）', v.gaSafeReferrer('https://example.com/g/abc'), null);
eq('空 → そのまま', v.gaSafeReferrer(''), null);
eq('null → そのまま', v.gaSafeReferrer(null), null);
eq('読めない文字列 → そのまま', v.gaSafeReferrer('android-app://com.google.android.gm'), null);

console.log(fail === 0 ? '\nALL OK' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
