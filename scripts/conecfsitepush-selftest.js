// コネックエフ「保存して更新」: 送る枠と、お知らせのまとめ方（src/lib/conecfSitePush.ts）の自己点検（第1289便・2026-10-07）。
//
// ★★★ ここで守りたいこと
//   ① 更新は枠1固定にしない（2枠ある店の枠2へも送る）。送らない枠（停止中・「反映しない」）へは送らない
//   ② 駅ちかの結果を、エステ魂のお知らせで上書きしない（1つにまとめる）
//   ③ その店が送っていないサイトのことを、失敗のように言わない
//
//   使い方:  npm run check:conecfsitepush

const P = require(require('path').join(__dirname, '..', '_tmpcheck', 'conecfSitePush.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 送る枠 ──');
eq('1枠の店（いまの店）は枠1だけ＝今までどおり', P.conecfPushSlots([{ slot: 1, is_enabled: true }], [{ slot: 1, link_mode: 'write_auto' }]), [1]);
// ★★★ 直す前は、どんな店でも枠1だけだった
eq('★★★ 2枠の店は、枠1と枠2', P.conecfPushSlots([{ slot: 2, is_enabled: true }, { slot: 1, is_enabled: true }], [{ slot: 1, link_mode: 'write' }, { slot: 2, link_mode: 'write' }]), [1, 2]);
eq('★★ 枠2だけ登録した店は、枠2だけ', P.conecfPushSlots([{ slot: 2, is_enabled: true }], [{ slot: 2, link_mode: 'write' }]), [2]);
eq('★★ 「反映しない」の枠へは送らない', P.conecfPushSlots([{ slot: 1, is_enabled: true }, { slot: 2, is_enabled: true }], [{ slot: 1, link_mode: 'write' }, { slot: 2, link_mode: 'none' }]), [1]);
eq('★★ 止めてあるログイン情報の枠へは送らない', P.conecfPushSlots([{ slot: 1, is_enabled: true }, { slot: 2, is_enabled: false }], [{ slot: 1, link_mode: 'write' }, { slot: 2, link_mode: 'write' }]), [1]);
eq('★ 向きの行が無い枠は通す（startRelayFlow と同じ）', P.conecfPushSlots([{ slot: 1, is_enabled: true }], []), [1]);
eq('★ ログイン情報が無ければ、送る枠は無い', P.conecfPushSlots([], [{ slot: 1, link_mode: 'write' }]), []);
eq('★ is_enabled が null・未定義は送らない側', P.conecfPushSlots([{ slot: 1, is_enabled: null }, { slot: 2 }], []), []);
eq('★ 枠の番号が壊れている行は捨てる', P.conecfPushSlots([{ slot: 0, is_enabled: true }, { slot: 1.5, is_enabled: true }, { slot: 1, is_enabled: true }], []), [1]);
eq('枠の呼び名: 枠1はサイト名だけ', [P.pushSlotLabel('駅ちか', 1), P.pushSlotLabel('駅ちか', 2)], ['駅ちか', '駅ちか（枠2）']);

console.log('\n── 2. 1サイトぶんをまとめる ──');
eq('1枠・受け付けた', P.summarizeSlotPushes('駅ちか', [{ slot: 1, state: 'queued' }]), { ok: true, queued: ['駅ちか'], notes: [] });
eq('★★★ 2枠とも受け付けた', P.summarizeSlotPushes('駅ちか', [{ slot: 1, state: 'queued' }, { slot: 2, state: 'queued' }]), { ok: true, queued: ['駅ちか', '駅ちか（枠2）'], notes: [] });
eq('★★ 枠2だけ送れなかった: 受け付けた枠と、送れなかった理由の両方',
   P.summarizeSlotPushes('駅ちか', [{ slot: 1, state: 'queued' }, { slot: 2, state: 'failed', note: 'この方は駅ちかと連携していません' }]),
   { ok: true, queued: ['駅ちか'], notes: ['駅ちか（枠2）：この方は駅ちかと連携していません'] });
eq('★★ 枠2は「送り先サイト」で送らない設定: わざとなので言わない',
   P.summarizeSlotPushes('駅ちか', [{ slot: 1, state: 'queued' }, { slot: 2, state: 'off', note: '送らない設定です' }]),
   { ok: true, queued: ['駅ちか'], notes: [] });
eq('1枠・送れなかった: 理由をそのまま（枠の名前は付けない）',
   P.summarizeSlotPushes('駅ちか', [{ slot: 1, state: 'failed', note: 'この方は駅ちかと連携していません' }]),
   { ok: false, error: 'この方は駅ちかと連携していません', off: false });
eq('★ 全部の枠が「送らない設定」: 失敗ではない（off）',
   P.summarizeSlotPushes('エステ魂', [{ slot: 1, state: 'off', note: '送らない設定です' }]), { ok: false, error: '送らない設定です', off: true });
const none = P.summarizeSlotPushes('エステ魂', []);
eq('★★★ 送る枠が無い店: 失敗ではない（off）', [none.ok, none.off], [false, true]);
eq('★ そのときの文に、サイト名と見る場所が入る', none.error.indexOf('エステ魂') >= 0 && none.error.indexOf('ホーム') >= 0, true);

console.log('\n── 3. ★★★ お知らせは1つにまとめる ──');
const sentEk = { site: '駅ちか', state: 'sent', labels: ['駅ちか'], notes: [] };
const sentEs = { site: 'エステ魂', state: 'sent', labels: ['エステ魂'], notes: [] };
const offEs = { site: 'エステ魂', state: 'off', note: none.error };
const failEk = { site: '駅ちか', state: 'failed', note: 'いま駅ちかで別の更新が動いています。少し待ってからお試しください' };
eq('両方受け付けた', P.sitePushToast([sentEk, sentEs]), '駅ちか・エステ魂への更新を受け付けました。結果は「更新結果」に出ます');
// ★★★ 直す前: 駅ちかだけの店は、毎回最後に「エステ魂と連携していません」が残って失敗に見えた
const onlyEk = P.sitePushToast([sentEk, offEs]);
eq('★★★ 駅ちかだけの店: エステ魂のことは言わない', onlyEk, '駅ちかへの更新を受け付けました。結果は「更新結果」に出ます');
// ★★★ 直す前: 駅ちかの失敗の理由が、直後のエステ魂のお知らせで上書きされた
const mixed = P.sitePushToast([failEk, sentEs]);
eq('★★★ 駅ちかが失敗・エステ魂は受け付け: 両方が1つのお知らせに入る',
   mixed.indexOf('エステ魂への更新を受け付けました') >= 0 && mixed.indexOf('駅ちかへは更新を送っていません：いま駅ちかで別の更新が動いています') >= 0, true);
eq('★★ どちらのサイトへも送っていない店: お知らせは出さない（「保存しました」を残す）', P.sitePushToast([{ site: '駅ちか', state: 'off' }, offEs]), null);
eq('結果が1つも無い（切り替え前）も null', P.sitePushToast([]), null);
eq('★★ 写真の確認で止まったサイトは「確認のあとに更新」と言う',
   P.sitePushToast([{ site: '駅ちか', state: 'confirm' }, sentEs]),
   'エステ魂への更新を受け付けました。結果は「更新結果」に出ます　／　駅ちかは、写真の確認のあとに更新します');
eq('★★ 2枠で枠2だけ送れなかった: 送っていない枠を言う',
   P.sitePushToast([{ site: '駅ちか', state: 'sent', labels: ['駅ちか'], notes: ['駅ちか（枠2）：この方は駅ちかと連携していません'] }]),
   '駅ちかへの更新を受け付けました。結果は「更新結果」に出ます　／　送っていない枠があります（駅ちか（枠2）：この方は駅ちかと連携していません）');
eq('★★★ 2枠とも受け付けた: 枠2も名前に出る',
   P.sitePushToast([{ site: '駅ちか', state: 'sent', labels: ['駅ちか', '駅ちか（枠2）'], notes: [] }]),
   '駅ちか・駅ちか（枠2）への更新を受け付けました。結果は「更新結果」に出ます');
// ★ 名指しで押したとき（「保存して駅ちかへ更新」）は、送っていない理由を言う
eq('★★ 名指しで押したのに送る設定が無い: 理由を言う（黙らない）',
   P.sitePushToast([offEs], { explicit: true }), 'エステ魂へは更新を送っていません：' + none.error);
eq('名指し・受け付けた', P.sitePushToast([sentEk], { explicit: true }), '駅ちかへの更新を受け付けました。結果は「更新結果」に出ます');

console.log('\n── 4. ★★★ 順番待ちで受け付けた（第1296便） ──');
eq('★★ 順番待ちでも「受け付けた」に数える（waiting は順番待ちの枠だけ）',
   P.summarizeSlotPushes('駅ちか', [{ slot: 1, state: 'queued', waiting: true }, { slot: 2, state: 'queued' }]),
   { ok: true, queued: ['駅ちか', '駅ちか（枠2）'], notes: [], waiting: ['駅ちか'] });
eq('★ 順番待ちが無ければ、waiting の項目ごと無い（今までと同じ形）',
   Object.keys(P.summarizeSlotPushes('駅ちか', [{ slot: 1, state: 'queued' }])), ['ok', 'queued', 'notes']);
eq('★★★ お知らせに「終わりしだい順番に始めます」を足す（断っていない）',
   P.sitePushToast([{ ...sentEk, waiting: ['駅ちか'] }, sentEs]),
   '駅ちか・エステ魂への更新を受け付けました。結果は「更新結果」に出ます　／　駅ちかは別の更新が動いているため、終わりしだい順番に始めます（15分たっても始まらないときは取りやめて「更新結果」に出します）');
eq('★ 順番待ちが無いときの文は、今までと一字も変わらない', P.sitePushToast([{ ...sentEk, waiting: [] }, sentEs]), P.sitePushToast([sentEk, sentEs]));

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
