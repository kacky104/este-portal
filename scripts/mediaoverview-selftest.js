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
// ★★★ 第91便: ボタンの言葉に揃えた。★ 同じ状態に2つの呼び名を残さない（§327）
eq('read の名前', v.directionLabel('read', '駅ちか'), '駅ちかから反映中');
eq('★ 媒体の名前は決め打ちにしない', v.directionLabel('read', 'エステ魂'), 'エステ魂から反映中');
eq('★ 名前が分からないときは名前を出さない', v.directionLabel('read', ''), 'サイト側から反映中');
eq('write の名前', v.directionLabel('write', '駅ちか'), 'フクエスから反映中');
eq('off の名前', v.directionLabel('off', '駅ちか'), '反映なし');
eq('unset の名前', v.directionLabel('unset', '駅ちか'), '未設定');
// ★★ 動いている2つにだけ「中」を付ける。★ homeHeadline と同じ決めごと（第90便）
eq('★★ 動いている2つには「中」が付く',
   ['read', 'write'].every((d) => v.directionLabel(d, '駅ちか').endsWith('中')), true);
eq('★★★ 止まっている2つには「中」を付けない',
   ['off', 'unset'].some((d) => v.directionLabel(d, '駅ちか').endsWith('中')), false);
// ★★★ 印とボタンを【同じ文字にしない】。★ 押せるものと、いまの状態を見分けられなくなる
eq('★★★ 印は、ボタンの文字とは違う',
   ['read', 'write'].some((d) => v.directionLabel(d, '駅ちか') === v.switchLabel(d, '駅ちか')), false);
eq('★★★ off の印も、ボタンの文字とは違う',
   v.directionLabel('off', '駅ちか') === v.switchLabel('none', '駅ちか'), false);
// ★★ それでも【同じ語彙】であること。★ 別々の言葉に散らさない
eq('★★ 動いている2つの印は、ボタンと同じ語で始まる',
   ['read', 'write'].every((d) => v.directionLabel(d, '駅ちか').startsWith(v.switchLabel(d, '駅ちか'))), true);
// ★ 消した言い方が戻っていないこと
eq('★ 「で入力」と書かない',
   ['read', 'write', 'off', 'unset'].some((d) => v.directionLabel(d, '駅ちか').includes('で入力')), false);
eq('★ 「フクエスだけ」と書かない',
   ['read', 'write', 'off', 'unset'].some((d) => v.directionLabel(d, '駅ちか') === 'フクエスだけ'), false);
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
// ★ 第111便で provider を受けるようになった。★ 省略時は読める媒体（駅ちか）
const modes = (d, name, prov) => v.switchChoices(d, name || '駅ちか', prov || EKI).map((c) => c.mode);
const labels = (d, name, prov) => v.switchChoices(d, name || '駅ちか', prov || EKI).map((c) => c.label);

eq('read からは write と none の2つ', modes('read'), ['write', 'none']);
eq('write からは read と none の2つ', modes('write'), ['read', 'none']);
eq('off からは read と write の2つ', modes('off'), ['read', 'write']);
// ★★★ 対になる主張。いまの状態は選択肢に出さない（押しても何も起きないボタンを作らない）
eq('★★★ いまの状態は出さない',
   ['read', 'write', 'off'].some((d) => modes(d).includes(d === 'off' ? 'none' : d)), false);
// ★★ 変える先が決まっていないのに「変える」と書かない
eq('★★ 未設定からは1つも出さない', modes('unset'), []);
eq('★ 知らない値からも出さない', modes('なにか'), []);

// ★★★ 第90便: 【行き先の状態】を名前にした。★ 「変える」という動きでは呼ばない
eq('read の文字', labels('read'), ['フクエスから反映', '反映しない']);
eq('write の文字', labels('write'), ['駅ちかから反映', '反映しない']);
eq('off の文字', labels('off'), ['駅ちかから反映', 'フクエスから反映']);
eq('★ 媒体の名前は決め打ちにしない', labels('write', 'エステ魂')[0], 'エステ魂から反映');
// ★★★ 同じ行き先なら、どこから押しても同じ文字になる（例外を作らない）
eq('★★★ read へは、write からも off からも同じ文字',
   labels('write')[0], labels('off')[0]);
eq('★★★ write へは、read からも off からも同じ文字',
   labels('read')[0], labels('off')[1]);
// ★★ 「変える」は動きであって、押した先がどうなるかを言っていない
eq('★★ どの文字にも「変える」と書かない',
   ['read', 'write', 'off'].some((d) => labels(d).some((t) => t.includes('変える'))), false);
// ★ 消した言い方が戻っていないこと
eq('★ 「フクエスだけで使う」は使わない',
   ['read', 'write', 'off'].some((d) => labels(d).includes('フクエスだけで使う')), false);
eq('★ 「各サイトへ送るようにする」は使わない',
   ['read', 'write', 'off'].some((d) => labels(d).includes('各サイトへ送るようにする')), false);

// ★★ 1回押すだけで変わる。★ だから【止まるほう】を押した直後に必ず言う
eq('★★ write へ → 止まるのは取り込み',
   v.switchDoneText('write', '駅ちか', EKI).includes('取り込みは止まります'), true);
eq('★★ read へ → 送らないことを言う',
   v.switchDoneText('read', '駅ちか', EKI).includes('フクエスからは送りません'), true);
// ★★★ 第192便: 「どのサイトへも」と書かない。★ この枠しか変わらないのに全体のように書いていた（嘘）
eq('★★★ none へ → その媒体へ送らないことと取り込まないことの両方を言う',
   v.switchDoneText('none', '駅ちか', EKI).includes('駅ちかへは送らず')
   && v.switchDoneText('none', '駅ちか', EKI).includes('駅ちかからの取り込みもしません'), true);
eq('★★★ none へ → 「どのサイトへも」と書かない（第192便）',
   v.switchDoneText('none', '駅ちか', EKI).includes('どのサイト'), false);
eq('★ どの行き先でも文が空にならない',
   ['read', 'write', 'none'].every((m) => v.switchDoneText(m, '駅ちか', EKI).length > 0), true);

console.log('\n── 4-3. ★★★ 入口の1行と、押す前の問い（第88便）──');
eq('read の1行', v.homeHeadline('read', '駅ちか'), '駅ちかの情報をフクエスに反映中');
eq('write の1行', v.homeHeadline('write', '駅ちか'), 'フクエスの情報を他サイトに反映中');
eq('off の1行', v.homeHeadline('off', '駅ちか'), '駅ちかの反映もフクエスからの反映もしていません');
eq('unset の1行', v.homeHeadline('unset', '駅ちか'), 'まだどのサイトとも連携していません');
eq('★ 媒体の名前は決め打ちにしない', v.homeHeadline('read', 'エステ魂'), 'エステ魂の情報をフクエスに反映中');
// ★★★ 動いている2つにだけ「中」を付ける（第90便）。★ 止まっているものに「中」と書かない
//   ★ 画面はこの2つだけを点滅させる。★ 文と絵がずれると、止まっているのに動いて見える
eq('★★ 動いている2つには「中」が付く',
   ['read', 'write'].every((d) => v.homeHeadline(d, '駅ちか').endsWith('中')), true);
