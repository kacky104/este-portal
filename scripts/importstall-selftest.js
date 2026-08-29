// 取り込みの見張り（src/lib/importStall.ts）の自己点検（第51便）。
//
// ★★★ この点検の芯は【1本の時計では捕まらないこと】を証拠にすること。
//   2026-08-29 に実際に起きた形をそのまま組んで、
//     当日の周（list）… 新しい  → 鳴らない
//     週間の周（full）… 3日古い → ★ 鳴る
//   の1組を書く。★ 片方だけ書くと「2本にしたつもりで1本しか見ていない」に気づけない。
//   （第48便 §62「同じ入力で手動は通る／自動は止まる」と同じ作法）
//
//   使い方:  npm run check:importstall

const s = require(require('path').join(__dirname, '..', '_tmpcheck', 'importStall.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const NOW = new Date('2026-08-29T03:00:00Z');           // 12:00 JST
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();

const base = (o) => Object.assign({
  provider: 'ekichika', slot: 1, linkMode: 'read', isEnabled: true,
  listLastRunAt: hoursAgo(0.5),      // 30分前（15分周期なので正常）
  fullLastRunAt: hoursAgo(6),        // 6時間前（今朝走った想定）
  intervalMin: 15,
  createdAt: hoursAgo(24 * 30),
  now: NOW,
}, o || {});
const kinds = (r) => r.map((f) => f.clock + ':' + f.reason);

console.log('── 1. ★★★ 1本の時計では捕まらないことの証拠（2026-08-29 の実データの形）──');
{
  // ★ 当日の周は15分ごとに回っている。週間の周だけが3日止まっている
  const 事故の形 = s.judgeImportStall(base({
    listLastRunAt: hoursAgo(0.4),    // ★ 24分前。ずっと新しい
    fullLastRunAt: hoursAgo(24 * 3), // ★ 3日前
  }));
  eq('★ 当日の周だけ見ていたら「正常」に見える形', kinds(事故の形), ['full:stale']);
  eq('★ 当日の周は鳴らない', 事故の形.filter((f) => f.clock === 'list').length, 0);
  eq('★ 週間の周が鳴る', 事故の形.filter((f) => f.clock === 'full').length, 1);
  // ★ 文言に「明日以降」が入っていること（当日は取り込めている、が伝わる形）
  eq('★ 文言が「明日以降が古い」と言う', 事故の形[0].message.indexOf('明日以降') > 0, true);
  eq('★ 文言が「本日の出勤は取り込めています」と断る',
    事故の形[0].message.indexOf('本日の出勤は取り込めています') > 0, true);
}
// ★ 逆向きの1組。当日の周だけが止まった場合
{
  const r = s.judgeImportStall(base({ listLastRunAt: hoursAgo(9), fullLastRunAt: hoursAgo(6) }));
  eq('当日の周だけ止まれば list だけ鳴る', kinds(r), ['list:stale']);
  eq('★ 文言が「本日の出勤」の話になる', r[0].message.indexOf('本日の出勤') > 0, true);
}
// ★ 両方止まっていれば2件。★ まとめて1件にしない（見る場所が違う）
eq('両方止まれば2件出る',
  kinds(s.judgeImportStall(base({ listLastRunAt: hoursAgo(9), fullLastRunAt: hoursAgo(72) }))),
  ['list:stale', 'full:stale']);
// ★ 正常なら何も出ない（異常が無い店に赤い箱を出さない）
eq('正常なら何も出ない', s.judgeImportStall(base()), []);

console.log('\n── 2. 対象外（意図して止めているものを警告にしない）──');
const 止まった = { listLastRunAt: hoursAgo(72), fullLastRunAt: hoursAgo(72) };
eq('連携が無効なら黙る', s.judgeImportStall(base(Object.assign({ isEnabled: false }, 止まった))), []);
eq("link_mode='none' なら黙る", s.judgeImportStall(base(Object.assign({ linkMode: 'none' }, 止まった))), []);
// ★★ 書く向きは第47便 mediaLinkStall の担当。★ 二重に鳴らさない
eq('★ 書く向きは黙る（あちらの担当）',
  s.judgeImportStall(base(Object.assign({ linkMode: 'write' }, 止まった))), []);
eq('★ 自動の向きも黙る',
  s.judgeImportStall(base(Object.assign({ linkMode: 'write_auto' }, 止まった))), []);
// ★ 向きが未設定（null）は取り込みが動くはずの状態。★ 見張る
eq('向きが未設定なら見張る',
  kinds(s.judgeImportStall(base(Object.assign({ linkMode: null }, 止まった)))), ['list:stale', 'full:stale']);

console.log('\n── 3. 一度も走っていない（いちばん危ない形）──');
{
  const r = s.judgeImportStall(base({
    listLastRunAt: null, fullLastRunAt: null, createdAt: hoursAgo(72),
  }));
  eq('一度も走っていなければ never', kinds(r), ['list:never', 'full:never']);
  eq('起点は設定を作った時刻', r[0].sinceISO, hoursAgo(72));
  eq('文言が「まだ一度も」と言う', r[0].message.indexOf('まだ一度も') > 0, true);
}
// ★★ 根拠が1つも無いときは黙る（mediaLinkStall と同じ「分からないことは分からないまま」）
eq('★ 起点が1つも無ければ黙る',
  s.judgeImportStall(base({ listLastRunAt: null, fullLastRunAt: null, createdAt: null })), []);
// ★ 作ったばかりの設定で鳴らさない
eq('作った直後は鳴らない',
  s.judgeImportStall(base({ listLastRunAt: null, fullLastRunAt: null, createdAt: hoursAgo(1) })), []);
// ★ 走ったことがあるなら stale。never にしない（意味が違う）
eq('走ったことがあれば stale',
  kinds(s.judgeImportStall(base({ listLastRunAt: hoursAgo(9), fullLastRunAt: hoursAgo(9) }))), ['list:stale']);

console.log('\n── 4. しきい値 ──');
// ★ 当日の周は「間隔の16周ぶん」。間隔が変われば追随する
eq('15分間隔なら4時間', s.listStallHours(15), 4);
eq('30分間隔なら8時間', s.listStallHours(30), 8);
eq('★ 5分間隔でも下限4時間（過敏にしない）', s.listStallHours(5), 4);
eq('未設定なら15分として扱う', s.listStallHours(null), 4);
eq('壊れた値でも落ちない', s.listStallHours(0), 4);
// 境界
eq('3.9時間はまだ鳴らない',
  s.judgeImportStall(base({ listLastRunAt: hoursAgo(3.9) })).length, 0);
eq('4時間ちょうどで鳴る',
  kinds(s.judgeImportStall(base({ listLastRunAt: hoursAgo(4) }))), ['list:stale']);
eq('47時間はまだ鳴らない（週間の周は1回飛ばしても許す）',
  s.judgeImportStall(base({ fullLastRunAt: hoursAgo(47) })).length, 0);
eq('48時間ちょうどで鳴る',
  kinds(s.judgeImportStall(base({ fullLastRunAt: hoursAgo(48) }))), ['full:stale']);

console.log('\n── 5. 時刻の扱い（mediaLinkStall と同じ規則）──');
eq('未来の時刻では鳴らさない',
  s.judgeImportStall(base({ fullLastRunAt: new Date(NOW.getTime() + 3600000).toISOString() })).length, 0);
// ★ 読めない時刻は「無い」と同じ。createdAt へ倒れる
eq('読めない時刻は起点を createdAt に倒す',
  kinds(s.judgeImportStall(base({ listLastRunAt: 'いつか', fullLastRunAt: 'いつか', createdAt: hoursAgo(72) }))),
  ['list:never', 'full:never']);
eq('長さは切り捨て', s.importElapsedLabel(71.9), '2日');
eq('47時間はまだ時間', s.importElapsedLabel(47), '47時間');
// ★ 店舗が読む1行に英語の状態名を混ぜない
{
  const all = s.judgeImportStall(base({ listLastRunAt: hoursAgo(9), fullLastRunAt: hoursAgo(72) }));
  eq('文言に英語の状態名が出ない',
    all.some((f) => /never|stale|list|full/.test(f.message)), false);
}
// ★★ 内部の記法（★）を店舗の画面に出さない。2026-08-29 に一度漏らした
{
  const all = [
    ...s.judgeImportStall(base({ listLastRunAt: hoursAgo(9), fullLastRunAt: hoursAgo(72) })),
    ...s.judgeImportStall(base({ listLastRunAt: null, fullLastRunAt: null, createdAt: hoursAgo(72) })),
  ];
  eq('★ 文言に「★」を混ぜない', all.some((f) => f.message.indexOf('★') >= 0), false);
  eq('★ 文言を4通りとも点検している', all.length, 4);
}
eq('未知の provider はそのまま出す', s.importSlotLabel('esulove', 2), 'esulove（枠2）');
eq('駅ちかは日本語にする', s.importSlotLabel('ekichika', 1), '駅ちか（枠1）');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
