// 媒体連携の出し分け（src/lib/mediaVisibility.ts）の自己点検（第54便）。
//
// ★★★ この判定は【既定で出さない】ことが要。
//   出す条件を書き忘れても困るのは運営だけだが、消す条件を書き忘れると
//   ★ 店舗の画面に出てしまい、他社に見られる。★ 倒れる向きを固定する。
//
//   使い方:  npm run check:mediavisibility

const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaVisibility.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const ADMIN = '63aca737-b399-4fb2-bf92-8a3816955d69';
const SHOP = '11111111-2222-3333-4444-555555555555';
const see = (o) => v.canSeeMedia(Object.assign({ ownerId: SHOP, adminUuid: ADMIN, unlocked: false }, o || {}));

console.log('── 1. ★★ 既定は出さない（倒れる向き）──');
eq('★ ふつうの店舗には出さない', see({}), false);
eq('★ owner_id が無いときは出さない', see({ ownerId: null }), false);
eq('★ owner_id が空文字でも出さない', see({ ownerId: '' }), false);
eq('★ 運営UUIDが空なら出さない', see({ ownerId: '', adminUuid: '' }), false);
// ★★ ここが罠。両方とも空だと「一致」してしまう作りにしない
eq('★★ 空同士を一致とみなさない', v.canSeeMedia({ ownerId: '', adminUuid: '', unlocked: false }), false);
eq('★ null 同士も一致とみなさない', v.canSeeMedia({ ownerId: null, adminUuid: '', unlocked: false }), false);

console.log('\n── 2. 出す条件は2つ ──');
eq('① 持ち主が運営アカウントなら出す', see({ ownerId: ADMIN }), true);
eq('② 目隠しを外していれば出す', see({ unlocked: true }), true);
eq('★ 両方でも出す', see({ ownerId: ADMIN, unlocked: true }), true);
eq('★ 別のUUIDでは出さない', see({ ownerId: SHOP }), false);
// ★ unlocked は真偽値のみ。文字列 'false' などで通らないこと
eq("★ 'true' という文字列では通さない", v.canSeeMedia({ ownerId: SHOP, adminUuid: ADMIN, unlocked: 'true' }), false);
eq('★ 1 では通さない', v.canSeeMedia({ ownerId: SHOP, adminUuid: ADMIN, unlocked: 1 }), false);

console.log('\n── 3. URL の読み取り ──');
eq('指定が無ければ none', v.readUnlockIntent('?a=1'), 'none');
eq('空文字でも none', v.readUnlockIntent(''), 'none');
eq('media=1 で on', v.readUnlockIntent('?media=1'), 'on');
eq('? が無くても読める', v.readUnlockIntent('media=1'), 'on');
eq('値が空でも on', v.readUnlockIntent('?media='), 'on');
eq('他の値でも on', v.readUnlockIntent('?media=yes'), 'on');
eq('media=0 で off', v.readUnlockIntent('?media=0'), 'off');
eq('media=off で off', v.readUnlockIntent('?media=off'), 'off');
eq('media=false で off', v.readUnlockIntent('?media=FALSE'), 'off');
// ★★ 「指定なし」と「消す」を分ける。★ 混ぜると、ふつうに開くたびに消える
eq('★ 指定なしは off ではない', v.readUnlockIntent('?other=1') === 'off', false);
eq('他のクエリと混ざっても読める', v.readUnlockIntent('?x=1&media=1&y=2'), 'on');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
