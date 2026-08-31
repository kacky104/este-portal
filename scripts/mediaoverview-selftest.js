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
// ★★★ 'none' は「選んだ結果」。★ 未設定と混ぜない（第87便・§223 と同じ形）
eq("★★ link_mode が 'none' なら off（unset ではない）", dir({ linkMode: 'none' }), 'off');
eq('★★ 鍵が無くても off は off（送らないのに鍵は要らない）',
   dir({ linkMode: 'none', hasCredential: false }), 'off');
eq('★★ 枠を止めてあっても、選んだ off のほうが強い',
   dir({ linkMode: 'none', sourceEnabled: false }), 'off');
eq('★★ 書くだけの媒体でも none は off', dir({ provider: LOVE, linkMode: 'none' }), 'off');
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
// ★★ 「向き」「読み込み／反映」と呼ばない（第86便）。店舗様には【どこで入力するか】の話
eq('read の名前', v.directionLabel('read', '駅ちか'), '駅ちかで入力');
eq('★ 媒体の名前は決め打ちにしない', v.directionLabel('read', 'エステ魂'), 'エステ魂で入力');
eq('★ 名前が分からないときは名前を出さない', v.directionLabel('read', ''), 'サイト側で入力');
eq('write の名前', v.directionLabel('write', '駅ちか'), 'フクエスで入力');
eq('off の名前', v.directionLabel('off', '駅ちか'), 'フクエスだけ');
eq('unset の名前', v.directionLabel('unset', '駅ちか'), '未設定');
// ★★ 対になる主張。選んだ off を「未設定」と書かない
eq('★★ off と unset は同じ名前にしない',
   v.directionLabel('off', '駅ちか') === v.directionLabel('unset', '駅ちか'), false);
eq('★ 知らない値でも未設定に落とす', v.directionLabel('なにか', '駅ちか'), '未設定');
// ★ 店舗が読む文言。内部名が混ざっていないこと
eq('★ 名前に内部名が混ざらない',
   ['read', 'write', 'unset'].some((d) => /[a-z]/.test(v.directionLabel(d, '駅ちか'))), false);
// ★★ 仕組み側の言葉を画面に出さない。★ 決めごとは点検で固定する（引き継ぎメモ 6）
eq('★★ 「向き」と書かない',
   ['read', 'write', 'unset'].some((d) => v.directionLabel(d, '駅ちか').includes('向き')), false);

console.log('\n── 4-2. ★★★ 「変える」ボタンは行き先を名前にする（第86便その2・第87便）──');
const modes = (d, name) => v.switchChoices(d, name || '駅ちか').map((c) => c.mode);
const labels = (d, name) => v.switchChoices(d, name || '駅ちか').map((c) => c.label);

eq('read からは write と none の2つ', modes('read'), ['write', 'none']);
eq('write からは read と none の2つ', modes('write'), ['read', 'none']);
eq('off からは read と write の2つ', modes('off'), ['read', 'write']);
// ★★★ 対になる主張。いまの状態は選択肢に出さない（押しても何も起きないボタンを作らない）
eq('★★★ いまの状態は出さない',
   ['read', 'write', 'off'].some((d) => modes(d).includes(d === 'off' ? 'none' : d)), false);
// ★★ 変える先が決まっていないのに「変える」と書かない
eq('★★ 未設定からは1つも出さない', modes('unset'), []);
eq('★ 知らない値からも出さない', modes('なにか'), []);

eq('read の文字', labels('read'), ['フクエスに変える', 'フクエスだけで使う']);
eq('write の文字', labels('write'), ['駅ちかに変える', 'フクエスだけで使う']);
eq('★ 媒体の名前は決め打ちにしない', labels('write', 'エステ魂')[0], 'エステ魂に変える');
// ★★★ off の店はもうフクエスで入力している。★ そこに「フクエスに変える」と書かない
eq('★★★ off から write は「フクエスに変える」と書かない',
   labels('off').includes('フクエスに変える'), false);
eq('off の文字', labels('off'), ['駅ちかに変える', '各サイトへ送るようにする']);

// ★★ 1回押すだけで変わる。★ だから【止まるほう】を押した直後に必ず言う
eq('★★ write へ → 止まるのは取り込み',
   v.switchDoneText('write', '駅ちか').includes('取り込みは止まります'), true);
eq('★★ read へ → 送らないことを言う',
   v.switchDoneText('read', '駅ちか').includes('フクエスからは送りません'), true);
eq('★★★ none へ → 送らないことと取り込まないことの両方を言う',
   v.switchDoneText('none', '駅ちか').includes('どのサイトへも送らず')
   && v.switchDoneText('none', '駅ちか').includes('取り込みもしません'), true);
eq('★ どの行き先でも文が空にならない',
   ['read', 'write', 'none'].every((m) => v.switchDoneText(m, '駅ちか').length > 0), true);

console.log('\n── 4-3. ★★★ 入口の1行と、押す前の問い（第88便）──');
eq('read の1行', v.homeHeadline('read', '駅ちか'), '駅ちかの情報をフクエスに反映');
eq('write の1行', v.homeHeadline('write', '駅ちか'), 'フクエスの情報を他サイトに反映');
eq('off の1行', v.homeHeadline('off', '駅ちか'), '駅ちかの反映もフクエスからの反映もしていません');
eq('unset の1行', v.homeHeadline('unset', '駅ちか'), 'まだどのサイトとも連携していません');
eq('★ 媒体の名前は決め打ちにしない', v.homeHeadline('read', 'エステ魂'), 'エステ魂の情報をフクエスに反映');
// ★★★ 仕組みの言葉を、いちばん目立つ1行に出さない
eq('★★★ 「取り込」と書かない',
   ['read', 'write', 'off', 'unset'].some((d) => v.homeHeadline(d, '駅ちか').includes('取り込')), false);
