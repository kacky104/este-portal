// 写メ日記の「移行期間の取り込み」の期限（src/lib/diaryMixedPeriod.ts）の自己点検（第1265便）。
//
// ★★★ なぜ要るか
//   ここは「コネックエフの店で、駅ちかの写メ日記をいつまで取り込むか」を決める。★ 間違えると
//     ・期限が早く切れる → 駅ちかで書いた方の日記がフクエスに載らなくなる（★ 誰も気づかない）
//     ・期限が切れない   → 全員が切り替わったあとも、20分ごとに駅ちかへログインし続ける
//     ・フクエスリンクの店に期限が効く → 「フクエスで書く」の店の取り込みが止まる（期限なしの決め）
//   どれも静かに起きる。★ だから【日付と真偽】で固定する。
//
//   使い方:  npm run check:diarymixed

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'diaryMixedPeriod.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

eq('移行期間は30日', m.DIARY_MIXED_DAYS, 30);
eq('延長は14日', m.DIARY_MIXED_EXTEND_DAYS, 14);

// ── 始めるときの期限 ──
{
  // 10/7 13:30 JST に始める → 11/6 まで（＝ 11/7 0:00 JST ＝ 11/6 15:00Z）
  const until = m.mixedUntilFromStart('2026-10-07T04:30:00.000Z');
  eq('★★★ 10/7 に始める → 11/6 の終わり（11/7 0:00 JST）', until, '2026-11-06T15:00:00.000Z');
  eq('★★★ 画面の日付は 11/6', m.mixedLastDayLabel(until), '11/6');
  eq('★ 10/7 0:00 JST ちょうどに始めても 11/6 まで', m.mixedUntilFromStart('2026-10-06T15:00:00.000Z'), '2026-11-06T15:00:00.000Z');
  eq('★ 10/7 23:59 JST に始めても 11/6 まで', m.mixedUntilFromStart('2026-10-07T14:59:59.000Z'), '2026-11-06T15:00:00.000Z');
  eq('★ 10/8 0:00 JST は翌日ぶん（11/7 まで）', m.mixedLastDayLabel(m.mixedUntilFromStart('2026-10-07T15:00:00.000Z')), '11/7');
  eq('★ 年をまたぐ（12/20 → 1/19）', m.mixedLastDayLabel(m.mixedUntilFromStart('2026-12-20T03:00:00.000Z')), '1/19');
  eq('★★ 時刻が読めなければ null（当てずっぽうの期限を入れない）', m.mixedUntilFromStart('xxx'), null);
}

// ── 期間中か ──
{
  const U = '2026-11-06T15:00:00.000Z'; // 11/6 まで
  eq('★★★ 期限の日の 23:59 JST は期間中', m.isMixedPeriodOpen(U, '2026-11-06T14:59:59.000Z'), true);
  eq('★★★ 翌日 0:00 JST ちょうどは期限切れ', m.isMixedPeriodOpen(U, '2026-11-06T15:00:00.000Z'), false);
  eq('★ 始めた日は期間中', m.isMixedPeriodOpen(U, '2026-10-07T04:30:00.000Z'), true);
  eq('★★ 期限が無ければ期間中ではない', m.isMixedPeriodOpen(null, '2026-10-07T04:30:00.000Z'), false);
  eq('★ 期限が空文字', m.isMixedPeriodOpen('', '2026-10-07T04:30:00.000Z'), false);
  eq('★ 期限が読めない', m.isMixedPeriodOpen('xxx', '2026-10-07T04:30:00.000Z'), false);
  eq('★ いまが読めない', m.isMixedPeriodOpen(U, 'xxx'), false);
}

// ── 延長 ──
{
  const U = '2026-11-06T15:00:00.000Z'; // 11/6 まで
  const e1 = m.extendMixedUntil(U, '2026-10-20T03:00:00.000Z');
  eq('★★★ 期間中に押す → いまの期限に14日足す（11/6 → 11/20）', m.mixedLastDayLabel(e1), '11/20');
  eq('★★★ 足した値そのもの（11/21 0:00 JST）', e1, '2026-11-20T15:00:00.000Z');
  eq('★★ もう一度押す → さらに14日（12/4）', m.mixedLastDayLabel(m.extendMixedUntil(e1, '2026-10-20T03:00:00.000Z')), '12/4');
  eq('★★★ 期限切れのあと（11/10）に押す → 押した日から14日（11/24）', m.mixedLastDayLabel(m.extendMixedUntil(U, '2026-11-10T06:00:00.000Z')), '11/24');
  eq('★★ 期限切れちょうど（11/7 0:00 JST）に押す → 押した日から14日（11/21）', m.mixedLastDayLabel(m.extendMixedUntil(U, '2026-11-06T15:00:00.000Z')), '11/21');
  eq('★★ 期限が入っていない店が押す → 押した日から14日', m.mixedLastDayLabel(m.extendMixedUntil(null, '2026-10-07T04:30:00.000Z')), '10/21');
  eq('★ 期限が読めない店が押す → 押した日から14日', m.mixedLastDayLabel(m.extendMixedUntil('xxx', '2026-10-07T04:30:00.000Z')), '10/21');
  eq('★★ いまが読めなければ null', m.extendMixedUntil(U, 'xxx'), null);
  eq('★ 延長した直後は期間中', m.isMixedPeriodOpen(m.extendMixedUntil(U, '2026-11-10T06:00:00.000Z'), '2026-11-10T06:00:00.000Z'), true);
}