eq('★★★ 止まっている2つには「中」を付けない',
   ['off', 'unset'].some((d) => v.homeHeadline(d, '駅ちか').endsWith('中')), false);
// ★★★ 仕組みの言葉を、いちばん目立つ1行に出さない
eq('★★★ 「取り込」と書かない',
   ['read', 'write', 'off', 'unset'].some((d) => v.homeHeadline(d, '駅ちか').includes('取り込')), false);
eq('★ どの状態でも1行が空にならない',
   ['read', 'write', 'off', 'unset'].every((d) => v.homeHeadline(d, '駅ちか').length > 0), true);

// ★★ 問いは「変更しますか？」で終わらせない。行き先の名前を書く
eq('write の問い', v.switchAskText('write', '駅ちか', EKI).title, 'フクエスから反映しますか？');
eq('read の問い', v.switchAskText('read', '駅ちか', EKI).title, '駅ちかから反映しますか？');
// ★★★ 第192便: 見出しを「どのサイトにも」にしない。★ 一括ボタン（bulkAskText）と同じ言葉にすると押した範囲が混ざる
eq('none の問い', v.switchAskText('none', '駅ちか', EKI).title, '駅ちかへ反映しないようにしますか？');
eq('★★★ 1枠の none の問いは、一括の問いと見出しが違う（第192便）',
   v.switchAskText('none', '駅ちか', EKI).title !== v.bulkAskText(v.bulkPlan([{ provider: EKI, slot: 1, label: '駅ちか', direction: 'read', hasCredential: true }], 'none')).title, true);
eq('★ 媒体の名前は決め打ちにしない', v.switchAskText('read', 'エステ魂', EKI).title, 'エステ魂から反映しますか？');
// ★★★ 問いの見出しは、ボタンの文字と同じ言葉で始める（第90便）。
//   ★ 押したボタンと違う言葉が出ると、何を押したのか分からなくなる
eq('★★★ 問いの見出しは、ボタンの文字で始まる',
   ['read', 'write'].every((m) =>
     v.switchAskText(m, '駅ちか', EKI).title.startsWith(v.switchLabel(m, '駅ちか'))), true);
eq('★★ 問いは必ず「？」で終わる',
   ['read', 'write', 'none'].every((m) => v.switchAskText(m, '駅ちか', EKI).title.endsWith('？')), true);
// ★★★ 押す前の本文には【止まるほう】を必ず書く。★ 押したあとの文と対にする
eq('★★★ write の本文は取り込みが止まると書く',
   v.switchAskText('write', '駅ちか', EKI).body.includes('取り込みは止まります'), true);
eq('★★★ read の本文は送らなくなると書く',
   v.switchAskText('read', '駅ちか', EKI).body.includes('送らなくなります'), true);
eq('★★★ none の本文は両方とも止まると書く（★ その媒体の範囲で）',
   v.switchAskText('none', '駅ちか', EKI).body.includes('駅ちかへは送らず')
   && v.switchAskText('none', '駅ちか', EKI).body.includes('駅ちかからの取り込みもしません'), true);
eq('★★★ 1枠の none の本文に「どのサイト」と書かない（第192便）',
   v.switchAskText('none', '駅ちか', EKI).body.includes('どのサイト'), false);
// ★★ 第192便: read の本文は写メ日記も送らないと書く（カッキーさんの方針）
eq('★★ read の本文は「写メ日記も」送らなくなると書く（第192便）',
   v.switchAskText('read', '駅ちか', EKI).body.includes('出勤も写メ日記も送らなくなります'), true);
eq('★ どの行き先でも本文が空にならない',
   ['read', 'write', 'none'].every((m) => v.switchAskText(m, '駅ちか', EKI).body.length > 0), true);

console.log('\n── 4-4. ★ ボタンの下に置く短い説明（第90便）──');
eq('★ 媒体名とフクエスの両方が入る',
   v.homeChoiceNote('駅ちか').indexOf('駅ちか') >= 0
   && v.homeChoiceNote('駅ちか').indexOf('フクエス') >= 0, true);
// ★★★ ボタンの名前は switchLabel から出す。★ 手で書くと、名前を直した日にここだけ残る
eq('★★★ 説明の中の名前は、ボタンの文字と同じ',
   v.homeChoiceNote('駅ちか').indexOf('「' + v.switchLabel('none', '駅ちか') + '」') >= 0, true);
eq('★ 媒体の名前は決め打ちにしない', v.homeChoiceNote('エステ魂').indexOf('エステ魂') >= 0, true);
// ★★ 名前が読めないときは、嘘の名前を出さない
eq('★★ 名前が無ければ名前のない言い方に倒す',
   v.homeChoiceNote('').indexOf('サイト側') >= 0, true);
eq('★★ 名前が無いのに「駅ちか」と書かない', v.homeChoiceNote('').indexOf('駅ちか') >= 0, false);
// ★ 短くする（読まれない長さにしない）。★ 2文まで
eq('★ 「。」は2つまで', v.homeChoiceNote('駅ちか').split('。').length - 1 <= 2, true);
// ★★★ 第192便: 2文目の嘘を消した。★ 「反映しない」は駅ちかの枠しか変えない
eq('★★★ 「どのサイトへも」と書かない（第192便）', v.homeChoiceNote('駅ちか').includes('どのサイト'), false);
eq('★★ 2文目は「◯◯へは送らず、◯◯からも取り込みません」（第192便）',
   v.homeChoiceNote('駅ちか').includes('駅ちかへは送らず、駅ちかからも取り込みません'), true);

console.log('\n── 5. ★ 切り替えを出すのは鍵がある枠だけ（第111便で媒体を問わなくした）──');
const sw = (o) => v.canSwitchDirection(facts(o));
eq('★★ 駅ちかには切り替えを出す', sw({ provider: EKI }), true);
// ★★★ 第111便: 書くだけの媒体にも出す。★ 出さないと、write にした店から【止める道が消える】
//   ★ 「いつでも戻せます」と書きながら戻せない画面を作らない（§223 の逆）
eq('★★★ 書くだけの媒体にも出す（第111便）', sw({ provider: LOVE }), true);
// ★ 切り替え（read → write）には鍵が要る。★ 鍵が無いうちはボタンを出さない
eq('★ ログイン情報が無ければ出さない', sw({ hasCredential: false }), false);
eq('★★ 書くだけの媒体でも、鍵が無ければ出さない',
   sw({ provider: LOVE, hasCredential: false }), false);
eq('★ 止めてある枠にも出す（戻せるように）', sw({ sourceEnabled: false }), true);
// ★★ off にした店にも出す。★ 出さないと、戻す道が画面から消える
eq('★★ off の枠にも出す（戻せるように）', sw({ linkMode: 'none' }), true);

console.log('\n── 5-2. ★★★ 書くだけの媒体の選択肢（第111便）──');
// ★★★ いちばん大事: 'read' を絶対に出さない。★ 選べるように見えて選べない画面を作らない
eq('★★★ どの状態からも read を出さない',
   ['read', 'write', 'off', 'unset'].some((d) => modes(d, 'エステ魂', LOVE).includes('read')), false);
