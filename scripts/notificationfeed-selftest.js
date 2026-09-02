// 保存店の新着の絞り込み（src/lib/notificationFeed.ts）の自己点検（第103便）。
//
// ★★★ この点検の芯は3つ。
//   ① 【絞る順番】を数で固定する。★ 1店の連投で上限が埋まり、ほかの店が消える形にしない
//   ② 【ベルと一覧がずれない】ことを数で固定する。★ 隠れた未読を数えない
//   ③ 【隠した件数を持たない】ことを固定する。★ hasMore は真偽。★ 「ほか300件」を作らない
//
//   使い方:  npm run check:notificationfeed

const s = require(require('path').join(__dirname, '..', '_tmpcheck', 'notificationFeed.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const NOW = new Date('2026-09-02T00:00:00Z');            // 09:00 JST
const daysAgo = (d) => new Date(NOW.getTime() - d * 24 * 3600000).toISOString();
const SAVED = daysAgo(365);                              // ★ 1年前に保存した会員

let seq = 0;
const item = (o) => Object.assign({
  key: 'announcement-' + (++seq),
  type: 'announcement',
  salonId: 1, salonName: '店1', title: 'お知らせ',
  at: daysAgo(1),
  href: '/salon/1/news',
  savedAt: SAVED,
}, o || {});

const build = (candidates, o) => s.buildNotificationFeed(Object.assign({
  candidates, now: NOW, lastCheckedAt: null,
}, o || {}));

const keys = (r) => r.rows.map((x) => x.key);

console.log('── 1. ★★★ 期間で母数を切る（14日）──');
eq('13日前は新着', build([item({ at: daysAgo(13) })]).rows.length, 1);
eq('★ 15日前は新着ではない', build([item({ at: daysAgo(15) })]).rows.length, 0);
eq('★ 14日ちょうど手前は残る', build([item({ at: daysAgo(13.99) })]).rows.length, 1);
eq('★ 14日を過ぎたら落ちる', build([item({ at: daysAgo(14.01) })]).rows.length, 0);
eq('★ 既定は14日', s.FEED_WINDOW_DAYS, 14);
eq('★ 点検用に短くできる', build([item({ at: daysAgo(3) })], { windowDays: 1 }).rows.length, 0);
eq('★ 1年前に保存した会員でも、1年分は出てこない',
  build([item({ at: daysAgo(200) }), item({ at: daysAgo(100) }), item({ at: daysAgo(2) })]).rows.length, 1);

console.log('\n── 2. 保存日時より後のものだけ ──');
eq('保存より前は出ない', build([item({ at: daysAgo(3), savedAt: daysAgo(2) })]).rows.length, 0);
eq('★ 保存と同時刻は出ない（「後」だけ）', build([item({ at: daysAgo(2), savedAt: daysAgo(2) })]).rows.length, 0);
eq('★ 保存日時が無ければ出ない（新着と言えない）', build([item({ savedAt: null })]).rows.length, 0);
eq('★ 時刻が読めない行は捨てる', build([item({ at: 'きのう' })]).rows.length, 0);

console.log('\n── 3. ★★★ 店ごとに最新1件 ──');
{
  const r = build([
    item({ key: 'a-old', salonId: 1, at: daysAgo(5) }),
    item({ key: 'a-new', salonId: 1, at: daysAgo(1) }),
    item({ key: 'a-mid', salonId: 1, at: daysAgo(3) }),
  ]);
  eq('★ 3本あっても1件だけ', r.rows.length, 1);
  eq('★ いちばん新しいものが残る', keys(r), ['a-new']);
  eq('★★ hasMore が付く', r.rows[0].hasMore, true);
  eq('★★★ 隠した件数は持たない（真偽だけ）', typeof r.rows[0].hasMore, 'boolean');
  eq('★ 行に件数の項目が生えていない',
    Object.keys(r.rows[0]).filter((k) => /count|more[A-Z]|rest|others/i.test(k) && k !== 'hasMore'), []);
}
eq('★ 1本だけの店には hasMore を付けない', build([item({ salonId: 1 })]).rows[0].hasMore, false);
{
  // ★ 種別をまたいで最新1件。クーポンが最新ならクーポンが出る
  const r = build([
    item({ key: 'ann', salonId: 1, type: 'announcement', at: daysAgo(2) }),
    item({ key: 'cou', salonId: 1, type: 'coupon', at: daysAgo(1), href: '/salon/1/coupon' }),
  ]);
  eq('★ 種別をまたいで新しいほうが出る', keys(r), ['cou']);
  eq('★ 行き先もそのまま持っていく', r.rows[0].href, '/salon/1/coupon');
  eq('★ hasMore が付く（お知らせが隠れている）', r.rows[0].hasMore, true);
}
{
  // ★ 同着は key の順で決める（★ 実行のたびに入れ替わらない）
  const a = build([item({ key: 'b', salonId: 1, at: daysAgo(1) }), item({ key: 'a', salonId: 1, at: daysAgo(1) })]);
  const b = build([item({ key: 'a', salonId: 1, at: daysAgo(1) }), item({ key: 'b', salonId: 1, at: daysAgo(1) })]);
  eq('★ 同着でも結果が入れ替わらない', [keys(a), keys(b)], [['a'], ['a']]);
}

console.log('\n── 4. ★★★ 絞る順番（★ 1店の連投で他店を消さない）──');
{
  // ★ 店1が20連投、店2〜4が1本ずつ。上限を3店にする
  const many = [];
  for (let i = 0; i < 20; i++) many.push(item({ key: 's1-' + i, salonId: 1, salonName: '店1', at: daysAgo(1) }));
  many.push(item({ key: 's2', salonId: 2, salonName: '店2', at: daysAgo(2) }));
  many.push(item({ key: 's3', salonId: 3, salonName: '店3', at: daysAgo(3) }));
  many.push(item({ key: 's4', salonId: 4, salonName: '店4', at: daysAgo(4) }));
  const r = build(many, { maxSalons: 3 });
  eq('★★★ 20連投の店が一覧を占領しない', r.rows.filter((x) => x.salonId === 1).length, 1);
  eq('★ 3店ぶん出る', r.rows.map((x) => x.salonId), [1, 2, 3]);
  eq('★ 上限で出せなかった店の数を返す', r.cappedSalons, 1);
  eq('★ 出した店の数も返す', r.salonCount, 3);
}
eq('★ 上限に当たらなければ0', build([item({ salonId: 1 }), item({ salonId: 2 })]).cappedSalons, 0);
eq('★ 既定の上限は50店', s.FEED_MAX_SALONS, 50);

console.log('\n── 5. ★★★ ベルと一覧をずらさない（未読の数え方）──');
{
  // ★ 店1に未読が5本。★ 出すのは1件なので、未読も1
  const many = [];
  for (let i = 0; i < 5; i++) many.push(item({ key: 's1-' + i, salonId: 1, at: daysAgo(i + 1) }));
  const r = build(many, { lastCheckedAt: daysAgo(30) });
  eq('★ 出した行は1件', r.rows.length, 1);
  eq('★★★ 未読も1（隠れた4件を数えない）', r.unreadCount, 1);
  eq('★★ 未読数は出した行の未読数と必ず一致', r.unreadCount, r.rows.filter((x) => x.isUnread).length);
}
eq('★ 最後に見た時刻より前なら既読', build([item({ at: daysAgo(5) })], { lastCheckedAt: daysAgo(1) }).unreadCount, 0);
eq('★ 見た記録が無ければ未読', build([item({ at: daysAgo(5) })], { lastCheckedAt: null }).unreadCount, 1);
eq('★ 読めない時刻の記録は「見ていない」とみなす',
  build([item({ at: daysAgo(5) })], { lastCheckedAt: 'きのう' }).unreadCount, 1);
{
  const r = build([item({ salonId: 1, at: daysAgo(1) }), item({ salonId: 2, at: daysAgo(9) })],
    { lastCheckedAt: daysAgo(5) });
  eq('★ 未読と既読が混ざっても数が合う', [r.rows.length, r.unreadCount], [2, 1]);
}

console.log('\n── 6. 並びと、何も無いとき ──');
eq('★ 新しい順に並ぶ',
  build([item({ key: 'c', salonId: 3, at: daysAgo(3) }),
         item({ key: 'a', salonId: 1, at: daysAgo(1) }),
         item({ key: 'b', salonId: 2, at: daysAgo(2) })]).rows.map((x) => x.key),
  ['a', 'b', 'c']);
eq('候補が空なら空', build([]), { rows: [], unreadCount: 0, salonCount: 0, cappedSalons: 0 });
eq('★ 全部が期間の外なら空（★ 上限の話にしない）',
  build([item({ at: daysAgo(30) }), item({ at: daysAgo(40) })]).cappedSalons, 0);
eq('★ now が読めなければ空（推測で出さない）',
  s.buildNotificationFeed({ candidates: [item()], now: new Date('x'), lastCheckedAt: null }), 
  { rows: [], unreadCount: 0, salonCount: 0, cappedSalons: 0 });
eq('★ 店の名前と題名はそのまま持っていく',
  (() => { const r = build([item({ salonName: 'THE LABYRINTH ～ラビリンス～', title: 'ご新規様限定♪' })]);
           return [r.rows[0].salonName, r.rows[0].title]; })(),
  ['THE LABYRINTH ～ラビリンス～', 'ご新規様限定♪']);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
