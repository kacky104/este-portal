// フクエスCRM の振り分け（src/lib/crmHost.ts）の自己点検（第631便）。
//   使い方:  npm run check:crmhost
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'crmHost.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. fukuescrm.com は /mypage/crm へ rewrite ──');
eq('トップ', v.decideCrmRoute('fukuescrm.com', '/'), { kind: 'rewrite', pathname: '/mypage/crm' });
eq('顧客台帳', v.decideCrmRoute('fukuescrm.com', '/customers'), { kind: 'rewrite', pathname: '/mypage/crm/customers' });
eq('www も同じ', v.decideCrmRoute('www.fukuescrm.com', '/bookings'), { kind: 'rewrite', pathname: '/mypage/crm/bookings' });
eq('ポート・大文字', v.decideCrmRoute('FUKUESCRM.COM:443', '/'), { kind: 'rewrite', pathname: '/mypage/crm' });
eq('★ 二重に付けない', v.decideCrmRoute('fukuescrm.com', '/mypage/crm/settings'), { kind: 'rewrite', pathname: '/mypage/crm/settings' });
eq('★ /customersx は下に付ける', v.decideCrmRoute('fukuescrm.com', '/customersx'), { kind: 'rewrite', pathname: '/mypage/crm/customersx' });

console.log('── 2. 短いパス（ログイン・規約） ──');
eq('ログイン', v.decideCrmRoute('fukuescrm.com', '/login'), { kind: 'rewrite', pathname: '/crm/login' });
eq('ログイン（末尾 /）', v.decideCrmRoute('fukuescrm.com', '/login/'), { kind: 'rewrite', pathname: '/crm/login' });
eq('規約', v.decideCrmRoute('fukuescrm.com', '/terms'), { kind: 'rewrite', pathname: '/crm/terms' });
eq('データの取り扱い', v.decideCrmRoute('fukuescrm.com', '/data'), { kind: 'rewrite', pathname: '/crm/data' });
eq('/crm/terms はそのまま', v.decideCrmRoute('fukuescrm.com', '/crm/terms'), { kind: 'rewrite', pathname: '/crm/terms' });

console.log('── 3. 本体のまま動かす道 ──');
eq('/_next', v.decideCrmRoute('fukuescrm.com', '/_next/static/x.js'), { kind: 'none' });
eq('/api', v.decideCrmRoute('fukuescrm.com', '/api/revalidate'), { kind: 'none' });
eq('/auth', v.decideCrmRoute('fukuescrm.com', '/auth/callback'), { kind: 'none' });
eq('★ /apix は通さない', v.decideCrmRoute('fukuescrm.com', '/apix'), { kind: 'rewrite', pathname: '/mypage/crm/apix' });

console.log('── 4. fukues.com からの転送（スイッチ） ──');
eq('★ 既定（false）は転送しない', v.decideCrmRoute('fukues.com', '/mypage/crm'), { kind: 'none' });
eq('ON: トップ', v.decideCrmRoute('fukues.com', '/mypage/crm', '', true), { kind: 'redirect', url: 'https://fukuescrm.com/' });
eq('ON: 下の画面＋クエリ', v.decideCrmRoute('www.fukues.com', '/mypage/crm/customers', '?customer=3', true), { kind: 'redirect', url: 'https://fukuescrm.com/customers?customer=3' });
eq('ON: /mypage は転送しない', v.decideCrmRoute('fukues.com', '/mypage', '', true), { kind: 'none' });
eq('ON: /mypage/crmx は転送しない', v.decideCrmRoute('fukues.com', '/mypage/crmx', '', true), { kind: 'none' });
eq('ON: プレビューは転送しない', v.decideCrmRoute('este-portal.vercel.app', '/mypage/crm', '', true), { kind: 'none' });
eq('ほかのホストは何もしない', v.decideCrmRoute('conecf.com', '/'), { kind: 'none' });

console.log('── 5. リンク ──');
eq('CRM ドメインの頭', v.crmBaseFor('fukuescrm.com'), '');
eq('本体の頭', v.crmBaseFor('fukues.com'), '/mypage/crm');
eq('CRM: トップ', v.crmHref('', '/'), '/');
eq('CRM: 顧客', v.crmHref('', '/customers'), '/customers');
eq('本体: トップ', v.crmHref('/mypage/crm', '/'), '/mypage/crm');
eq('本体: 顧客', v.crmHref('/mypage/crm', '/customers'), '/mypage/crm/customers');
eq('CRM: ログイン', v.crmSpecialHref('', 'login'), '/login');
eq('本体: ログイン', v.crmSpecialHref('/mypage/crm', 'login'), '/owner/login?redirectTo=%2Fmypage%2Fcrm');
eq('CRM: 規約', v.crmSpecialHref('', 'terms'), '/terms');
eq('本体: 規約', v.crmSpecialHref('/mypage/crm', 'terms'), '/crm/terms');
eq('CRM: 予約ボード', v.fukuesHref('', '/mypage'), 'https://fukues.com/mypage');
eq('本体: 予約ボード', v.fukuesHref('/mypage/crm', '/mypage'), '/mypage');

if (fail) { console.log('\n✖ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\n✔ すべて ok');