eq('write からは none だけ', modes('write', 'エステ魂', LOVE), ['none']);
eq('off からは write だけ', modes('off', 'エステ魂', LOVE), ['write']);
// ★★★ 読める媒体とは違う決め。★ 行き先が1つしかないので、未設定からも出す
//   ★ 読める媒体では2つあって決められないから出さない（4-2）。★ 理由ごと分ける
eq('★★★ 未設定からも write を出す（行き先が1つしかない）',
   modes('unset', 'エステ魂', LOVE), ['write']);
eq('★ 読める媒体は未設定からは出さないまま', modes('unset', '駅ちか', EKI), []);
eq('★ 知らない値からは出さない', modes('なにか', 'エステ魂', LOVE), []);
// ★ ボタンの文字は同じ関数から出す（2か所で違う言い方をしない）
eq('★ 文字は読める媒体と同じ関数から', labels('off', 'エステ魂', LOVE), ['フクエスから反映']);
eq('★ 「反映しない」の文字も同じ', labels('write', 'エステ魂', LOVE), ['反映しない']);

console.log('\n── 5-3. ★★★ 書くだけの媒体の文言。★ 取り込みに触れない（第111便）──');
// ★★★ 「取り込み」は読める媒体だけの事実。★ 無いものが止まると書かない
eq('★★★ 押す前の問いに「取り込」と書かない',
   ['write', 'none'].some((m) => v.switchAskText(m, 'エステ魂', LOVE).body.includes('取り込')), false);
eq('★★★ 押したあとの文にも「取り込」と書かない',
   ['write', 'none'].some((m) => v.switchDoneText(m, 'エステ魂', LOVE).includes('取り込')), false);
// ★★ 対になる主張。★ 同じ行き先でも、媒体で書いてあることが割れる
eq('★★ 読める媒体の write には「取り込み」が入る',
   v.switchAskText('write', '駅ちか', EKI).body.includes('取り込みは止まります'), true);
// ★★ 問いの見出しは、ボタンの文字で始まる（読める媒体と同じ決め）
eq('★★ write の問いはボタンの文字で始まる',
   v.switchAskText('write', 'エステ魂', LOVE).title.startsWith(v.switchLabel('write', 'エステ魂')), true);
eq('★ 問いは「？」で終わる',
   ['write', 'none'].every((m) => v.switchAskText(m, 'エステ魂', LOVE).title.endsWith('？')), true);
// ★★ 名前を決め打ちにしない
eq('★ 媒体の名前が入る', v.switchAskText('none', 'エステ魂', LOVE).title.includes('エステ魂'), true);
eq('★ どの行き先でも空にならない',
   ['read', 'write', 'none'].every((m) =>
     v.switchAskText(m, 'エステ魂', LOVE).body.length > 0
     && v.switchDoneText(m, 'エステ魂', LOVE).length > 0), true);
// ★★★ 'read' が来ても、読み取れるように読める文を返さない
eq('★★★ read の問いは「送ることしかできません」',
   v.switchAskText('read', 'エステ魂', LOVE).title.includes('送ることしかできません'), true);

console.log('\n── 5-4. ★★★ ボタンの下の1行を、媒体で分ける（第111便）──');
// ★★★ homeChoiceNote は「◯◯とフクエスのどちらか一方」と書く。
//   ★ 書くだけの媒体には【どちらか一方】が無い。★ 使い回すと嘘になる
eq('★★★ 書くだけの1行に「どちらか一方」と書かない',
   v.sendOnlyChoiceNote('エステ魂').includes('どちらか一方'), false);
eq('★ 媒体の名前が入る', v.sendOnlyChoiceNote('エステ魂').includes('エステ魂'), true);
// ★★ ボタンの名前は switchLabel から出す（手で書かない）
eq('★★ 説明の中の名前は、ボタンの文字と同じ',
   v.sendOnlyChoiceNote('エステ魂').indexOf('「' + v.switchLabel('none', 'エステ魂') + '」') >= 0, true);
// ★★ 名前が読めないときは、嘘の名前を出さない
eq('★★ 名前が無ければ名前のない言い方に倒す',
   v.sendOnlyChoiceNote('').includes('このサイト'), true);
eq('★★ 名前が無いのに「駅ちか」と書かない', v.sendOnlyChoiceNote('').includes('駅ちか'), false);
eq('★ 「。」は2つまで', v.sendOnlyChoiceNote('エステ魂').split('。').length - 1 <= 2, true);
// ★ 取り込みに触れない
eq('★★ 「取り込」と書かない', v.sendOnlyChoiceNote('エステ魂').includes('取り込'), false);

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
// ★★ 第119便: 店舗様の言葉に直した。★ 「読んでいない」と「読んだが分からない」を書き分ける
eq('unlinked の言い方', v.therapistSiteLabel('unlinked'), '確かめられません');
eq('unknown の言い方', v.therapistSiteLabel('unknown'), 'まだ読んでいません');
eq('★ 知らない値は断定しない側へ', v.therapistSiteLabel('なにか'), 'まだ読んでいません');
// ★★ 4つが全部ちがう言葉であること（★ 読み分けられないと、状態を分けた意味が消える）
eq('★★ 4つの言い方が重ならない',
   new Set(['present', 'missing', 'unlinked', 'unknown'].map((s) => v.therapistSiteLabel(s))).size, 4);
// ★ こちらの言葉（番号・結びつき）を画面の札に出さない
eq('★★★ 札に内部の言葉を出さない',
   ['present', 'missing', 'unlinked', 'unknown'].filter((s) => /番号|結びつ/.test(v.therapistSiteLabel(s))), []);
// ★★ 「いません」と書いてよいのは missing だけ
eq('★★ missing 以外に「いません」と書かない',
   ['present', 'unlinked', 'unknown'].some((s) => v.therapistSiteLabel(s) === 'いません'), false);

console.log('\n── 10. ★★★ ログインの一時停止（第89便）──');
// ★★★ このボタンが止めるのは【ログイン】だけ。連携でも取り込みでもない（第87便）。
//   ★ ここが崩れると、店舗は「送るのをやめたつもり」で押して、設定だけ残る。

const SITE = 'テスト媒体';   // ★ 媒体名は引数で受ける。★ 決め打ちしていないことも見る

console.log('  ボタンの文字');
eq('使っている枠 → 一時停止', v.credentialPauseLabel(true), 'ログインを一時停止');
eq('止めてある枠 → 再開', v.credentialPauseLabel(false), 'ログインを再開');
// ★ 分からない値は【何も止めない側】に倒す。★ 再開は押しても何も止まらない
eq("★ boolean でなければ再開側に倒す", v.credentialPauseLabel('true'), 'ログインを再開');
eq('★ undefined でも再開側', v.credentialPauseLabel(undefined), 'ログインを再開');
// ★★ 「一時停止する」だけにしない。★ 何が止まるのかを名前に入れる
eq('★★ どちらの文字にも「ログイン」が入る',
   [true, false].every((b) => v.credentialPauseLabel(b).indexOf('ログイン') >= 0), true);
