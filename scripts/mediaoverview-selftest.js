// 媒体連携の入口の判定（src/lib/mediaOverview.ts）の自己点検（第56便・㉞）。
//
// ★★★ この判定で危ないのは【書くこと】。
//   出し分け（mediaVisibility）は見せることが危なかったが、こちらは逆。
//   ★ 分からないときは「書かない側（unset）」に倒す。
//
//   使い方:  npm run check:mediaoverview

const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaOverview.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// 駅ちか＝読める媒体 ／ エステラブ＝書くだけの媒体
const EKI = 'ekichika';
const LOVE = 'esulove';
const facts = (o) => Object.assign(
  { provider: EKI, slot: 1, linkMode: 'read', sourceEnabled: true, hasCredential: true }, o || {}
);
const dir = (o) => v.siteDirection(facts(o));

console.log('── 1. ★ 読めるのは表に載っている媒体だけ ──');
eq('駅ちかは読める', v.canReadProvider(EKI), true);
eq('エステラブは読めない', v.canReadProvider(LOVE), false);
eq('★ 知らない媒体は読めない側に倒す', v.canReadProvider('unknown-site'), false);
eq('★ 空文字も読めない', v.canReadProvider(''), false);

console.log('\n── 2. ★★★ 読むのに鍵は要らない。書くには鍵が要る ──');
// ★★★ 対になる主張。鍵が無いという同じ状態で、向きによって答えが割れる
eq('★★ 鍵が無くても read は read（公開ページを読むだけ）',
   dir({ linkMode: 'read', hasCredential: false }), 'read');
eq('★★ 鍵が無ければ write は unset（管理画面に入れない）',
   dir({ linkMode: 'write', hasCredential: false }), 'unset');
eq('★ 鍵があれば write は write', dir({ linkMode: 'write', hasCredential: true }), 'write');

console.log('\n── 2-2. ★★ 分からないときは書かない側（unset）──');
eq('★ 止めてある枠は unset', dir({ sourceEnabled: false }), 'unset');
eq('★★ 止めてある枠は read でも unset', dir({ linkMode: 'read', sourceEnabled: false }), 'unset');
eq('★ link_mode が null なら unset', dir({ linkMode: null }), 'unset');
eq("★ link_mode が 'none' なら unset", dir({ linkMode: 'none' }), 'unset');
// ★★★ 対になる主張。書くだけの媒体でも、null を write に読み替えない
eq('★★ 書くだけの媒体でも、null を write に読み替えない',
   dir({ provider: LOVE, linkMode: null }), 'unset');
eq('★★ 同じ媒体でも write と書いてあれば write',
   dir({ provider: LOVE, linkMode: 'write' }), 'write');

console.log('\n── 3. 向きの読み取り ──');
eq('read はそのまま read', dir({ linkMode: 'read' }), 'read');
eq('write はそのまま write', dir({ linkMode: 'write' }), 'write');
eq('write_auto も write 扱い', dir({ linkMode: 'write_auto' }), 'write');
// ★★★ 対になる主張。読めない媒体に read が入っていても read にはしない
eq('★★ 読めない媒体の read は unset', dir({ provider: LOVE, linkMode: 'read' }), 'unset');
eq('★★ 読める媒体の read は read', dir({ provider: EKI, linkMode: 'read' }), 'read');
eq('★ 知らない値は unset（勝手に読み替えない）', dir({ linkMode: 'よみこみ' }), 'unset');

console.log('\n── 4. 画面に出す名前 ──');
eq('read の名前', v.directionLabel('read'), '読み込み');
eq('write の名前', v.directionLabel('write'), '反映のみ');
eq('unset の名前', v.directionLabel('unset'), '未設定');
eq('★ 知らない値でも未設定に落とす', v.directionLabel('なにか'), '未設定');
// ★ 店舗が読む文言。内部名が混ざっていないこと
eq('★ 名前に内部名が混ざらない',
   ['read', 'write', 'unset'].some((d) => /[a-z]/.test(v.directionLabel(d))), false);

console.log('\n── 5. ★ 切り替えを出すのは読める媒体だけ ──');
const sw = (o) => v.canSwitchDirection(facts(o));
// ★★★ 対になる主張。同じ状態でも媒体で割れる
eq('★★ 駅ちかには切り替えを出す', sw({ provider: EKI }), true);
eq('★★ エステラブには出さない', sw({ provider: LOVE }), false);
// ★ 切り替え（read → write）には鍵が要る。★ 鍵が無いうちはボタンを出さない
eq('★ ログイン情報が無ければ出さない', sw({ hasCredential: false }), false);
eq('★ 止めてある枠にも出す（戻せるように）', sw({ sourceEnabled: false }), true);

console.log('\n── 6. ★★ 次の取り込み。★ 過ぎている「次」は出さない ──');
const NOW = new Date('2026-08-30T06:20:00+09:00');
const next = (o) => v.nextImportAt(Object.assign(
  { lastRunAt: '2026-08-30T06:13:00+09:00', intervalMin: 15, now: NOW }, o || {}
));
// ★★★ 対になる主張。同じ取り込み時刻でも、いまがいつかで割れる
eq('★★ 間隔の内側なら次の時刻を返す',
   next({}) instanceof Date ? next({}).toISOString() : null, '2026-08-29T21:28:00.000Z');
eq('★★ 間隔を過ぎていたら null（止まっている）',
   next({ now: new Date('2026-08-30T07:00:00+09:00') }), null);
eq('★ ちょうど同時刻も null（未来ではない）',
   next({ now: new Date('2026-08-30T06:28:00+09:00') }), null);

eq('★ 取り込み時刻が無ければ null', next({ lastRunAt: null }), null);
eq('★ 空文字でも null', next({ lastRunAt: '' }), null);
eq('★ 読めない時刻でも null', next({ lastRunAt: 'きのう' }), null);
eq('★ 間隔が無ければ null', next({ intervalMin: null }), null);
eq('★ 間隔が0なら null', next({ intervalMin: 0 }), null);
eq('★ 間隔が負なら null', next({ intervalMin: -15 }), null);
eq('★ 間隔が数値でなければ null', next({ intervalMin: '15' }), null);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
