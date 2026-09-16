// コネックエフの振り分け（src/lib/conecfHost.ts）の自己点検（第395便）。
//   使い方:  npm run check:conecfhost
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfHost.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. conecf.com は /conecf へ rewrite ──');
eq('トップ', v.decideConecfRoute('conecf.com', '/'), { kind: 'rewrite', pathname: '/conecf' });
eq('下の画面', v.decideConecfRoute('conecf.com', '/sites'), { kind: 'rewrite', pathname: '/conecf/sites' });
eq('www も同じ', v.decideConecfRoute('www.conecf.com', '/girls'), { kind: 'rewrite', pathname: '/conecf/girls' });
eq('ポート付きでも同じ', v.decideConecfRoute('conecf.com:443', '/'), { kind: 'rewrite', pathname: '/conecf' });
eq('大文字でも同じ', v.decideConecfRoute('CONECF.COM', '/now'), { kind: 'rewrite', pathname: '/conecf/now' });
eq('★ 二重に付けない', v.decideConecfRoute('conecf.com', '/conecf/sites'), { kind: 'rewrite', pathname: '/conecf/sites' });
eq('★ /conecfx は別物（頭の一致だけで判断しない）', v.decideConecfRoute('conecf.com', '/conecfx'), { kind: 'rewrite', pathname: '/conecf/conecfx' });

console.log('── 2. ★ 認証・API・Next の内部は触らない ──');
eq('/auth/callback', v.decideConecfRoute('conecf.com', '/auth/callback'), { kind: 'none' });
eq('/api/x', v.decideConecfRoute('conecf.com', '/api/x'), { kind: 'none' });
eq('/_next/static', v.decideConecfRoute('conecf.com', '/_next/static/a.js'), { kind: 'none' });
eq('★ /authx は通さない（rewrite する）', v.decideConecfRoute('conecf.com', '/authx'), { kind: 'rewrite', pathname: '/conecf/authx' });

console.log('── 3. ★ fukues.com の /conecf は conecf.com へ ──');
eq('トップ', v.decideConecfRoute('fukues.com', '/conecf'), { kind: 'redirect', url: 'https://conecf.com/' });
eq('下の画面＋クエリ', v.decideConecfRoute('www.fukues.com', '/conecf/sites', '?a=1'), { kind: 'redirect', url: 'https://conecf.com/sites?a=1' });
eq('★ フクエスのほかの道は触らない', v.decideConecfRoute('fukues.com', '/mypage'), { kind: 'none' });
eq('★ /conecfx は触らない', v.decideConecfRoute('fukues.com', '/conecfx'), { kind: 'none' });

console.log('── 4. プレビュー・localhost はそのまま ──');
eq('vercel.app', v.decideConecfRoute('este-portal-abc.vercel.app', '/conecf/sites'), { kind: 'none' });
eq('localhost', v.decideConecfRoute('localhost:3000', '/conecf'), { kind: 'none' });
eq('★ 店舗の独自ドメインは触らない', v.decideConecfRoute('labyrinth-esthe.com', '/'), { kind: 'none' });
eq('ホスト不明', v.decideConecfRoute(null, '/conecf'), { kind: 'none' });

console.log('── 5. リンクの頭 ──');
eq('conecf.com は空', v.conecfBaseFor('conecf.com'), '');
eq('プレビューは /conecf', v.conecfBaseFor('x.vercel.app'), '/conecf');
eq('href トップ（本番）', v.conecfHref('', '/'), '/');
eq('href 下（本番）', v.conecfHref('', '/sites'), '/sites');
eq('href トップ（プレビュー）', v.conecfHref('/conecf', '/'), '/conecf');
eq('href 下（プレビュー）', v.conecfHref('/conecf', '/sites'), '/conecf/sites');
eq('href スラッシュ無しでも', v.conecfHref('/conecf', 'girls'), '/conecf/girls');

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った');