// ★★★ 「連携」と書かない。★ 連携は止まらない
eq('★★★ ボタンの文字に「連携」を出さない',
   [true, false].some((b) => v.credentialPauseLabel(b).indexOf('連携') >= 0), false);

console.log('  押す前の問いと、押したあとの文が【対】になっているか');
const askP = v.credentialPauseAskText('pause', SITE, true);
const askPw = v.credentialPauseAskText('pause', SITE, false);
const askR = v.credentialPauseAskText('resume', SITE, true);
const doneP = v.credentialPauseDoneText('pause', SITE, true);
const donePw = v.credentialPauseDoneText('pause', SITE, false);
const doneR = v.credentialPauseDoneText('resume', SITE, true);

// ★★ 止まるほうを、どちらにも書く（引き継ぎメモの作法）
eq('★★ 問いに「送りません」が入る', askP.body.indexOf('送りません') >= 0, true);
eq('★★ 押したあとにも「送りません」が入る', doneP.indexOf('送りません') >= 0, true);
// ★★★ 止まらないほう（取り込み）も、どちらにも書く。★ 書かないと全部止まったと思われる
eq('★★★ 読める媒体なら、問いに取り込みが続くと書く', askP.body.indexOf('取り込み') >= 0, true);
eq('★★★ 読める媒体なら、押したあとにも取り込みが続くと書く', doneP.indexOf('取り込み') >= 0, true);
// ★★★ 対になる主張。読めない媒体に、起きていない取り込みの話を書かない
eq('★★★ 読めない媒体では、問いに取り込みを書かない', askPw.body.indexOf('取り込み') >= 0, false);
eq('★★★ 読めない媒体では、押したあとにも取り込みを書かない', donePw.indexOf('取り込み') >= 0, false);
// ★ 問いと結果が食い違わない（片方だけ直すと、ここで落ちる）
eq('★★ 取り込みの扱いが、問いと結果で食い違わない',
   (askP.body.indexOf('取り込み') >= 0) === (doneP.indexOf('取り込み') >= 0), true);
eq('★★ 読めない媒体でも食い違わない',
   (askPw.body.indexOf('取り込み') >= 0) === (donePw.indexOf('取り込み') >= 0), true);

console.log('  再開のほう');
eq('★ 再開の問いに「次の反映から送ります」', askR.body.indexOf('次の反映から送ります') >= 0, true);
eq('★ 再開の結果にも「次の反映から送ります」', doneR.indexOf('次の反映から送ります') >= 0, true);
// ★ 再開で止まるものは無い。★ 「送りません」と書かない
eq('★★ 再開の文に「送りません」を出さない',
   askR.body.indexOf('送りません') >= 0 || doneR.indexOf('送りません') >= 0, false);

console.log('  ★★★ 「連携を停止」と書かない（第87便で消した言い方）');
const ALL = [
  askP.title, askP.body, askPw.title, askPw.body, askR.title, askR.body,
  doneP, donePw, doneR,
  v.credentialPauseLabel(true), v.credentialPauseLabel(false),
  v.credentialPausedNotice(SITE),
  v.CREDENTIAL_PAUSE_WHEN, v.CREDENTIAL_PAUSE_NOT_FOR_STOPPING,
  v.CREDENTIAL_PAUSE_BLOCKS_SWITCH,
];
eq('★★★ どの文にも「連携を停止」が出ない',
   ALL.some((t) => t.indexOf('連携を停止') >= 0), false);
// ★★ 仕組み側の言葉を出さない（§351・「向き」「読み込み」）
eq('★★ どの文にも「向き」が出ない', ALL.some((t) => t.indexOf('向き') >= 0), false);
// ★ 媒体名は引数で受ける。★ 決め打ちの「駅ちか」が混ざらない
eq('★ どの文にも「駅ちか」が焼き付いていない', ALL.some((t) => t.indexOf('駅ちか') >= 0), false);

console.log('  ★ 押しどきと、取り違え防止の1行');
// ★ 滅多に押さないボタン。★ いつ押すのか（パスワード）を必ず書く
eq('★ 押しどきに「パスワード」が入る', v.CREDENTIAL_PAUSE_WHEN.indexOf('パスワード') >= 0, true);
eq('★ 押しどきに「再開」が入る', v.CREDENTIAL_PAUSE_WHEN.indexOf('再開') >= 0, true);
// ★★★ 「もう送りたくない」人を、正しい口へ渡す
eq('★★★ 取り違え防止に「反映しない」が入る',
   v.CREDENTIAL_PAUSE_NOT_FOR_STOPPING.indexOf('反映しない') >= 0, true);

console.log('  ★ 押せない理由を、その場に書く（§185・第91便）');
// ★ きっかけ: 一時停止するとボタンが灰色になるが、なぜ押せないかが画面に無かった
eq('★★ 何が押せないかを書く',
   v.CREDENTIAL_PAUSE_BLOCKS_SWITCH.indexOf('入力する場所を変えられません') >= 0, true);
// ★★★ 「押せません」で終わらせない。★ 戻し方まで書く
eq('★★★ 戻し方（ログインを再開）を書く',
   v.CREDENTIAL_PAUSE_BLOCKS_SWITCH.indexOf(v.credentialPauseLabel(false)) >= 0, true);

console.log('  ★ 止めているあいだ、状態は文で言い切る');
eq('★ 媒体名が入る', v.credentialPausedNotice(SITE).indexOf(SITE) >= 0, true);
eq('★ 「何も送りません」と言い切る',
   v.credentialPausedNotice(SITE).indexOf('何も送りません') >= 0, true);

console.log('\n── 取り込んだ日記の印（第98便） ──');
eq('印は「◯◯から反映」', v.importedDiaryLabel('駅ちか'), '駅ちかから反映');
eq('★ 媒体名を焼き付けない', v.importedDiaryLabel('エステラブ'), 'エステラブから反映');
// ★ 「中」を付けない（動いている状態ではなく、どこから来たかという済んだ話）
eq('★ 「中」を付けない', v.importedDiaryLabel('駅ちか').indexOf('中') < 0, true);
// ★★ §365: 状態を読む場所で「取り込み」を使わない
eq('★★ 「取り込」と書かない', v.importedDiaryLabel('駅ちか').indexOf('取り込') < 0, true);
{
  const c = v.importedDiaryDeleteConfirm('駅ちか');
  eq('★ 相手には残ると言う', c.indexOf('駅ちかには残ります') > 0, true);
  eq('★★ 戻ってこないと言う（§369）', c.indexOf('戻ってきません') > 0, true);
  eq('★ 媒体名を焼き付けない', v.importedDiaryDeleteConfirm('エステラブ').indexOf('エステラブには残ります') > 0, true);
}

{
  const n = v.importedDiaryEditNote('駅ちか');
  eq('★ 一方通行だと言う（§6-3）', n.indexOf('駅ちか側は変わりません') > 0, true);
  eq('★ 媒体名を焼き付けない', v.importedDiaryEditNote('エステラブ').indexOf('エステラブ側は変わりません') > 0, true);
}

