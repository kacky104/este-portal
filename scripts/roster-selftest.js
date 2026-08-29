// 名簿の突き合わせ（src/lib/mediaRoster.ts）の自己点検（第49便）。
//
// ★★★ なぜ要るか
//   この判定の本体は「人数を数えること」ではなく **「その数字を信じてよいかを言うこと」**。
//   数え間違いは目で気づけるが、★ 根拠の取り違えは【画面上まったく同じ見た目になる】。
//     未照合 0人（本当に揃っている）  と  記録が無いので分からない
//     どちらも「一覧が空」で出てくる。
//   → 第48便 §62 と同じ作法で、**同じ見た目になる2つを1組で書く**。
//     片方だけ書くと、区別したつもりで何も区別できていないことに気づけない。
//
//   使い方:  npm run check:roster
//
// ★ 期待値を直すときは【なぜその値が正しいのか】をコメントに残すこと。

const r = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaRoster.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

const NOW = new Date('2026-08-30T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();

const run = (o) => Object.assign({ startedAt: hoursAgo(1), status: 'ok', unmatched: [] }, o);

// フクエス側の在籍（既定）。★ id は昇順にしない（並べ替えが効いていることを見るため）
const PEOPLE = [
  { id: 30, name: 'ゆい', isActive: true },
  { id: 10, name: 'さら', isActive: true },
  { id: 20, name: 'もえ', isActive: false },
];

const build = (o) => r.buildRoster(Object.assign({
  provider: 'ekichika', slot: 1, linkMode: 'read',
  therapists: PEOPLE, linkedIds: [10, 20, 30], lastRun: run(), now: NOW,
}, o));

const judge = (o) => r.judgeRosterEvidence(Object.assign({
  linkMode: 'read', lastRun: run(), now: NOW,
}, o));

console.log('── 1. 根拠の判定 ──');

// ★★★ いちばん大事な1組。**見た目が同じで、意味が違う**。
//   どちらも onlyOnMedia は空配列。区別しているのは onlyOnMediaKnown だけ。
{
  const 揃っている = build({ lastRun: run({ unmatched: [] }) });
  const 分からない = build({ lastRun: null });
  eq('★ 未照合0件 … 一覧は空', 揃っている.onlyOnMedia, []);
  eq('★ 記録が無い … 一覧も空（★ 見た目は同じ）', 分からない.onlyOnMedia, []);
  eq('★ 未照合0件は【信じてよい】', 揃っている.onlyOnMediaKnown, true);
  eq('★ 記録が無いときは【信じてはいけない】', 分からない.onlyOnMediaKnown, false);
}

// ★ 向きが書き込みなら、取り込みが古いのは設計どおり。警告にしない（設計メモ §11）。
//   ★ 同じ lastRun で結果が割れる形にする。割れなければ linkMode を見ていない証拠。
{
  const 古いrun = run({ startedAt: hoursAgo(72) });
  eq('読み取りの向き＋72時間前 → stale', judge({ linkMode: 'read', lastRun: 古いrun }).kind, 'stale');
  eq('★ 書き込みの向き＋同じrun → paused', judge({ linkMode: 'write', lastRun: 古いrun }).kind, 'paused');
  eq('★ 自動の向きも paused', judge({ linkMode: 'write_auto', lastRun: 古いrun }).kind, 'paused');
}
// ★ 書き込みの向きは「記録が無くても」paused。none に落とさない
//   （落とすと「取り込んだことがない」という別の話に見える）
eq('書き込みの向き＋記録なし → paused', judge({ linkMode: 'write', lastRun: null }).kind, 'paused');
eq('書き込みの向き＋記録なしの経過は null', judge({ linkMode: 'write', lastRun: null }).ageHours, null);

// ★ 失敗した周の数字は信じない。★ 一覧が短く返っただけで全員が「居ない」に見えうる
{
  const 成功 = build({ lastRun: run({ status: 'ok', unmatched: ['あや'] }) });
  const 失敗 = build({ lastRun: run({ status: 'error', unmatched: ['あや'] }) });
  eq('成功した周の未照合は出す', 成功.onlyOnMedia, ['あや']);
  eq('★ 失敗した周の未照合は出さない', 失敗.onlyOnMedia, []);
  eq('★ 失敗した周は信じない印が付く', 失敗.onlyOnMediaKnown, false);
}
// ★ 'running'（途中）も信じない。★ 'ok' 以外はすべて error 扱い
eq("途中の周も信じない", judge({ lastRun: run({ status: 'running' }) }).kind, 'error');
eq('知らない status も信じない', judge({ lastRun: run({ status: 'なにか' }) }).kind, 'error');

// ★ 鮮度の境界。既定36時間 ＝ 1日1回の周を1回飛ばしても許す幅
eq('35時間はまだ fresh', judge({ lastRun: run({ startedAt: hoursAgo(35) }) }).kind, 'fresh');
eq('36時間ちょうどで stale', judge({ lastRun: run({ startedAt: hoursAgo(36) }) }).kind, 'stale');
// ★ stale でも「その時点の数字」としては読める。だから known は true のまま
eq('★ stale でも未照合は読める', build({ lastRun: run({ startedAt: hoursAgo(48), unmatched: ['あや'] }) }).onlyOnMediaKnown, true);

// ★ 読めない時刻・未来の時刻（mediaLinkStall と同じ規則）
eq('読めない時刻は無いものと同じ', judge({ lastRun: run({ startedAt: 'いつか' }) }).kind, 'none');
eq('未来の時刻の経過は0', judge({ lastRun: run({ startedAt: new Date(NOW.getTime() + 3600000).toISOString() }) }).ageHours, 0);
eq('未来の時刻は fresh 扱い', judge({ lastRun: run({ startedAt: new Date(NOW.getTime() + 3600000).toISOString() }) }).kind, 'fresh');

console.log('\n── 2. 突き合わせ ──');

// ★ 並び順は id 昇順。入力順（30,10,20）に引きずられないこと
eq('紐づいていない子は id 昇順',
  build({ linkedIds: [] }).unlinked.map((p) => p.id), [10, 20, 30]);

// ① 紐づいていない人
eq('castId が無い子だけが unlinked に出る',
  build({ linkedIds: [10] }).unlinked.map((p) => p.name), ['もえ', 'ゆい']);

// ② 紐づいているが非公開（★ create_missing が作ったまま放置された形）
eq('紐づいていて非公開なら linkedButHidden',
  build({ linkedIds: [10, 20, 30] }).linkedButHidden.map((p) => p.name), ['もえ']);
// ★★ 二重に数えないこと。紐づいていない かつ 非公開 の子は unlinked にだけ出る
{
  const x = build({ linkedIds: [10, 30] });
  eq('★ 紐づいていない非公開の子は unlinked にだけ', x.unlinked.map((p) => p.name), ['もえ']);
  eq('★ 同じ子を linkedButHidden に重ねない', x.linkedButHidden, []);
}

// 人数
{
  const x = build({ linkedIds: [10] });
  eq('total は行の数', x.total, 3);
  eq('active は公開中だけ', x.active, 2);
  eq('linked は castId がある数', x.linked, 1);
}
// ★ 在籍に居ない id が linkedIds に混ざっていても、数を水増ししない
eq('知らない id は数に入れない', build({ linkedIds: [10, 999] }).linked, 1);
eq('在籍が空でも壊れない', build({ therapists: [], linkedIds: [10] }).total, 0);

console.log('\n── 3. 文言 ──');

// ★ 異常が無ければ文言も出ない（「異常なし」の行を作らない・mediaLinkStall と同じ）
eq('fresh は文言を出さない', r.evidenceMessage(judge({})), null);
// ★★ 記録が無いときの文言は「0人」ではなく「分からない」と言い切ること
{
  const m = r.evidenceMessage(judge({ lastRun: null }));
  eq('記録なしの文言に【分からない】が入る', m.indexOf('分からない') > 0, true);
  eq('記録なしの文言に「0人ではなく」が入る', m.indexOf('0人ではなく') > 0, true);
}
// ★ 店舗が読む1行に英語の状態名を混ぜない（監査ログ migration の作法）
for (const [name, e] of [
  ['none', judge({ lastRun: null })],
  ['paused', judge({ linkMode: 'write' })],
  ['error', judge({ lastRun: run({ status: 'error' }) })],
  ['stale', judge({ lastRun: run({ startedAt: hoursAgo(72) }) })],
]) {
  const m = r.evidenceMessage(e);
  eq(name + ' の文言に英語の状態名が出ない',
    /none|paused|error|stale|fresh/.test(m), false);
}
// ★ 長さは切り捨て（実際より長く言わない）
eq('35.9時間 → 35時間', r.rosterAgeLabel(35.9), '35時間');
eq('47時間はまだ時間', r.rosterAgeLabel(47), '47時間');
eq('48時間から日', r.rosterAgeLabel(48), '2日');

// ★ 異常が無い店に箱を出さない
eq('全員紐づいて公開中なら findings なし',
  r.rosterHasFindings(build({ linkedIds: [10, 30], therapists: [
    { id: 10, name: 'さら', isActive: true }, { id: 30, name: 'ゆい', isActive: true },
  ] })), false);
eq('1人でも紐づいていなければ findings あり',
  r.rosterHasFindings(build({ linkedIds: [10] })), true);
// ★ 記録が無いだけでは findings にしない（分からないことは異常ではない）
eq('★ 記録が無いだけでは findings にしない',
  r.rosterHasFindings(build({ lastRun: null, linkedIds: [10, 30], therapists: [
    { id: 10, name: 'さら', isActive: true }, { id: 30, name: 'ゆい', isActive: true },
  ] })), false);

console.log('\n── 4. ★★★ 名簿の写し（第50便）──');

// 媒体側にいる3人。うち 900 はこちらが番号を知らない＝退店者が駅ちかに残っている形
const snap = (o) => Object.assign({
  readAtISO: hoursAgo(1),
  entries: [
    { castId: '100', name: 'こう' },
    { castId: '200', name: 'おつ' },
    { castId: '900', name: 'のこり' },
  ],
}, o || {});

// ★★★ この便の芯。**同じ入力で、写しの有無だけで結果が割れる**
//   写し無し … 取り込みが止まっているので ③ は分からない
//   写しあり … 明示的に読んだので ③ が出る
{
  const 写し無し = build({ linkMode: 'write', lastRun: run({ startedAt: hoursAgo(72) }) });
  const 写しあり = build({ linkMode: 'write', lastRun: run({ startedAt: hoursAgo(72) }),
    snapshot: snap(), knownCastIds: ['100', '200'] });
  eq('★ 写し無し・書き込みの向き → paused', 写し無し.evidence.kind, 'paused');
  eq('★ 写し無しでは3が分からない', 写し無し.onlyOnMediaKnown, false);
  eq('★ 写しありなら同じ向きでも fresh', 写しあり.evidence.kind, 'fresh');
  eq('★ 写しありなら3が出せる', 写しあり.onlyOnMediaKnown, true);
  eq('★ 出典が写しになる', 写しあり.source, 'snapshot');
}

// ★ 写しから3を出す。★ こちらが番号を知らない子だけが出ること
{
  const r = build({ snapshot: snap(), knownCastIds: ['100', '200'] });
  eq('媒体だけにいる人が出る', r.onlyOnMedia, ['のこり']);
  eq('媒体側の人数が出る', r.mediaTotal, 3);
  eq('出典は写し', r.source, 'snapshot');
}
// ★ 全員こちらが知っていれば0件。★ これは「分からない」ではなく本当に0
{
  const r = build({ snapshot: snap(), knownCastIds: ['100', '200', '900'] });
  eq('全員知っていれば0件', r.onlyOnMedia, []);
  eq('★ その0は信じてよい', r.onlyOnMediaKnown, true);
}
// ★ knownCastIds を渡し忘れたら全員が「媒体だけ」になる。★ 0件に化けないこと
{
  const r = build({ snapshot: snap() });
  eq('番号を1つも知らなければ全員出る', r.onlyOnMedia.length, 3);
}

// ★ 写しが無いときは従来どおり取り込みの未照合から出す
{
  const r = build({ lastRun: run({ unmatched: ['あや'] }) });
  eq('写し無しなら出典は取り込み', r.source, 'run');
  eq('写し無しなら媒体側の人数は分からない', r.mediaTotal, null);
  eq('写し無しでも未照合は出る', r.onlyOnMedia, ['あや']);
}
// ★ 根拠が無ければ出典も無い（null）。★ 'run' と null を混ぜない
eq('根拠が無ければ出典も無い', build({ lastRun: null }).source, null);

// ★ 写しが古ければ stale。★ ただし「その時点のもの」として読めるので known は true
{
  const r = build({ snapshot: snap({ readAtISO: hoursAgo(48) }), knownCastIds: ['100'] });
  eq('48時間前の写しは stale', r.evidence.kind, 'stale');
  eq('★ stale でも写しの中身は読める', r.onlyOnMediaKnown, true);
  eq('35時間前ならまだ fresh',
    build({ snapshot: snap({ readAtISO: hoursAgo(35) }) }).evidence.kind, 'fresh');
}
// ★ 写しの時刻が読めなければ、写しが無いものとして取り込み側へ倒れる
{
  const r = build({ snapshot: snap({ readAtISO: 'いつか' }), lastRun: run({ unmatched: ['あや'] }) });
  eq('読めない時刻の写しは無視する', r.source, 'run');
  eq('その場合は未照合から出す', r.onlyOnMedia, ['あや']);
}
// ★ 写しが空（0名）でも落ちない。★ ただし0名は保存側が弾くので、本来ここへは来ない
{
  const r = build({ snapshot: snap({ entries: [] }) });
  eq('空の写しでも落ちない', r.mediaTotal, 0);
  eq('空の写しでは3も0件', r.onlyOnMedia, []);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
