// セットの契約と入口の守り（src/lib/setPlan.ts）の自己点検（第1291便・2026-10-07）。
//
// ★★★ ここで守りたいこと
//   ① 各サイトを書き換える流れは、コネックエフに切り替えた店だけ（切り替えを戻した店に向きが残っていても送らない）
//   ② 読むだけの流れ（フクエスリンクの取り込み・接続テスト）は、切り替えていない店でも止めない
//   ③ 止めている店（切り替え済み・セットの契約なし）は、読むだけの流れも、コネックエフの画面からの保存も止める
//
//   使い方:  npm run check:setplan

const S = require(require('path').join(__dirname, '..', '_tmpcheck', 'setPlan.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const TODAY = '2026-10-07';
const ON = { conecfEnabledAt: '2026-10-05T12:41:54Z', crmUntil: '2099-12-31' };        // 切り替え済み・契約あり（ラビリンス様の形）
const LINK = { conecfEnabledAt: null, crmUntil: null };                                 // 切り替えていない（フクエスリンクの店）
const LINK_CRM = { conecfEnabledAt: null, crmUntil: '2099-12-31' };                     // 契約はあるが、まだ切り替えていない
const STOPPED = { conecfEnabledAt: '2026-10-05T12:41:54Z', crmUntil: '2026-10-01' };    // 切り替え済み・契約が切れた
const STOPPED_NULL = { conecfEnabledAt: '2026-10-05T12:41:54Z', crmUntil: null };

console.log('── 1. 契約と「止めている店」（今までの決まり）──');
eq('契約は期限の日まで有効', [S.isSetPlanActive('2026-10-07', TODAY), S.isSetPlanActive('2026-10-06', TODAY), S.isSetPlanActive(null, TODAY)], [true, false, false]);
eq('止めている店＝切り替え済みで契約なし', [S.isConecfStopped(ON, TODAY), S.isConecfStopped(STOPPED, TODAY), S.isConecfStopped(STOPPED_NULL, TODAY)], [false, true, true]);
eq('★ 切り替えていない店は「止めている店」ではない', [S.isConecfStopped(LINK, TODAY), S.isConecfStopped(LINK_CRM, TODAY)], [false, false]);

console.log('\n── 2. ★★★ 中継の流れを始めてよいか ──');
const flow = (s, write) => S.conecfFlowBlockMessage(s, TODAY, { write });
eq('★★★ 切り替え済み・契約あり: 書く流れも読む流れも通す（今までどおり）', [flow(ON, true), flow(ON, false)], [null, null]);
// ★★★ 直す前: 切り替えを戻した店に向き（フクエスから反映）が残っていると、手で押した送信は通っていた
eq('★★★ 切り替えていない店: 書き換える流れは止める', flow(LINK, true), S.CONECF_NEED_SWITCH_MESSAGE);
eq('★★★ 切り替えていない店: 読むだけの流れは止めない（フクエスリンクの取り込み）', flow(LINK, false), null);
eq('★★ 契約があっても、切り替えていなければ書き換えない', flow(LINK_CRM, true), S.CONECF_NEED_SWITCH_MESSAGE);
eq('★★ 止めている店: 書く流れも読む流れも止める（第1243便のまま）', [flow(STOPPED, true), flow(STOPPED, false)], [S.CONECF_STOPPED_MESSAGE, S.CONECF_STOPPED_MESSAGE]);
eq('★ 文に、次にすること（切り替える）が入る', S.CONECF_NEED_SWITCH_MESSAGE.indexOf('コネックエフに切り替える') >= 0, true);

console.log('\n── 3. ★★★ コネックエフの画面からの保存（公開／非公開など）──');
const screen = (s) => S.conecfScreenBlockMessage(s, TODAY);
eq('切り替え済み・契約あり: 通す', screen(ON), null);
// ★★★ 直す前: 公開／非公開だけ、止めている店でも通っていた
eq('★★★ 止めている店: 断る', [screen(STOPPED), screen(STOPPED_NULL)], [S.CONECF_STOPPED_MESSAGE, S.CONECF_STOPPED_MESSAGE]);
eq('★★ 切り替える前の店: 断る（見るだけ）', typeof screen(LINK) === 'string' && screen(LINK).indexOf('コネックエフに切り替える') >= 0, true);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
