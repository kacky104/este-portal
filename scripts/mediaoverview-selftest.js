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

console.log('\n── 7. ★★ 送信ボタン。★ 押せないときは理由が文字になる ──');
const av = (o) => v.pushAvailability(Object.assign(
  { hasPlan: true, sendable: true, changeCount: 3, fingerprint: 'abc' }, o || {}
));

eq('★ 送れる状態なら ready', av({}), 'ready');
eq('★ 計画が無ければ not_confirmed', av({ hasPlan: false }), 'not_confirmed');

// ★★★ 対になる主張。同じ「0件」でも、止めた理由の有無で答えが割れる
eq('★★ 0件・止めた理由なし → no_change', av({ changeCount: 0 }), 'no_change');
eq('★★ 0件・止めた理由あり → blocked（理由の方を先に言う）',
   av({ changeCount: 0, sendable: false }), 'blocked');

// ★★★ もう1組。同じ「変わるところ3件」でも、指紋の有無で割れる
eq('★★ 指紋があれば ready', av({ fingerprint: 'abc' }), 'ready');
eq('★★ 指紋が空なら blocked（見た目は送れそうでも送らせない）', av({ fingerprint: '' }), 'blocked');

eq('★ 件数が負なら no_change', av({ changeCount: -1 }), 'no_change');
eq('★ 件数が数値でなければ no_change', av({ changeCount: '3' }), 'no_change');
eq('★ 計画が無いのが最優先（他が揃っていても）',
   av({ hasPlan: false, sendable: false, changeCount: 0 }), 'not_confirmed');

console.log('\n── 7-2. ボタンの文字 ──');
eq('ready の文字', v.pushButtonLabel('ready'), 'この内容で送る');
eq('no_change の文字', v.pushButtonLabel('no_change'), '送るものがありません');
eq('not_confirmed の文字', v.pushButtonLabel('not_confirmed'), 'まだ確かめていません');
eq('blocked の文字', v.pushButtonLabel('blocked'), 'いまは送れません');
// ★ 知らない値は送る側に倒さない
eq('★ 知らない値は「いまは送れません」', v.pushButtonLabel('なにか'), 'いまは送れません');
// ★★ 押せる文字は ready のときだけ
eq('★★ ready 以外に「送る」と書かない',
   ['no_change', 'not_confirmed', 'blocked'].some((a) => v.pushButtonLabel(a) === 'この内容で送る'), false);
// ★ 店舗が読む文言。内部名が混ざっていないこと
eq('★ 文字に内部名が混ざらない',
   ['ready', 'no_change', 'not_confirmed', 'blocked'].some((a) => /[a-z_]/.test(v.pushButtonLabel(a))), false);

console.log('\n── 8. ★★ 投稿用アドレスの伏せ字 ──');
eq('頭2文字とドメインだけ残す', v.maskAddress('sakura123@shame.jp'), 'sa****@shame.jp');
eq('短いローカル部でも隠す', v.maskAddress('ab@shame.jp'), 'ab****@shame.jp');
eq('1文字のローカル部', v.maskAddress('a@shame.jp'), 'a****@shame.jp');
// ★★★ 元の値がそのまま出ないこと。★ ここが崩れると覗き見でそのまま持ち帰られる
eq('★★ 3文字目以降がそのまま出ない',
   v.maskAddress('sakura123@shame.jp').indexOf('kura123') >= 0, false);
eq('★★ 元の値と一致しない', v.maskAddress('sakura123@shame.jp') === 'sakura123@shame.jp', false);
// ★ 形が読めない値は全部隠す。★ そのまま返す枝を作らない
eq('★ @ が無ければ全部隠す', v.maskAddress('sakura123'), '****');
eq('★ @ が先頭でも全部隠す', v.maskAddress('@shame.jp'), '****');
eq('★ 空文字は空文字', v.maskAddress(''), '');
eq('★ 空白だけも空文字', v.maskAddress('   '), '');
eq('★ null は空文字', v.maskAddress(null), '');
eq('★ 文字列でなければ空文字', v.maskAddress(123), '');
eq('★ 前後の空白は落とす', v.maskAddress('  sakura@shame.jp  '), 'sa****@shame.jp');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
