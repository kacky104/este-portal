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

// ★★★ 第139便から lastChangeAt（フクエス側の出勤が最後に変わった時刻）が要る。
//   ★ 既定は「基準より少しあと」に置く（★ 変えたのに送っていない、が既定の状況）
const judge = (o) => ls.judgeWriteStall(Object.assign({ now: NOW, lastChangeAt: hoursAgo(30) }, o));

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
  linkMode: 'write_auto', switchedToWriteAt: hoursAgo(100), lastWriteOkAt: hoursAgo(40),
}).stalled, true);

// ── ★★★ 根拠が無いときは黙る（嘘の警告を出さない）──
eq('切替時刻も反映時刻も無ければ判定しない', judge({
  linkMode: 'write', switchedToWriteAt: null, lastWriteOkAt: null,
}).stalled, false);
eq('読めない時刻は無いものと同じ', judge({
  linkMode: 'write', switchedToWriteAt: 'いつか', lastWriteOkAt: null,
}).stalled, false);

// ── ★★★ 第139便①: 送るものが無ければ鳴らさない ──
// ★★ 2026-09-04 に実際に起きた: 出勤を1つも変えていない店舗に、毎日「止まっています」。
//   ★ 店舗様には何もできない。★ 「送っていない」ではなく「変えたのに送っていない」を見る。
eq('★★★ 出勤を変えていなければ鳴らさない', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(200), lastWriteOkAt: hoursAgo(100),
  lastChangeAt: hoursAgo(150),   // ★ 変えたのは反映より前＝送ってある
}).stalled, false);
eq('★★ 変えたぶんを送ってあれば「経過0」', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(200), lastWriteOkAt: hoursAgo(100),
  lastChangeAt: hoursAgo(150),
}).elapsedHours, 0);
// ★★★ 分からないときは黙る。★ 嘘の警告より、何も出さないほうがまし
eq('★★★ 出勤の時刻が分からなければ鳴らさない', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(200), lastWriteOkAt: null, lastChangeAt: null,
}).stalled, false);

// ── ★★★ 第139便②: 起点は【新しいほう】 ──
// ★★ 2026-09-04 のラビリンス様: 今日 write にしたのに「43時間経っています」と出た。
//   ★ 43時間前は、こちらが試しに送った時刻。★ 店舗様には身に覚えのない数字。
eq('★★★ 向きを付け直したら、そこから数え直す', judge({
  linkMode: 'write',
  switchedToWriteAt: hoursAgo(1),    // ★ 1時間前に write にした
  lastWriteOkAt: hoursAgo(43),       // ★ 43時間前に送ったことがある
  lastChangeAt: hoursAgo(2),         // ★ 出勤は2時間前に変わった（★ 切替より前）
}).stalled, false);
// ★ 逆に、切替のあとに変えていれば、そこから数える
eq('★★ 切替のあとに変えたぶんは数える', judge({
  linkMode: 'write',
  switchedToWriteAt: hoursAgo(100), lastWriteOkAt: hoursAgo(200),
  lastChangeAt: hoursAgo(30),
}).stalled, true);

// ── never_sent（切り替えたが一度も反映していない）──
eq('変えてから23時間はまだ出さない', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(50), lastWriteOkAt: null, lastChangeAt: hoursAgo(23),
}).stalled, false);
eq('変えてから24時間ちょうどで出す', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(50), lastWriteOkAt: null, lastChangeAt: hoursAgo(24),
}).stalled, true);
eq('一度も送っていなければ理由は never_sent', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(50), lastWriteOkAt: null, lastChangeAt: hoursAgo(26),
}).reason, 'never_sent');

// ── stale（反映したことはあるが久しく止まっている）──
eq('1時間前に反映していれば出さない', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(120), lastWriteOkAt: hoursAgo(1), lastChangeAt: hoursAgo(2),
}).stalled, false);
eq('変えてから30時間なら出す', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(120), lastWriteOkAt: hoursAgo(100), lastChangeAt: hoursAgo(30),
}).reason, 'stale');
// ★★ 数えるのは【変えてから】。★ 「送っていない時間」ではない
eq('★★★ 経過は「変えてから」の時間', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(120), lastWriteOkAt: hoursAgo(100), lastChangeAt: hoursAgo(30),
}).elapsedHours, 30);

// ── 時計のずれ（未来の時刻）で負の数を人に見せない ──
eq('未来の時刻は出さない', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(50), lastWriteOkAt: null,
  lastChangeAt: new Date(NOW.getTime() + 3600000).toISOString(),
}).stalled, false);
eq('未来の時刻の経過は0', judge({
  linkMode: 'write', switchedToWriteAt: hoursAgo(50), lastWriteOkAt: null,
  lastChangeAt: new Date(NOW.getTime() + 3600000).toISOString(),
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
    linkMode: 'write', switchedToWriteAt: hoursAgo(50), lastWriteOkAt: null, lastChangeAt: hoursAgo(30),
  }), '駅ちか（枠1）', { name: '駅ちか', canRead: true });
  eq('never_sent の文言に枠が入る', m.indexOf('駅ちか（枠1）') === 0, true);
  // ★★ 「変えてから」と書く（★ 店舗様が読んで次にすることが分かる）
  eq('★★ 変えてから、と書く', m.indexOf('出勤を変えてから') > 0, true);
  eq('never_sent の文言に戻し方が入る', m.indexOf('戻してください') > 0, true);
  // ★ 店舗が読む1行に英語のエラー文字列を混ぜない（監査ログ migration の作法）
  eq('never_sent の文言に never_sent と出ない', m.indexOf('never_sent'), -1);
}

// ── ★★★ 送り先の名前を決め打ちしない（第133-6便・2026-09-04）──
// ★ 実際にラビリンス様の画面へ「esutama（枠1）は『フクエスから【駅ちか】へ反映する』向き」と出た。
//   ★ エステ魂の話なのに送り先が駅ちか。★ 媒体が1つだった頃の文言が直っていなかった。
{
  const stale = ls.judgeWriteStall({
    linkMode: 'write', switchedToWriteAt: hoursAgo(100), lastWriteOkAt: hoursAgo(200),
    lastChangeAt: hoursAgo(41), now: NOW,
  });
  const esutama = ls.stallMessage(stale, 'エステ魂（枠1）', { name: 'エステ魂', canRead: false });
  eq('★★★ 送り先はエステ魂と書く', esutama.indexOf('フクエスからエステ魂へ反映する') > 0, true);
  // ★★★ ここが今回の穴。★ 別の媒体の名前を混ぜない
  eq('★★★ 駅ちかと書かない', esutama.indexOf('駅ちか'), -1);

  const never = ls.judgeWriteStall({
    linkMode: 'write', switchedToWriteAt: hoursAgo(50), lastWriteOkAt: null,
    lastChangeAt: hoursAgo(30), now: NOW,
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
