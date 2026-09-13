// 連携の向きと自動反映の判定（src/lib/mediaLinkMode.ts）の自己点検（第48便）。
//
// ★★★ なぜ要るか
//   ここは「自動で駅ちかを書き換えてよいか」を決める。間違えると
//   **人が見ていないのに送る** か **自動にしたのに何も起きない** のどちらかになる。
//   ★ どちらも静かに起きるので、テストが無いと気づけない。
//
//   使い方:  npm run check:linkmode

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaLinkMode.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// ── 向きの判定 ──
eq('write は書く向き', m.isWriteDirection('write'), true);
eq('write_auto も書く向き', m.isWriteDirection('write_auto'), true);
eq('read は書く向きではない', m.isWriteDirection('read'), false);
eq('none は書く向きではない', m.isWriteDirection('none'), false);
eq('null は書く向きではない', m.isWriteDirection(null), false);
// ★ 知らない値を書く向きに含めない（4値化を取りこぼしても安全側に倒れることの土台）
eq('知らない値は書く向きではない', m.isWriteDirection('write_turbo'), false);

eq('自動は write_auto だけ', m.isAutoPush('write_auto'), true);
eq('write は自動ではない', m.isAutoPush('write'), false);

eq('4値だけを受け付ける', m.isLinkMode('write_auto'), true);
eq('5つ目は受け付けない', m.isLinkMode('both'), false);

// ── ★★★ 1回目の承認が済んでいるか ──
const H = (switched, ok, matched) => ({ switchedToWriteAt: switched, lastWriteOkAt: ok, matchedAt: matched ?? null });
eq('一度も成功が無ければ自動にできない',
  m.hasApprovedOnce(H('2026-08-29T00:00:00Z', null)), false);
eq('切り替えの記録が無ければ自動にできない',
  m.hasApprovedOnce(H(null, '2026-08-29T01:00:00Z')), false);
eq('切り替えのあとに成功していれば自動にできる',
  m.hasApprovedOnce(H('2026-08-29T00:00:00Z', '2026-08-29T01:00:00Z')), true);
// ★★★ ここが §54 の肝。read に戻して write にし直したら【1回目からやり直し】
eq('成功が切り替えより古ければ自動にできない',
  m.hasApprovedOnce(H('2026-08-29T02:00:00Z', '2026-08-29T01:00:00Z')), false);
eq('同時刻は済んだ扱い（境界）',
  m.hasApprovedOnce(H('2026-08-29T01:00:00Z', '2026-08-29T01:00:00Z')), true);
eq('読めない時刻は自動にさせない',
  m.hasApprovedOnce(H('きのう', '2026-08-29T01:00:00Z')), false);

// ── ★★★★ 第331便: 「確かめたら一致していた」も1回目として数える ──
//   ★ 一致している枠は送るボタンが押せない（no_change）。★ 数えないと永久に自動にできない
eq('★★★ 切り替えのあとに一致を確かめていれば自動にできる（送っていなくても）',
  m.hasApprovedOnce(H('2026-08-29T00:00:00Z', null, '2026-08-29T01:00:00Z')), true);
eq('★ 一致の確認が切り替えより古ければ、やはり自動にできない',
  m.hasApprovedOnce(H('2026-08-29T02:00:00Z', null, '2026-08-29T01:00:00Z')), false);
eq('★ 送れたのが古くても、一致の確認が新しければ自動にできる',
  m.hasApprovedOnce(H('2026-08-29T02:00:00Z', '2026-08-29T01:00:00Z', '2026-08-29T03:00:00Z')), true);
eq('★ 一致の確認が古くても、送れたのが新しければ自動にできる',
  m.hasApprovedOnce(H('2026-08-29T02:00:00Z', '2026-08-29T03:00:00Z', '2026-08-29T01:00:00Z')), true);
eq('★ どちらも無ければ自動にできない',
  m.hasApprovedOnce(H('2026-08-29T00:00:00Z', null, null)), false);
eq('★ matchedAt を渡さない古い呼び出しでも動く（省略可）',
  m.hasApprovedOnce({ switchedToWriteAt: '2026-08-29T00:00:00Z', lastWriteOkAt: '2026-08-29T01:00:00Z' }), true);

// ── ★★★★ 第331便: 書く向きが「いつ始まったか」（うっかり戻しの救済） ──
eq('猶予は24時間', m.WRITE_GAP_FORGIVE_HOURS, 24);
const C = (at, mode) => ({ at, mode });
// ★ rows は新しい順
eq('切り替えが1件だけならそこが始まり',
  m.writeSpanStart([C('2026-09-10T00:00:00Z', 'write')]), '2026-09-10T00:00:00Z');
eq('記録が無ければ null', m.writeSpanStart([]), null);
// ★★★ うっかり: 9/10 に write → 9/12 09:00 に read → 9/12 09:05 に write（5分で戻した）
eq('★★★ 5分で戻したら、始まりは元の 9/10 のまま（1回目をやり直させない）',
  m.writeSpanStart([
    C('2026-09-12T09:05:00Z', 'write'),
    C('2026-09-12T09:00:00Z', 'read'),
    C('2026-09-10T00:00:00Z', 'write'),
  ]), '2026-09-10T00:00:00Z');
eq('★ 23時間59分でもまだ「うっかり」',
  m.writeSpanStart([
    C('2026-09-12T08:59:00Z', 'write'),
    C('2026-09-11T09:00:00Z', 'read'),
    C('2026-09-10T00:00:00Z', 'write'),
  ]), '2026-09-10T00:00:00Z');
