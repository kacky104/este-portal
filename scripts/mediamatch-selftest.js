// 媒体へ送る前の突き合わせ（src/lib/mediaMatch.ts）の自己点検（第72便）。
//
// ★★★ なぜ要るか
//   ㉟ で実物を見た結果、エステラブは同じ名前でもう一度登録すると**黙って2人になる**。
//   ★ この判定を1つ間違えると、送るたびに人が増える／他人の欄に出勤が入る。
//   ★ どちらも店舗の掲載を壊す。だから、境界を全部ここで固定する。
//
//   使い方:  npm run check:mediamatch

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaMatch.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

const e = (castId, name) => ({ castId, name });
const ROSTER = [e('696449', 'さら'), e('696450', 'るい'), e('696451', 'えま')];

// ── ★★ 読めていない と 居ない を混ぜない（作法3-5）──
eq('名簿が null なら unknown', m.matchTherapistByName(null, 'さら').kind, 'unknown');
eq('名簿が空（0人）なら absent', m.matchTherapistByName([], 'さら').kind, 'absent');
// ★ 名前が空のときは「居ない」と答えない。答えると空名で登録してしまう
eq('名前が空なら unknown', m.matchTherapistByName(ROSTER, '').kind, 'unknown');
eq('名前が空白だけでも unknown', m.matchTherapistByName(ROSTER, '   ').kind, 'unknown');

// ── ちょうど1人 ──
eq('1人だけ居れば single', m.matchTherapistByName(ROSTER, 'さら').kind, 'single');
eq('その castId を返す', m.matchTherapistByName(ROSTER, 'さら').castId, '696449');
eq('居なければ absent', m.matchTherapistByName(ROSTER, 'ひまり').kind, 'absent');

// ── ★★★ 2人以上は送らない（㉟ で実際に起きた形）──
const DUP = [e('696449', 'てすら0831'), e('696450', 'てすら0831'), e('696451', 'さら')];
eq('同名2人なら ambiguous', m.matchTherapistByName(DUP, 'てすら0831').kind, 'ambiguous');
eq('★ どちらの castId も返す（人が整理できるように）',
  m.matchTherapistByName(DUP, 'てすら0831').castIds, ['696449', '696450']);
// ★ 「1人目に送る」で済ませない。それをやると、片方が永久に更新されないまま残る
eq('ambiguous のときは castId 単体を返さない',
  m.matchTherapistByName(DUP, 'てすら0831').castId, undefined);

// ── 名前を揃えるのは「空白」と「全角半角」だけ ──
eq('前後の空白は無視する', m.matchTherapistByName(ROSTER, '  さら  ').kind, 'single');
eq('間の連続空白は1つとして扱う', m.normalizeName('さら   ちゃん'), 'さら ちゃん');
eq('半角カナは普通のカナに揃える', m.normalizeName('ﾐｷ'), 'ミキ');
eq('全角英数は半角に揃える', m.normalizeName('Ａ１'), 'A1');
// ★★★ 読みが同じでも、文字が違えば別人。★ 揃えると他人の欄に出勤を入れる事故になる
eq('ひらがなとカタカナは別人', m.matchTherapistByName([e('1', 'あい')], 'アイ').kind, 'absent');
eq('ひらがなと漢字も別人', m.matchTherapistByName([e('1', 'あい')], '愛').kind, 'absent');

// ── まとめて計画する ──
const targets = [
  { therapistId: 1, name: 'さら' },        // 居る
  { therapistId: 2, name: 'ひまり' },      // 居ない
  { therapistId: 3, name: 'てすら0831' },  // 2人居る
];
const plan = m.planRosterWrite(DUP, targets);
eq('居る人は toUse へ', plan.toUse.map((x) => [x.therapistId, x.castId]), [[1, '696451']]);
eq('居ない人は toRegister へ', plan.toRegister.map((x) => x.therapistId), [2]);
eq('重複した人は blocked へ', plan.blocked.map((x) => [x.therapistId, x.reason]), [[3, 'ambiguous']]);
// ★ 送れない人が1人居ても、送れる人は送る（1人のせいで全員止めない）
eq('送れる人は送る', plan.toUse.length + plan.toRegister.length, 2);

// ★★ 名簿が読めていないときだけ、全部止める。
//   読めていないのに登録すると、全員ぶん重複を作る
const blind = m.planRosterWrite(null, targets);
eq('名簿が読めなければ1人も送らない', blind.toUse.length + blind.toRegister.length, 0);
eq('全員が blocked に入る', blind.blocked.length, 3);
eq('理由は unknown', blind.blocked.map((x) => x.reason), ['unknown', 'unknown', 'unknown']);

// ── 送らなかった人は、必ず言葉にする ──
eq('重複の文',
  m.blockedMessage({ name: 'てすら0831', reason: 'ambiguous', castIds: ['1', '2'] }),
  'てすら0831さんは、媒体側に同じ名前で2人登録されているため送っていません。媒体の管理画面で重複を整理してください');
eq('読めなかったときの文',
  m.blockedMessage({ name: 'さら', reason: 'unknown', castIds: [] }),
  'さらさんは、媒体側の名簿を読み取れなかったため送っていません');

// ── 送る前の1行 ──
eq('内訳をそのまま言う', m.planSummary(plan), '登録済み 1人へ反映 / 新しく 1人を登録 / ★ 1人は送りません');
// ★ 0件のときに「変更なし」と言わない。相手が居ないことを言う
eq('相手が0人なら、そう言う', m.planSummary(m.planRosterWrite([], [])), '送る相手が1人もいません');
eq('送るものが無ければ planIsEmpty', m.planIsEmpty(blind), true);
eq('送るものがあれば false', m.planIsEmpty(plan), false);

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