console.log('\n── ★★★ 第127便: ほかの媒体が正本のあいだは write を出さない ──');
// ★★★ 実際に起きていた形（ラビリンス様・2026-09-04）:
//   駅ちかが read（＝正本）なのに、エステ魂が write になっていた → エステ魂に二重書き込み
const sites = [
  { provider: 'ekichika', slot: 1, direction: 'read' },
  { provider: 'esutama', slot: 1, direction: 'write' },
];
eq('★★★ 駅ちかが read なら、エステ魂から見て「ほかが正本」',
   v.isReadingElsewhere(sites, { provider: 'esutama', slot: 1 }), true);
// ★★★ 自分自身は数えない。★ 数えると正本を切り替える操作ができなくなる
eq('★★★ 自分の read は数えない',
   v.isReadingElsewhere(sites, { provider: 'ekichika', slot: 1 }), false);
eq('★ 同じ媒体の別枠は「ほかの媒体」として数える',
   v.isReadingElsewhere(sites, { provider: 'ekichika', slot: 2 }), true);
eq('★ どこも read でなければ false',
   v.isReadingElsewhere([{ provider: 'esutama', slot: 1, direction: 'write' }], { provider: 'esulove', slot: 1 }), false);
eq('★ 空の一覧でも落ちない', v.isReadingElsewhere([], { provider: 'esutama' }), false);

// ★★★ ほかが正本なら 'write' を出さない
eq('★★★ ほかが正本なら未設定から write を出さない',
   v.switchChoices('unset', 'エステ魂', 'esutama', true).map((x) => x.mode), []);
eq('★★★ ほかが正本なら off から write を出さない',
   v.switchChoices('off', 'エステ魂', 'esutama', true).map((x) => x.mode), []);
// ★★★ ただし【止める道は必ず残す】（第111便）。★ すでに write の枠には 'none' を出す
eq('★★★ すでに write なら「反映しない」だけは出す',
   v.switchChoices('write', 'エステ魂', 'esutama', true).map((x) => x.mode), ['none']);
// ★ 読める媒体でも同じ（駅ちかが2枠あって片方が read のとき）
eq('★★ 読める媒体でも、ほかが正本なら write を出さない',
   v.switchChoices('off', '駅ちか', 'ekichika', true).map((x) => x.mode), []);

// ★ ほかが正本でなければ、これまでどおり
eq('★ ほかが正本でなければ従来どおり（書くだけの媒体）',
   v.switchChoices('off', 'エステ魂', 'esutama', false).map((x) => x.mode), ['write']);
eq('★ ほかが正本でなければ従来どおり（読める媒体）',
   v.switchChoices('read', '駅ちか', 'ekichika', false).map((x) => x.mode), ['write', 'none']);
eq('★ 書くだけの媒体に read は絶対に出さない（ほかが正本でも）',
   ['unset', 'off', 'write', 'read'].flatMap((f) =>
     [true, false].flatMap((e) => v.switchChoices(f, 'エステ魂', 'esutama', e).map((x) => x.mode)))
     .filter((m) => m === 'read'), []);

// ── ★★★ 第148便: 画面に【読まずに書いた記録】を置かない ─────────────────
//   2026-09-04 22:30。セラピスト一覧の「送った記録」の列が、
//   **何も読まずに全員へ「まだ送っていません」と出していた。**
//   ★ サラさんには写メ日記も即セラも送っていたので、画面が嘘をついていた。
//   ★★ 見出しが「記録」だと、店舗様は【調べた結果】だと思う。★ そこが罪深い。
//
//   → 見張り: この画面のファイルに、決め打ちの「まだ送っていません」を書かせない。
//     ★ 記録を出すなら、必ず読んでから出す。
{
  const fs = require('fs');
  const path = require('path');
  const f = path.join(__dirname, '..', 'src', 'app', 'mypage', 'media', 'TherapistBoard.tsx');
  const src = fs.readFileSync(f, 'utf8');
  // ★ 注記の中に出てくるのは許す（★ 何を外したかを書き残しているため）。
  //   ブロックコメントと行コメントを落としてから見る
  const jsx = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('★★★ 決め打ちの「まだ送っていません」が画面に無い', /まだ送っていません/.test(jsx), false);
}