eq('★★ 24時間ちょうども「うっかり」（境界は含める）',
  m.writeSpanStart([
    C('2026-09-12T09:00:00Z', 'write'),
    C('2026-09-11T09:00:00Z', 'read'),
    C('2026-09-10T00:00:00Z', 'write'),
  ]), '2026-09-10T00:00:00Z');
eq('★★★ 24時間を1分でも超えたら、始まりは戻した時刻（1回目からやり直し）',
  m.writeSpanStart([
    C('2026-09-12T09:01:00Z', 'write'),
    C('2026-09-11T09:00:00Z', 'read'),
    C('2026-09-10T00:00:00Z', 'write'),
  ]), '2026-09-12T09:01:00Z');
eq('★ none を挟んだ場合も同じ扱い',
  m.writeSpanStart([
    C('2026-09-12T09:05:00Z', 'write_auto'),
    C('2026-09-12T09:00:00Z', 'none'),
    C('2026-09-10T00:00:00Z', 'write'),
  ]), '2026-09-10T00:00:00Z');
// ★ 向きの中での模様替え（write ↔ write_auto）は、これまでどおりやり直しにならない
eq('★ write ↔ write_auto の往復は遡る',
  m.writeSpanStart([
    C('2026-09-12T09:05:00Z', 'write'),
    C('2026-09-12T09:00:00Z', 'write_auto'),
    C('2026-09-10T00:00:00Z', 'write'),
  ]), '2026-09-10T00:00:00Z');
// ★ うっかりが2回続いても、どちらも24時間以内なら元まで遡る
eq('★ うっかりが2回でも遡る',
  m.writeSpanStart([
    C('2026-09-12T10:00:00Z', 'write'),
    C('2026-09-12T09:59:00Z', 'read'),
    C('2026-09-12T09:05:00Z', 'write'),
    C('2026-09-12T09:00:00Z', 'read'),
    C('2026-09-10T00:00:00Z', 'write'),
  ]), '2026-09-10T00:00:00Z');
eq('★ 読めない時刻の行は飛ばす（今として扱わない）',
  m.writeSpanStart([C('きのう', 'read'), C('2026-09-10T00:00:00Z', 'write')]), '2026-09-10T00:00:00Z');
eq('★ 猶予を0にすれば、これまでどおりの厳しい判定',
  m.writeSpanStart([
    C('2026-09-12T09:05:00Z', 'write'),
    C('2026-09-12T09:00:00Z', 'read'),
    C('2026-09-10T00:00:00Z', 'write'),
  ], 0), '2026-09-12T09:05:00Z');

// ── 連続失敗で自動を切る ──
eq('失敗2回では切らない', m.shouldGiveUpAuto(['failed', 'failed', 'ok']), false);
eq('失敗3回で切る', m.shouldGiveUpAuto(['failed', 'failed', 'failed']), true);
// ★ 'stopped'（判断して止めた）も数える。機械の故障ではないが、人が見ないと進まないのは同じ
eq('stopped も数える', m.shouldGiveUpAuto(['stopped', 'stopped', 'stopped']), true);
eq('混ざっていても数える', m.shouldGiveUpAuto(['stopped', 'failed', 'stopped']), true);
// ★ 直近が ok なら連続は切れている。古い失敗を蒸し返さない
eq('直近が ok なら切らない', m.shouldGiveUpAuto(['ok', 'failed', 'failed', 'failed']), false);
eq('記録が無ければ切らない', m.shouldGiveUpAuto([]), false);
eq('しきい値は3回', m.AUTO_GIVE_UP_STREAK, 3);

// ── 周期 ──
const NOW = new Date('2026-08-29T12:00:00Z');
const minAgo = (n) => new Date(NOW.getTime() - n * 60000).toISOString();
eq('前回が分からなければ1回やる',
  m.isDueForAutoPush({ lastAttemptAt: null, now: NOW }), true);
eq('29分では回さない',
  m.isDueForAutoPush({ lastAttemptAt: minAgo(29), now: NOW }), false);
eq('30分ちょうどで回す',
  m.isDueForAutoPush({ lastAttemptAt: minAgo(30), now: NOW }), true);
// ★ 時計のずれ（未来の記録）で連打しない
eq('未来の記録なら次の周に回す',
  m.isDueForAutoPush({ lastAttemptAt: new Date(NOW.getTime() + 60000).toISOString(), now: NOW }), false);
eq('周期は30分（取り込みの15分と同じにしない）', m.AUTO_PUSH_INTERVAL_MIN, 30);

// ── 画面の名前。★ 知らない値を勝手に読み替えない ──
// ★★★ 第141便: 媒体名を決め打ちしない（★ 「エステ魂なのに駅ちか」を作らない）
eq('write_auto の名前', m.linkModeTitle('write_auto', '駅ちか'), 'フクエスから駅ちかへ自動で反映しています');
eq('★★★ エステ魂ならエステ魂と書く', m.linkModeTitle('write', 'エステ魂'), 'フクエスからエステ魂へ反映しています（毎回ご承認）');
eq('★★★ 別の媒体の名前を混ぜない', m.linkModeTitle('write', 'エステ魂').includes('駅ちか'), false);
// ★★ 名前を渡し忘れても、別の媒体の名前を当てない
eq('★★ 名前が無ければ「連携サイト」', m.linkModeTitle('read'), '連携サイトから取り込んでいます');
eq('★★★ 名前が無いときも駅ちかと言わない', m.linkModeTitle('write').includes('駅ちか'), false);
eq('★ 空白だけの名前も「連携サイト」', m.linkModeTitle('read', '  '), '連携サイトから取り込んでいます');
eq('★ 連携しないは媒体名を出さない', m.linkModeTitle('none', 'エステ魂'), '連携しない');
eq('知らない値は未設定', m.linkModeTitle('write_turbo', '駅ちか'), '未設定');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
