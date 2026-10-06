// 店舗ごとの時刻のずらし（第1247便）の番人。 npm run check:relaystagger
const path = require('path');
const S = require(path.join(__dirname, '..', '_tmpcheck', 'relayStagger.js'));
let bad = 0;
const eq = (n, a, b) => { const ok = a === b; console.log((ok ? 'ok ' : 'NG ') + n); if (!ok) { bad++; console.log('   got', a, 'want', b); } };
const now = new Date('2026-10-06T12:00:00Z');
const sec = (iso) => (Date.parse(iso) - now.getTime()) / 1000;
eq('★ 0番目はすぐ（null）', S.staggerNotBefore(0, now), null);
eq('★ 1番目は30秒後', sec(S.staggerNotBefore(1, now)), 30);
eq('★ 2番目は60秒後', sec(S.staggerNotBefore(2, now)), 60);
eq('★ 6番目は180秒後', sec(S.staggerNotBefore(6, now)), 180);
eq('★★ 7番目以降は180秒で止める（反映は3分以上遅れない）', sec(S.staggerNotBefore(20, now)), 180);
eq('★ 負の数・小数は null', S.staggerNotBefore(-1, now), null);
eq('★ 小数は null', S.staggerNotBefore(1.5, now), null);
eq('★ 定数', S.STAGGER_STEP_SEC * 6, S.STAGGER_MAX_SEC);
if (bad) { console.log('\n★★ ' + bad + ' 件 NG'); process.exit(1); }
console.log('\n全部 ok');