eq('★ どの状態でも1行が空にならない',
   ['read', 'write', 'off', 'unset'].every((d) => v.homeHeadline(d, '駅ちか').length > 0), true);

// ★★ 問いは「変更しますか？」で終わらせない。行き先の名前を書く
eq('write の問い', v.switchAskText('write', '駅ちか').title, 'フクエスに変えますか？');
eq('read の問い', v.switchAskText('read', '駅ちか').title, '駅ちかに変えますか？');
eq('none の問い', v.switchAskText('none', '駅ちか').title, 'フクエスだけで使いますか？');
eq('★ 媒体の名前は決め打ちにしない', v.switchAskText('read', 'エステ魂').title, 'エステ魂に変えますか？');
eq('★★ 問いは必ず「？」で終わる',
   ['read', 'write', 'none'].every((m) => v.switchAskText(m, '駅ちか').title.endsWith('？')), true);
// ★★★ 押す前の本文には【止まるほう】を必ず書く。★ 押したあとの文と対にする
eq('★★★ write の本文は取り込みが止まると書く',
   v.switchAskText('write', '駅ちか').body.includes('取り込みは止まります'), true);
eq('★★★ read の本文は送らなくなると書く',
   v.switchAskText('read', '駅ちか').body.includes('送らなくなります'), true);
eq('★★★ none の本文は両方とも止まると書く',
   v.switchAskText('none', '駅ちか').body.includes('どのサイトへも送らず')
   && v.switchAskText('none', '駅ちか').body.includes('取り込みもしません'), true);
eq('★ どの行き先でも本文が空にならない',
   ['read', 'write', 'none'].every((m) => v.switchAskText(m, '駅ちか').body.length > 0), true);

console.log('\n── 5. ★ 切り替えを出すのは読める媒体だけ ──');
const sw = (o) => v.canSwitchDirection(facts(o));
// ★★★ 対になる主張。同じ状態でも媒体で割れる
eq('★★ 駅ちかには切り替えを出す', sw({ provider: EKI }), true);
eq('★★ エステラブには出さない', sw({ provider: LOVE }), false);
// ★ 切り替え（read → write）には鍵が要る。★ 鍵が無いうちはボタンを出さない
eq('★ ログイン情報が無ければ出さない', sw({ hasCredential: false }), false);
eq('★ 止めてある枠にも出す（戻せるように）', sw({ sourceEnabled: false }), true);
// ★★ off にした店にも出す。★ 出さないと、戻す道が画面から消える
eq('★★ off の枠にも出す（戻せるように）', sw({ linkMode: 'none' }), true);

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
eq('★★ 変更があるのに指紋が空なら blocked（起きないはずだが送らせない）', av({ fingerprint: '' }), 'blocked');

// ★★★ 実物で起きる組み合わせ（2026-08-30 に取り違えた）。
//   planFingerprint() は変更の一覧から作るので、変更0件なら指紋は【必ず空になる】。
//   ★ 「指紋が空」と「変更0件」は同じことの裏表。★ 0件を先に見ないと別の理由が出る
eq('★★★ 0件かつ指紋が空 → no_change（実物はいつもこの形）',
   av({ changeCount: 0, fingerprint: '' }), 'no_change');
eq('★★ 0件・指紋が空でも、止めた理由があれば blocked',
   av({ changeCount: 0, fingerprint: '', sendable: false }), 'blocked');

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

console.log('\n── 9. ★★★ セラピストが媒体に出ているか。★「いません」と言える場面を狭くする ──');
const st = (o) => v.therapistSiteState(Object.assign(
  { isUnlinked: false, isMissing: false, known: true }, o || {}
));

eq('番号あり・向こうにいる → present', st({}), 'present');
eq('番号あり・向こうに無い → missing', st({ isMissing: true }), 'missing');

// ★★★ 対になる主張。同じ「向こうに無い」でも、番号の有無で答えが割れる
eq('★★ 番号があるなら missing（いません）', st({ isMissing: true, isUnlinked: false }), 'missing');
eq('★★ 番号が無ければ unlinked（★「いません」と言わない）',
   st({ isMissing: true, isUnlinked: true }), 'unlinked');

// ★★★ もう1組。同じ「向こうに無い印が付いていない」でも、読めているかで割れる
eq('★★ 読めていれば present', st({ known: true }), 'present');
eq('★★ 読めていなければ unknown（★「います」と言わない）', st({ known: false }), 'unknown');

eq('★ 番号が無ければ、読めていなくても unlinked（番号の話が先）',
   st({ isUnlinked: true, known: false }), 'unlinked');
eq("★ known が 'true' という文字列なら unknown", st({ known: 'true' }), 'unknown');
eq('★ isUnlinked が 1 では unlinked にしない', st({ isUnlinked: 1, isMissing: true }), 'missing');

console.log('\n── 9-2. 言い方 ──');
eq('present の言い方', v.therapistSiteLabel('present'), 'います');
eq('missing の言い方', v.therapistSiteLabel('missing'), 'いません');
eq('unlinked の言い方', v.therapistSiteLabel('unlinked'), 'まだ結びついていません');
eq('unknown の言い方', v.therapistSiteLabel('unknown'), 'まだ確かめていません');
eq('★ 知らない値は断定しない側へ', v.therapistSiteLabel('なにか'), 'まだ確かめていません');
// ★★ 「いません」と書いてよいのは missing だけ
eq('★★ missing 以外に「いません」と書かない',
   ['present', 'unlinked', 'unknown'].some((s) => v.therapistSiteLabel(s) === 'いません'), false);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