console.log('\n── ★★★ 第189便: 「反映しない」の行に添える1行（カッキーさんの文言）──');
// ★★ 旧「どこにも送らず、取り込みもしていません」は、行の範囲（その媒体1つ）と合っていなかった。
//   ★ 「取り込みもしていません」は書くだけの媒体では選べないこと（していません＝すればできる、に読める）。
{
  const S = [
    { provider: 'ekichika', slot: 1, direction: 'read', label: '駅ちか' },
    { provider: 'esutama', slot: 1, direction: 'off', label: 'エステ魂' },
    { provider: 'esulove', slot: 1, direction: 'off', label: 'エステラブ' },
  ];
  // ★★★ ラビリンス様の実物（2026-09-06）: 駅ちかが正本・エステ魂が off
  eq('★★★ ほかが正本なら理由を言う',
     v.offRowNote('エステ魂', v.readingElsewhereLabel(S, { provider: 'esutama', slot: 1 })),
     '駅ちかから反映中のため、エステ魂には反映しません');
  // ★★★ 駅ちかが正本でないとき、「駅ちかから反映中のため」と書くと嘘になる
  const S2 = [
    { provider: 'ekichika', slot: 1, direction: 'off', label: '駅ちか' },
    { provider: 'esutama', slot: 1, direction: 'off', label: 'エステ魂' },
  ];
  eq('★★★ どこも正本でなければ理由を書かない',
     v.offRowNote('エステ魂', v.readingElsewhereLabel(S2, { provider: 'esutama', slot: 1 })),
     'エステ魂には反映しません');
  eq('★★ 駅ちか自身が off のとき、自分の read は数えない（理由なし）',
     v.offRowNote('駅ちか', v.readingElsewhereLabel(S2, { provider: 'ekichika', slot: 1 })),
     '駅ちかには反映しません');
  // ★ 媒体名は決め打ちにしない（READABLE_PROVIDERS の決めごと）
  eq('★ 正本の名前は一覧の label から取る',
     v.readingElsewhereLabel([{ provider: 'x', slot: 1, direction: 'read', label: 'テスト媒体' }], { provider: 'esutama', slot: 1 }),
     'テスト媒体');
  eq('★ 正本の名前が空なら null（嘘の名前を出さない）',
     v.readingElsewhereLabel([{ provider: 'x', slot: 1, direction: 'read', label: '' }], { provider: 'esutama', slot: 1 }), null);
  eq('★ 空の一覧でも落ちない', v.readingElsewhereLabel([], { provider: 'esutama' }), null);
  // ★★ isReadingElsewhere と同じ数え方（決め方を2つ持たない）
  const cases = [
    [S, { provider: 'esutama', slot: 1 }], [S, { provider: 'ekichika', slot: 1 }], [S, { provider: 'ekichika', slot: 2 }],
    [S2, { provider: 'esutama', slot: 1 }], [[], { provider: 'esutama' }],
  ];
  eq('★★ readingElsewhereLabel の有無は isReadingElsewhere と一致する',
     cases.every(([ss, me]) => (v.readingElsewhereLabel(ss, me) !== null) === v.isReadingElsewhere(ss, me)), true);
  // ★★★ 旧文言の言葉を使わない
  const all = [
    v.offRowNote('エステ魂', '駅ちか'), v.offRowNote('エステ魂', null), v.offRowNote('駅ちか', null),
  ];
  eq('★★★ 「どこにも」と書かない', all.some((t) => t.includes('どこにも')), false);
  eq('★★★ 「取り込」と書かない（書くだけの媒体で嘘になる）', all.some((t) => t.includes('取り込')), false);
  eq('★ 「反映中」は理由があるときだけ', v.offRowNote('エステ魂', null).includes('反映中'), false);
  // ★★★ 画面が旧文言を焼き付けていない
  const fs3 = require('fs');
  const src3 = fs3.readFileSync(require('path').join(__dirname, '..', 'src/app/mypage/media/MediaHome.tsx'), 'utf8');
  const jsx3 = src3.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('★★★ 画面に「どこにも送らず」が残っていない', /どこにも送らず/.test(jsx3), false);
  eq('★★ 画面は offRowNote を呼んでいる', /offRowNote\(/.test(jsx3), true);
}

console.log('\n── ★★★ 第190便: ほかの媒体へフクエスから反映しているあいだは read を出さない（第127便の逆側）──');
// ★★★ 実際に起きた形（ラビリンス様・2026-09-06 23:39・カッキーさんが確かめ中に発見）:
//   「フクエスから反映 → 反映しない → 駅ちかから反映」と押したら、
//   駅ちかから反映中なのにエステ魂へもフクエスから反映中、になった。
//   ★ 第127便は「write にするとき」しか見ていなかった。★ 逆の順で押せば通ってしまった。
{
  const W = [
    { provider: 'ekichika', slot: 1, direction: 'off', label: '駅ちか' },
    { provider: 'esutama', slot: 1, direction: 'write', label: 'エステ魂' },
  ];
  eq('★★★ エステ魂が write なら、駅ちかから見て「ほかへ反映中」',
     v.isWritingElsewhere(W, { provider: 'ekichika', slot: 1 }), true);
  eq('★★★ 自分の write は数えない',
     v.isWritingElsewhere(W, { provider: 'esutama', slot: 1 }), false);
  eq('★ 同じ媒体の別枠は「ほか」として数える',
     v.isWritingElsewhere([{ provider: 'ekichika', slot: 2, direction: 'write' }], { provider: 'ekichika', slot: 1 }), true);
  eq('★ どこも write でなければ false',
     v.isWritingElsewhere([{ provider: 'esutama', slot: 1, direction: 'off' }], { provider: 'ekichika', slot: 1 }), false);
  eq('★ 空でも落ちない', v.isWritingElsewhere([], { provider: 'ekichika' }), false);
  eq('★ 名前は一覧の label から（重複なし）',
     v.writingElsewhereLabels([
       { provider: 'esutama', slot: 1, direction: 'write', label: 'エステ魂' },
       { provider: 'esulove', slot: 1, direction: 'write', label: 'エステラブ' },
       { provider: 'esutama', slot: 2, direction: 'write', label: 'エステ魂' },
     ], { provider: 'ekichika', slot: 1 }), ['エステ魂', 'エステラブ']);
  eq('★ 名前の無い行は名前を出さない（嘘の名前を出さない）',
     v.writingElsewhereLabels([{ provider: 'x', slot: 1, direction: 'write', label: '' }], { provider: 'ekichika', slot: 1 }), []);
  eq('★★ 有無は isWritingElsewhere と一致する（決め方を2つ持たない）',
     [[W, { provider: 'ekichika', slot: 1 }], [W, { provider: 'esutama', slot: 1 }], [[], { provider: 'ekichika' }]]
       .every(([ss, me]) => (v.writingElsewhereLabels(ss, me).length > 0) === v.isWritingElsewhere(ss, me)), true);

  // ★★★ 選ぶボタン: ほかへ反映中なら 'read' を出さない
  const EK = 'ekichika';
  eq('★★★ ほかへ反映中: off から read を出さない（write だけ）',
     v.switchChoices('off', '駅ちか', EK, false, true).map((x) => x.mode), ['write']);
  eq('★★★ ほかへ反映中: write から read を出さない（none だけ）',
     v.switchChoices('write', '駅ちか', EK, false, true).map((x) => x.mode), ['none']);
  eq('★★ ほかへ反映中: unset からは何も出さない',
     v.switchChoices('unset', '駅ちか', EK, false, true).map((x) => x.mode), []);
  // ★★★ 既に禁止の形（read なのにほかが write）なら、抜ける道を全部残す
  eq('★★★ 既にこの形なら read から write と none を出す（抜ける道を塞がない）',
     v.switchChoices('read', '駅ちか', EK, false, true).map((x) => x.mode), ['write', 'none']);
  // ★★ 何もなければ従来どおり
  eq('★ ほかが何もしていなければ従来どおり（off → read, write）',
     v.switchChoices('off', '駅ちか', EK, false, false).map((x) => x.mode), ['read', 'write']);
  eq('★ ほかが何もしていなければ従来どおり（write → read, none）',
     v.switchChoices('write', '駅ちか', EK, false, false).map((x) => x.mode), ['read', 'none']);
  // ★★★ 両方の道を塞がない: どの状態・どの条件でも 'none' か 'write' へ抜けられる（read 以外の行き先がある）
  eq('★★★ ほかへ反映中でも、read/write/off のどこからでも押せる道が最低1つ残る（道を塞がない）',
     ['read', 'write', 'off'].every((from) =>
       v.switchChoices(from, '駅ちか', EK, false, true).length > 0), true);
  eq('★★★ ほかへ反映中に出る道に read は1つも無い',
     ['read', 'write', 'off', 'unset'].some((from) =>
       v.switchChoices(from, '駅ちか', EK, false, true).some((x) => x.mode === 'read')), false);
  // ★★ 書くだけの媒体には writingElsewhere は効かない（read はもともと出さない）
  eq('★ 書くだけの媒体: ほかへ反映中でも write は出せる（設定2＝全部フクエスから）',
     v.switchChoices('off', 'エステラブ', 'esulove', false, true).map((x) => x.mode), ['write']);

  // ★★ ボタンの下の1行（黙って消さない）
  eq('★★ read が出ていない理由の1行',
     v.readBlockedNote('駅ちか', ['エステ魂']),
     'エステ魂へフクエスから反映しているあいだは、「駅ちかから反映」に切り替えられません。先にエステ魂の「反映しない」を押してください。');
  eq('★ 名前が2つなら「・」でつなぐ', v.readBlockedNote('駅ちか', ['エステ魂', 'エステラブ']).startsWith('エステ魂・エステラブへ'), true);
  eq('★ 名前が無ければ名前のない言い方', v.readBlockedNote('駅ちか', []).startsWith('ほかのサイトへ'), true);

  // ★★★ 既にできてしまった形を画面で言う（ガードでは直らない）
  eq('★★★ 禁止の形が既にあるとき、write の行に出す1行',
     v.doubleWriteNote('エステ魂', '駅ちか'),
     '駅ちかから反映中のあいだ、エステ魂へはフクエスから反映しない決まりです。エステ魂の「反映しない」を押してください。');
  eq('★ ほかが正本でなければ null（何も言わない）', v.doubleWriteNote('エステ魂', null), null);
  eq('★ 失敗の言葉を使わない',
     /失敗|エラー|できませんでした/.test(v.doubleWriteNote('エステ魂', '駅ちか')), false);

  // ★★★ 画面が新しい関数を呼んでいる
  const fs4 = require('fs');
  const src4 = fs4.readFileSync(require('path').join(__dirname, '..', 'src/app/mypage/media/MediaHome.tsx'), 'utf8');
  const jsx4 = src4.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('★★ 画面は switchChoices に5つ目（writingElsewhere）を渡している', /switchChoices\([^)]*,\s*writingElsewhere\)/.test(jsx4), true);
  eq('★★ 画面は readBlockedNote を呼んでいる', /readBlockedNote\(/.test(jsx4), true);
  eq('★★ 画面は doubleWriteNote を呼んでいる', /doubleWriteNote\(/.test(jsx4), true);
  // ★★★ 受け口（サーバー）にも逆側のガードがある（画面だけで守らない）
  const act = fs4.readFileSync(require('path').join(__dirname, '..', 'src/app/actions/mediaCredentials.ts'), 'utf8');
  eq('★★★ setMediaLinkMode は read にするときも、ほかの write / write_auto を見ている',
     /input\.mode === 'read'\)\s*\{[\s\S]*?link_mode === 'write' \|\| r\.link_mode === 'write_auto'/.test(act), true);
}

console.log('\n── ★★★ 第192便: ホームを「3つの設定」にする（一括ボタン・純粋関数）──');
{
  const S = (o) => Object.assign({ provider: 'esutama', slot: 1, label: 'エステ魂', direction: 'off', hasCredential: true, autoOn: false }, o);
  const EK = (o) => S(Object.assign({ provider: 'ekichika', label: '駅ちか' }, o));
  const modes = (plan) => plan.steps.map((x) => x.provider + ':' + x.from);
  const skips = (plan) => plan.skipped.map((x) => x.provider + ':' + x.why);

  // ★★★ 順番: 駅ちか（read → write）が最初。★ 逆にすると第127便のガードで断られる
  eq('★★★ write へ: 駅ちかが read でも、駅ちかが先・そのあと他',
     modes(v.bulkPlan([S({ direction: 'off' }), EK({ direction: 'read' })], 'write')), ['ekichika:read', 'esutama:off']);
  eq('★★★ write へ: 並びが逆でも駅ちかが先（入力の順に依らない）',
     modes(v.bulkPlan([EK({ direction: 'read' }), S({ direction: 'off' })], 'write')), ['ekichika:read', 'esutama:off']);
  eq('★ 同じ媒体の中では枠の順',
     modes(v.bulkPlan([EK({ slot: 2, direction: 'off' }), EK({ slot: 1, direction: 'off' })], 'write')).length === 2
     && v.bulkPlan([EK({ slot: 2, direction: 'off' }), EK({ slot: 1, direction: 'off' })], 'write').steps[0].slot === 1, true);

  // ★★ write へ: 鍵が無い枠は飛ばして名前を出す（カッキーさんの決定）
  eq('★★ write へ: 鍵が無い枠は飛ばす（no_credential）',
     skips(v.bulkPlan([S({ hasCredential: false }), EK({ direction: 'off' })], 'write')), ['esutama:no_credential']);
  eq('★★ write へ: すでに write の枠は触らない（already）',
     skips(v.bulkPlan([S({ direction: 'write' })], 'write')), ['esutama:already']);
  eq('★★★ write へ: 自動（write_auto）を手動に落とさない（direction は write なので already）',
     v.bulkPlan([S({ direction: 'write', autoOn: true })], 'write').steps.length, 0);
  eq('★ write へ: unset でも鍵があれば変える（受け口が枠を作る・第111便）',
     modes(v.bulkPlan([S({ direction: 'unset' })], 'write')), ['esutama:unset']);
  eq('★ write 同士は通る（設定2＝全部フクエスから）',
     modes(v.bulkPlan([EK({ direction: 'write' }), S({ direction: 'off' })], 'write')), ['esutama:off']);

  // ★★ none へ: 常に通る形。取り込みも止まる
  eq('★★ none へ: read も write も全部 none（駅ちかが先）',
     modes(v.bulkPlan([S({ direction: 'write' }), EK({ direction: 'read' })], 'none')), ['ekichika:read', 'esutama:write']);
  eq('★ none へ: すでに off は触らない', skips(v.bulkPlan([S({ direction: 'off' })], 'none')), ['esutama:already']);
  eq('★ none へ: 鍵の無い unset は飛ばす', skips(v.bulkPlan([S({ direction: 'unset', hasCredential: false })], 'none')), ['esutama:no_credential']);
  eq('★ none へ: 鍵のある unset は none にする', modes(v.bulkPlan([S({ direction: 'unset' })], 'none')), ['esutama:unset']);
  eq('★★ none へ: 自動の枠も止める（自動は止める側には効く）',
     modes(v.bulkPlan([S({ direction: 'write', autoOn: true })], 'none')), ['esutama:write']);
  eq('★ 空なら空', v.bulkPlan([], 'write').steps.length + v.bulkPlan([], 'none').skipped.length, 0);
  eq('★ 計画は入力を壊さない', (() => { const a = [EK({ direction: 'read' }), S()]; const b = JSON.stringify(a); v.bulkPlan(a, 'write'); return JSON.stringify(a) === b; })(), true);

  // ★★ ボタンの文字（行き先の名前・カッキーさんの決定）
  eq('★ 主ボタン', v.bulkLabel('write'), { label: 'フクエスから反映', sub: '登録済みの全サイトへ' });
  eq('★ 副ボタン', v.bulkLabel('none'), { label: 'どのサイトにも反映しない', sub: 'フクエスのみで使う' });
  eq('★ 主ボタンの文字は switchLabel(write) と同じ（同じ状態に2つの名前を作らない）',
     v.bulkLabel('write').label, v.switchLabel('write', '駅ちか'));
  eq('★ 小リンクは「駅ちかから反映にする」', v.readLinkLabel('駅ちか'), '駅ちかから反映にする');
  eq('★ 小リンク: 名前が無ければ名前のない言い方', v.readLinkLabel(''), 'サイト側から反映にする');

  // ★★★ 押す前の問い: 名前を列挙・取り込みが止まることを言う・飛ばす枠の名前を出す
  const pW = v.bulkPlan([EK({ direction: 'read' }), S({ direction: 'off' }), S({ provider: 'esulove', label: 'エステラブ', hasCredential: false })], 'write');
  eq('★★★ write の問いの見出しはボタンの文字で始まる', v.bulkAskText(pW).title.startsWith(v.bulkLabel('write').label), true);
  eq('★★ write の本文に変える枠の名前が全部入る', v.bulkAskText(pW).body.includes('駅ちか・エステ魂へ反映する'), true);
  eq('★★★ write の本文: 駅ちかからの取り込みが止まると書く', v.bulkAskText(pW).body.includes('駅ちかからの取り込みは止まります'), true);
  eq('★★★ write の本文: 鍵が無い枠は名前を出して「変わりません」', v.bulkAskText(pW).body.includes('エステラブはログイン情報が無いので変わりません'), true);
  eq('★ write の本文: 毎回確認すると書く（自動にはしない）', v.bulkAskText(pW).body.includes('毎回内容をご確認'), true);
  const pW2 = v.bulkPlan([EK({ direction: 'off' }), S({ direction: 'off' })], 'write');
  eq('★ 駅ちかが read でなければ「取り込みは止まります」と書かない（止まらないものを止めると書かない）',
     v.bulkAskText(pW2).body.includes('取り込み'), false);

  const pN = v.bulkPlan([EK({ direction: 'read' }), S({ direction: 'write' })], 'none');
  eq('★★★ none の問いの見出しはボタンの文字で始まる', v.bulkAskText(pN).title.startsWith(v.bulkLabel('none').label), true);
  eq('★★★ none の本文: 送らなくなる枠の名前', v.bulkAskText(pN).body.includes('駅ちか・エステ魂へは送らなくなります'), true);
  eq('★★★ none の本文: 駅ちかからの取り込みも止まると必ず書く', v.bulkAskText(pN).body.includes('駅ちかからの取り込みも止まります'), true);
  const pN2 = v.bulkPlan([S({ direction: 'write' })], 'none');
  eq('★★ none の本文: 取り込んでいない店でも「どのサイトからも取り込みません」と言い切る', v.bulkAskText(pN2).body.includes('どのサイトからも取り込みません'), true);
  eq('★ 問いは「？」で終わる', ['write', 'none'].every((t) => v.bulkAskText(v.bulkPlan([S({ direction: t === 'write' ? 'off' : 'write' })], t)).title.endsWith('？')), true);
  // ★ 変えるところが無いとき
  eq('★ 変えるところが無いとき: 見出しでそう言う（？で終わらない）', v.bulkAskText(v.bulkPlan([S({ direction: 'write' })], 'write')).title, '変えるところがありません');
  eq('★ 変えるところが無いとき（none）', v.bulkAskText(v.bulkPlan([S({ direction: 'off' })], 'none')).title, '変えるところがありません');
  eq('★ 変えるところが無くても、飛ばした枠の名前は出す',
     v.bulkAskText(v.bulkPlan([S({ direction: 'write' }), S({ provider: 'esulove', label: 'エステラブ', hasCredential: false })], 'write')).body.includes('エステラブはログイン情報が無い'), true);

  // ★★★ 押したあとの文: どこまで変わったかを言う
  const ch = (labels) => labels.map((l, i) => ({ provider: 'p' + i, slot: 1, label: l }));
  eq('★ write: 全部通った', v.bulkDoneText({ to: 'write', changed: ch(['駅ちか', 'エステ魂']), skipped: [], stoppedAt: null }),
     'フクエスから駅ちか・エステ魂へ反映するようにしました。送る前に、毎回内容をご確認いただきます');
  eq('★ none: 全部通った', v.bulkDoneText({ to: 'none', changed: ch(['駅ちか', 'エステ魂']), skipped: [], stoppedAt: null }),
     'どのサイトにも反映しないようにしました（駅ちか・エステ魂）。フクエスに入れた出勤は、そのまま残ります');
  eq('★★★ 途中で止まった: どこまで変わったか＋どこで＋理由',
     v.bulkDoneText({ to: 'write', changed: ch(['駅ちか']), skipped: [], stoppedAt: { provider: 'esutama', slot: 1, label: 'エステ魂', error: 'この枠はいま止まっています' } }),
     '駅ちかは変えましたが、エステ魂で止まりました：この枠はいま止まっています');
  eq('★★★ 最初で止まった: 「変えました」と言わない',
     v.bulkDoneText({ to: 'write', changed: [], skipped: [], stoppedAt: { provider: 'ekichika', slot: 1, label: '駅ちか', error: 'x' } }).startsWith('駅ちかで止まりました'), true);
  eq('★ 何も変わらなかった', v.bulkDoneText({ to: 'none', changed: [], skipped: [], stoppedAt: null }), '変えるところはありませんでした');
  eq('★ 止まった文は「変えました」だけで終わらない（黙って続けない・黙って止めない）',
     v.bulkDoneText({ to: 'none', changed: ch(['駅ちか']), skipped: [], stoppedAt: { provider: 'esutama', slot: 1, label: 'エステ魂', error: 'x' } }).includes('止まりました'), true);

  // ★★★ 文言に「どのサイトへも」を残さない（1枠のボタンの文）。★ 一括の文にだけ「どのサイトにも」がある
  eq('★★★ 1枠の文言（問い・結果・説明）に「どのサイトへも」が無い',
     [v.switchAskText('none', '駅ちか', EKI).body, v.switchDoneText('none', '駅ちか', EKI), v.homeChoiceNote('駅ちか')]
       .some((t) => t.includes('どのサイトへも')), false);

  // ★★★ 画面と受け口の配線
  const fs5 = require('fs');
  const path5 = require('path');
  const jsx5 = fs5.readFileSync(path5.join(__dirname, '..', 'src/app/mypage/media/MediaHome.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  eq('★★ 画面は setAllLinkModes を呼んでいる', /setAllLinkModes\(\{/.test(jsx5), true);
  eq('★★ 画面は bulkAskText / bulkDoneText / bulkLabel / readLinkLabel を呼んでいる',
     ['bulkAskText(', 'bulkDoneText(', 'bulkLabel(', 'readLinkLabel('].every((f) => jsx5.includes(f)), true);
  eq('★★★ 画面に「どのサイトへも送りません」の直書きが無い', jsx5.includes('どのサイトへも'), false);
  eq('★★ 駅ちかの行には none だけ（read/write は上の3つの設定へ）', /canReadProvider\(s\.provider\) \? all\.filter\(\(c\) => c\.mode === 'none'\)/.test(jsx5), true);
  const act5 = fs5.readFileSync(path5.join(__dirname, '..', 'src/app/actions/mediaCredentials.ts'), 'utf8');
  eq('★★★ 受け口: setAllLinkModes は applyLinkMode を1枠ずつ呼ぶ（ガードを二重に書かない）',
     /export async function setAllLinkModes[\s\S]*?for \(const step of plan\.steps\)[\s\S]*?await applyLinkMode\(/.test(act5), true);
  eq('★★★ 受け口: 断られたら break（黙って続けない）',
     /export async function setAllLinkModes[\s\S]*?if \(!r\.ok\) \{[\s\S]*?stoppedAt[\s\S]*?break;/.test(act5), true);
  eq('★★★ 受け口: setMediaLinkMode も applyLinkMode を通る（同じ道）',
     /export async function setMediaLinkMode[\s\S]*?return applyLinkMode\(/.test(act5), true);
  eq('★★ 受け口: 一括は by: \'bulk\' で記録', /by: 'bulk'/.test(act5), true);
  eq('★★★ 受け口: 一括の行き先は write | none だけ（read への一括は無い）',
     /input\.to !== 'write' && input\.to !== 'none'/.test(act5), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
