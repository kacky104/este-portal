// 同意文と版の判定（src/lib/mediaConsent.ts）の自己点検（第89便）。
//
// ★★★ ここで守りたいこと
//   版を上げると【何も知らせないまま】送信と接続テストが止まる。
//   ★ 2026-08-31 に実際にそれをやってしまった（カッキーさんの指摘）。
//   ★★ 「まだ同意していない」と「古い版に同意している」を1つにしない
//     （引き継ぎメモ 3-5「0件と分からないを混ぜない」の、同意版の版）。
//
//   使い方:  npm run check:mediaconsent

const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaConsent.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 同意が要るか ──');
eq('★ 一度も同意していない（null）は要る', v.needsConsent(null), true);
eq('★ undefined も要る', v.needsConsent(undefined), true);
eq('★ 空文字も要る', v.needsConsent(''), true);
eq('★ 文字列でなければ要る', v.needsConsent(123), true);
eq('いまの版に同意済みなら要らない', v.needsConsent(v.MEDIA_CONSENT_VERSION), false);
// ★★★ 知らない版は【要る側】に倒す
eq('★★ 知らない版は要る', v.needsConsent('v9-2099-01-01'), true);

console.log('\n── 2. ★★★ 言い方を直しただけの版は、取り直させない ──');
eq('★ 一覧が空でない（今回の v1 が入っている）',
   v.MEDIA_CONSENT_WORDING_ONLY.length > 0, true);
eq('★★ 一覧の版はすべて取り直し不要',
   v.MEDIA_CONSENT_WORDING_ONLY.every((x) => v.needsConsent(x) === false), true);
// ★★★ いまの版を一覧に入れない（入れると意味が壊れる・自己参照になる）
eq('★★★ いまの版は一覧に入れない',
   v.MEDIA_CONSENT_WORDING_ONLY.indexOf(v.MEDIA_CONSENT_VERSION) >= 0, false);
// ★ 一覧に空や非文字列を混ぜない（混ぜると「同意していない」が通ってしまう）
eq('★★★ 一覧に空文字を入れない',
   v.MEDIA_CONSENT_WORDING_ONLY.some((x) => typeof x !== 'string' || x.length === 0), false);

console.log('\n── 3. 版の形 ──');
eq('★ 版は空でない', typeof v.MEDIA_CONSENT_VERSION === 'string' && v.MEDIA_CONSENT_VERSION.length > 0, true);

console.log('\n── 4. ★★★ 第4項（権限の範囲）を消さない ──');
// ★ 駅ちかの管理画面から求人サイトへ入れる（第38便 §6）。★ 先に言えば注意書き、後なら隠していた
const bodies = v.MEDIA_CONSENT_SECTIONS.map((s) => s.heading + ' ' + s.body).join('\n');
eq('★★★ 求人サイトの話が残っている', bodies.indexOf('求人サイト') >= 0, true);
eq('★★ 「駅ちかだけに収まりません」が残っている', bodies.indexOf('駅ちかだけに収まりません') >= 0, true);
eq('★ 記録が残ることを書いている', bodies.indexOf('記録') >= 0, true);
eq('★ 止められることを書いている', bodies.indexOf('止め') >= 0 || bodies.indexOf('停止') >= 0, true);

console.log('\n── 5. ★★ 消した言い方が戻っていないか（第89便）──');
// ★★ 「連携を停止」は第87便で消した言い方。★ 倒れる旗が違うので、取り込みまで止まったと読める
eq('★★★ 同意文に「連携を停止」を書かない', bodies.indexOf('連携を停止') >= 0, false);
// ★★★ 同意文にボタンの名前を書かない（第90便）。★ 名前は変わる。
//   ★ 書くと、名前を直すたびに同意文が嘘になり、そのたびに版を上げることになる。
eq('★★★ ボタン名「フクエスだけで使う」を書かない', bodies.indexOf('フクエスだけで使う') >= 0, false);
eq('★★★ ボタン名「ログインを一時停止」を書かない', bodies.indexOf('ログインを一時停止') >= 0, false);
eq('★★★ ボタン名「反映しない」を書かない', bodies.indexOf('反映しない') >= 0, false);

console.log('\n── 6. ★★★ 取り直しが要ることを、開かなくても分かる形にする ──');
const n1 = v.consentRecheckNotice(['駅ちか']);
const n2 = v.consentRecheckNotice(['駅ちか', 'エステラブ']);
const n0 = v.consentRecheckNotice([]);

eq('★ 見出しは短く言い切る', n1.title, '同意の取り直しが必要です');
// ★★★ 【何が止まっているか】を先に書く。★ 「同意してください」だけでは理由が読めない
eq('★★★ 止まっていることを書く', n1.body.indexOf('送っていません') >= 0, true);
eq('★★ 接続テストも押せないことを書く', n1.body.indexOf('接続テスト') >= 0, true);
eq('★★ 同意すれば戻ることを書く', n1.body.indexOf('元どおり') >= 0, true);
eq('★ サイト名が入る', n1.body.indexOf('駅ちか') >= 0, true);
eq('★ 2つなら両方入る',
   n2.body.indexOf('駅ちか') >= 0 && n2.body.indexOf('エステラブ') >= 0, true);
// ★★ 名前が読めないときは、嘘の名前を出さない
eq('★★ 名前が無ければ、名前のない言い方に倒す', n0.body.indexOf('いくつかのサイト') >= 0, true);
eq('★★ 名前が無いのに「駅ちか」と書かない', n0.body.indexOf('駅ちか') >= 0, false);
eq('★ 空文字の名前は捨てる', v.consentRecheckNotice(['', '駅ちか']).body.indexOf('・') >= 0, false);
// ★ 印は短く。★ 見出しの横に並ぶ
eq('★ 印の文字', v.CONSENT_RECHECK_BADGE, '同意の取り直し');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
