// 媒体連携の「書き込みのまま止まっている」判定（src/lib/mediaLinkStall.ts）の自己点検（第47便）。
//
// ★★★ なぜ要るか
//   この判定は【時間が経たないと出ない】。手で確かめようとすると24時間待つことになり、
//   結局「たぶん出るはず」で済ませてしまう。★ now を引数にしてあるのは、そのため。
//   → 24時間後・26時間後・境界ちょうど、を **いま** 作って確かめる。
//
//   使い方:  npm run check:linkstall
//
// ★ 期待値を直すときは【なぜその値が正しいのか】をコメントに残すこと。

const ls = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaLinkStall.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

const NOW = new Date('2026-08-30T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();

const judge = (o) => ls.judgeWriteStall(Object.assign({ now: NOW }, o));

// ── 向きが write でなければ、何があっても出さない ──
eq('read は対象外', judge({
  linkMode: 'read', switchedToWriteAt: hoursAgo(100), lastWriteOkAt: null,
}).stalled, false);
eq('none は対象外', judge({
  linkMode: 'none', switchedToWriteAt: hoursAgo(100), lastWriteOkAt: null,
}).stalled, false);
eq('null は対象外', judge({
  linkMode: null, switchedToWriteAt: hoursAgo(100), lastWriteOkAt: null,
}).stalled, false);
// ★ 自動の枠も見張る（第48便）。自動にしたまま止まることは起きる
eq('write_auto も見張る', judge({
  linkMode: 'write_auto', switchedToWriteAt: hoursAgo(100), lastWriteOkAt: hoursAgo(30),
}).stalled, true);

// ── ★★★ 根拠が無いときは黙る（嘘の警告を出さない）──
//   監査ログが取れなかった／切り替えの記録が無い場合に「一度も送っていない」と
//   決めつけると、実際には送っている店に警告が出る。設計メモ §26 と同じ罠。
eq('切替時刻も反映時刻も無ければ判定しない', judge({
  linkMode: 'write', switchedToWriteAt: null, lastWriteOkAt: null,
}).stalled, false);
eq('読めない時刻は無いものと同じ', judge({
  linkMode: 'write', switchedToWriteAt: 'いつか', lastWriteOkAt: null,
}).stalled, false);

// ── never_sent（切り替えたが一度も反映していない）──
eq('切替23時間後はまだ出さない', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(23), lastWriteOkAt: null,
}).stalled, false);
eq('切替24時間ちょうどで出す', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(24), lastWriteOkAt: null,
}).stalled, true);
eq('切替26時間後の理由は never_sent', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(26), lastWriteOkAt: null,
}).reason, 'never_sent');

// ── stale（反映したことはあるが久しく止まっている）──
//   ★ 起点は「最後に反映できた時刻」。切替が何日前でも、昨日送っていれば出さない。
eq('切替は5日前でも、1時間前に反映していれば出さない', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(120), lastWriteOkAt: hoursAgo(1),
}).stalled, false);
eq('最後の反映が30時間前なら出す', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(120), lastWriteOkAt: hoursAgo(30),
}).reason, 'stale');

// ── 時計のずれ（未来の時刻）で負の数を人に見せない ──
eq('未来の時刻は出さない', judge({
  linkMode: 'write', switchedToWriteAt: new Date(NOW.getTime() + 3600000).toISOString(), lastWriteOkAt: null,
}).stalled, false);
eq('未来の時刻の経過は0', judge({
  linkMode: 'write', switchedToWriteAt: new Date(NOW.getTime() + 3600000).toISOString(), lastWriteOkAt: null,
}).elapsedHours, 0);

// ── 長さの表記。★ 切り捨て（実際より長く言わない）──
eq('25.9時間 → 25時間', ls.elapsedLabel(25.9), '25時間');
eq('47時間はまだ時間', ls.elapsedLabel(47), '47時間');
eq('48時間から日', ls.elapsedLabel(48), '2日');
eq('71時間 → 2日', ls.elapsedLabel(71), '2日');