// ── 残り日数・日付 ──
{
  const U = '2026-11-06T15:00:00.000Z';
  eq('★★★ 10/7 → 11/6 は あと30日', m.mixedDaysLeft(U, '2026-10-07T04:30:00.000Z'), 30);
  eq('★ 期限の前日は あと1日', m.mixedDaysLeft(U, '2026-11-05T03:00:00.000Z'), 1);
  eq('★★ 期限の日は 0（今日まで）', m.mixedDaysLeft(U, '2026-11-06T03:00:00.000Z'), 0);
  eq('★ 期限の翌日は -1', m.mixedDaysLeft(U, '2026-11-07T03:00:00.000Z'), -1);
  eq('★ 期限が無ければ null', m.mixedDaysLeft(null, '2026-10-07T04:30:00.000Z'), null);
  eq('★ 日付: 期限が無ければ null', m.mixedLastDayLabel(null), null);
  eq('★ 日付: 読めなければ null', m.mixedLastDayLabel('xxx'), null);
}

// ── 取り込みの周が回すか ──
{
  const NOW = '2026-10-07T04:30:00.000Z';
  const OPEN = '2026-11-06T15:00:00.000Z';
  const PAST = '2026-10-01T15:00:00.000Z';
  const r = (o) => m.diaryMixedRuns({ switched: false, linkMode: 'read', slotEnabled: true, until: null, nowISO: NOW, ...o });
  console.log('── フクエスリンク（切り替えていない店）──');
  eq('★★★ read なら回す（期限なし）', r({}), true);
  eq('★★★ 期限が切れていても回す（フクエスリンクに期限は効かない）', r({ until: PAST }), true);
  eq('★★ none（反映しない）は回さない', r({ linkMode: 'none' }), false);
  eq('★★ write は回さない（切り替えていない店に write は無いはず・あっても回さない）', r({ linkMode: 'write' }), false);
  eq('★ 枠が止められていれば回さない', r({ slotEnabled: false }), false);
  eq('★ 向きが分からなければ回さない', r({ linkMode: null }), false);
  console.log('── コネックエフ（切り替えた店）──');
  const c = (o) => r({ switched: true, linkMode: 'write_auto', until: OPEN, ...o });
  eq('★★★ write_auto ＋ 期間中 → 回す', c({}), true);
  eq('★★★ write ＋ 期間中 → 回す', c({ linkMode: 'write' }), true);
  eq('★★★ 期限切れ → 回さない', c({ until: PAST }), false);
  eq('★★★ 期限が入っていない → 回さない', c({ until: null }), false);
  eq('★★ none（反映しない）→ 回さない', c({ linkMode: 'none' }), false);
  eq('★★ read → 回さない（切り替えた店に read は無い決まり・あっても回さない）', c({ linkMode: 'read' }), false);
  eq('★ 枠が止められていれば回さない', c({ slotEnabled: false }), false);
  eq('★ 期限の日の 23:59 JST は回す', c({ nowISO: '2026-11-06T14:59:59.000Z' }), true);
  eq('★ 翌日 0:00 JST は回さない', c({ nowISO: '2026-11-06T15:00:00.000Z' }), false);
}

console.log('\n── 第1292便: ★★★ 始まりが空の店が「延長する」を押したときの始まり ──');
{
  const SW = '2026-10-05T12:41:54.928Z';   // 切り替えた時刻
  const NOW = '2026-10-10T03:00:00.000Z';  // 押した時刻
  // ★★★ 直す前: いつも【いま】。10/6 にフクエスで書いて駅ちかへ送った日記を「写し」と見分けられず、二重に取り込む
  eq('★★★ 切り替えた時刻が読めれば、それを始まりにする', m.mixedSinceWhenMissing(SW, NOW), SW);
  eq('★★ 切り替えた時刻が無ければ、いま（今までどおり）', [m.mixedSinceWhenMissing(null, NOW), m.mixedSinceWhenMissing(undefined, NOW), m.mixedSinceWhenMissing('', NOW)], [NOW, NOW, NOW]);
  eq('★★ 切り替えた時刻が読めない文字なら、いま', m.mixedSinceWhenMissing('x', NOW), NOW);
  eq('★ 切り替えた時刻が未来（時計のずれ）なら、いま', m.mixedSinceWhenMissing('2026-10-11T00:00:00.000Z', NOW), NOW);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
