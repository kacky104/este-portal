// 店舗カードのタブ（src/lib/salonCardTabs.ts）の自己点検（第1126便・2026-10-03）。
//   数の決め方（48時間・期限内のクーポン・0件は出さない）と、タブの並びを固定する。
//   使い方:  npm run check:salontabs

const path = require('path');
const T = require(path.join(__dirname, '..', '_tmpcheck', 'salonCardTabs.js'));
const D = require(path.join(__dirname, '..', '_tmpcheck', 'diaryNew.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. タブの並びと窓 ──');
eq('★★★ 並びは 写メ日記 → 口コミ → 新人 → クーポン', T.CARD_TABS.map((t) => t.label), ['写メ日記', '口コミ', '新人', 'クーポン']);
eq('★ 「すべて見る」の行き先', T.CARD_TABS.map((t) => t.path), ['diary', 'reviews', 'newface', 'coupon']);
eq('★★★ 写メ日記の窓は48時間（NEW と同じ）', D.DIARY_NEW_WINDOW_MS, 48 * 60 * 60 * 1000);
eq('★ 開いたときは2件', T.CARD_TAB_ROWS, 2);

console.log('── 2. バッジの数 ──');
eq('★★ 0件はバッジを出さない', [T.badgeText(0), T.badgeText(-1), T.badgeText(NaN)], ['', '', '']);
eq('★ 1〜99 はそのまま・100 以上は 99+', [T.badgeText(1), T.badgeText(12), T.badgeText(99), T.badgeText(100), T.badgeText(350)], ['1', '12', '99', '99+', '99+']);

console.log('── 3. クーポンの期限 ──');
eq('★ 今日（JST）の日付', [T.todayJstOf(Date.UTC(2026, 9, 3, 14, 59)), T.todayJstOf(Date.UTC(2026, 9, 3, 15, 0))], ['2026-10-03', '2026-10-04']);
eq('★★ 期限なしは常に出す・今日までは出す・昨日までは出さない',
   [T.isCouponValid(null, '2026-10-03'), T.isCouponValid('', '2026-10-03'), T.isCouponValid('2026-10-03', '2026-10-03'), T.isCouponValid('2026-10-31', '2026-10-03'), T.isCouponValid('2026-10-02', '2026-10-03')],
   [true, true, true, true, false]);

console.log('── 4. 店舗ごとに数える ──');
eq('★ 数える（salon_id が無い・数でない行は捨てる）',
   T.countBySalon([{ salon_id: 3 }, { salon_id: 3 }, { salon_id: '12' }, { salon_id: null }, { salon_id: 'x' }, {}]), { 3: 2, 12: 1 });
eq('★ null・空でも落ちない', [T.countBySalon(null), T.countBySalon([])], [{}, {}]);
eq('★★ 写メ日記とクーポンを合わせる（期限切れのクーポンは数えない）',
   T.buildTabCounts(
     [{ salon_id: 3 }, { salon_id: 3 }, { salon_id: 5 }],
     [{ salon_id: 3, valid_until: null }, { salon_id: 3, valid_until: '2026-10-01' }, { salon_id: 12, valid_until: '2026-12-31' }],
     '2026-10-03'),
   { 3: { diary: 2, coupon: 1 }, 5: { diary: 1, coupon: 0 }, 12: { diary: 0, coupon: 1 } });
eq('★ 読めなかった（null）ときは空', T.buildTabCounts(null, null, '2026-10-03'), {});

console.log('── 5. 行に出す文 ──');
eq('★ タイトル → 本文の頭 → 決まり文句', [T.diaryLine('今日も出勤', '本文'), T.diaryLine('', '本文です\nつづき'), T.diaryLine(null, '  '), T.diaryLine(null, null)],
   ['今日も出勤', '本文です つづき', '写真を投稿しました', '写真を投稿しました']);
eq('★ 長すぎる文は 60 字で落とす', T.oneLine('あ'.repeat(80)).length, 60);
eq('★ 口コミの総合点（3つの平均・小数1位）', [T.overallRating(5, 5, 5), T.overallRating(5, 4, 4), T.overallRating('5', '4', '5'), T.overallRating(null, 'x', 1)], [5, 4.3, 4.7, 0]);

console.log(fail === 0 ? '\n全部 ok' : `\n★★★ NG ${fail} 件`);
process.exit(fail === 0 ? 0 : 1);