// ── 文言。★ 止まっていなければ null（「異常なし」の行を作らない）──
eq('止まっていなければ文言は出ない',
  ls.stallMessage(judge({ linkMode: 'read', switchedToWriteAt: hoursAgo(100), lastWriteOkAt: null }), '駅ちか（枠1）'),
  null);
{
  const m = ls.stallMessage(judge({
    linkMode: 'write', switchedToWriteAt: hoursAgo(30), lastWriteOkAt: null,
  }), '駅ちか（枠1）', { name: '駅ちか', canRead: true });
  eq('never_sent の文言に枠が入る', m.indexOf('駅ちか（枠1）') === 0, true);
  eq('never_sent の文言に戻し方が入る', m.indexOf('戻してください') > 0, true);
  // ★ 店舗が読む1行に英語のエラー文字列を混ぜない（監査ログ migration の作法）
  eq('never_sent の文言に never_sent と出ない', m.indexOf('never_sent'), -1);
}

// ── ★★★ 送り先の名前を決め打ちしない（第133-6便・2026-09-04）──
// ★ 実際にラビリンス様の画面へ「esutama（枠1）は『フクエスから【駅ちか】へ反映する』向き」と出た。
//   ★ エステ魂の話なのに送り先が駅ちか。★ 媒体が1つだった頃の文言が直っていなかった。
{
  const stale = ls.judgeWriteStall({
    linkMode: 'write', switchedToWriteAt: hoursAgo(100), lastWriteOkAt: hoursAgo(41), now: NOW,
  });
  const esutama = ls.stallMessage(stale, 'エステ魂（枠1）', { name: 'エステ魂', canRead: false });
  eq('★★★ 送り先はエステ魂と書く', esutama.indexOf('フクエスからエステ魂へ反映する') > 0, true);
  // ★★★ ここが今回の穴。★ 別の媒体の名前を混ぜない
  eq('★★★ 駅ちかと書かない', esutama.indexOf('駅ちか'), -1);

  const never = ls.judgeWriteStall({
    linkMode: 'write', switchedToWriteAt: hoursAgo(30), lastWriteOkAt: null, now: NOW,
  });
  // ★★ エステ魂は送る専用。★ 「取り込むに戻してください」と言わない（戻す道が無い）
  const n1 = ls.stallMessage(never, 'エステ魂（枠1）', { name: 'エステ魂', canRead: false });
  eq('★★★ 読めない媒体に「戻してください」と言わない', n1.indexOf('戻してください'), -1);
  eq('★ 代わりに進め方を出す', n1.indexOf('反映内容を確認') > 0, true);
  // ★ 読める媒体には今までどおり戻し方を出す
  const n2 = ls.stallMessage(never, '駅ちか（枠1）', { name: '駅ちか', canRead: true });
  eq('★ 読める媒体には戻し方を出す', n2.indexOf('戻してください') > 0, true);

  // ★ 名前を渡し忘れても、別の媒体の名前を当てない
  const noName = ls.stallMessage(stale, 'エステ魂（枠1）');
  eq('★★ 名前が無ければ「この媒体」', noName.indexOf('この媒体') > 0, true);
  eq('★★★ 名前が無いときも駅ちかと言わない', noName.indexOf('駅ちか'), -1);
}

// ── 枠のラベル。★ 呼び名の正本は mediaSites。★ 知らない provider は英字のまま ──
eq('ekichika のラベル', ls.mediaSlotLabel('ekichika', 2), '駅ちか（枠2）');
// ★★★ 2026-09-04: 'esutama（枠1）' と英字で店舗様の画面に出ていた
eq('★★★ esutama も日本語で出す', ls.mediaSlotLabel('esutama', 1), 'エステ魂（枠1）');
eq('★ esulove も日本語で出す', ls.mediaSlotLabel('esulove', 1), 'エステラブ（枠1）');
// ★ 知らない provider は英字のまま（★ ごまかして別の名前を当てない）
eq('★ 知らない provider はそのまま', ls.mediaSlotLabel('nanikore', 1), 'nanikore（枠1）');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
