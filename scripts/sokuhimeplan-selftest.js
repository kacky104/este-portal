// 今すぐ→即ヒメ の計画（src/lib/ekichikaSokuhimePlan.ts）の自己点検（第214便／第327便で複数人に）。
//   使い方: npm run check:sokuhimeplan
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaSokuhimePlan.js'));
let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name);
};
const NOW = 1_800_000_000;
const P = (id, o) => Object.assign({ therapistId: id, name: '人' + id, castId: String(100 + id), imasuguByFukues: true, imasuguUntilUnix: NOW + 1800 }, o || {});
const B = (i, o) => Object.assign({ index: i, girlId: null, sokuikuId: null, expiresAtUnix: null }, o || {});
const plan = (o) => v.planSokuhime(Object.assign({ people: [], boxes: [B(0), B(1), B(2)], workingCastIds: [], pushedByFukues: [], remainingCount: null, nowUnix: NOW }, o));
const reasons = (p) => p.blocked.map((b) => b.reason);
const names = (p) => p.sets.map((s) => s.name);

console.log('── 1. ★ 既定（maxSet を渡さない）は1周1人だけ ──');
let p = plan({ people: [P(1), P(2), P(3)], workingCastIds: ['101', '102', '103'] });
eq('1人目だけ sets（枠1）', p.sets.map((s) => [s.name, s.slotIndex, s.castId]), [['人1', 0, '101']]);
eq('残り2人は waiting', p.waiting.map((w) => w.name), ['人2', '人3']);
eq('blocked は無し', p.blocked, []);
eq('1行', v.sokuhimePlanSummary(p), '人1さんを枠1へ ／ 次の周で 2名');

console.log('\n── 1-b. ★★★ 第327便: 1周で最大6人（10分周期・枠の若い順に割り当てる） ──');
eq('上限の定数は6', v.SOKUHIME_MAX_PER_ROUND, 6);
p = plan({
  people: [P(1), P(2), P(3), P(4), P(5), P(6), P(7)],
  workingCastIds: ['101', '102', '103', '104', '105', '106', '107'],
  boxes: [B(0), B(1), B(2), B(3), B(4), B(5), B(6), B(7)],
  maxSet: v.SOKUHIME_MAX_PER_ROUND,
});
eq('6人ぶん sets', names(p), ['人1', '人2', '人3', '人4', '人5', '人6']);
eq('★ 枠は若い順に別々（同じ枠に二人入れない）', p.sets.map((s) => s.slotIndex), [0, 1, 2, 3, 4, 5]);
eq('7人目は waiting（次の周）', p.waiting.map((w) => w.name), ['人7']);
eq('blocked は無し', p.blocked, []);
p = plan({
  people: [P(1), P(2), P(3)], workingCastIds: ['101', '102', '103'],
  boxes: [B(0), B(1)], maxSet: 6,
});
eq('枠2つに3人 → 2人 sets・3人目は no_free_slot', [names(p), p.waiting, reasons(p)], [['人1', '人2'], [], ['no_free_slot']]);

console.log('\n── 2. ★★★ 書く元はフクエスの枠だけ（取り込み枠は書き戻さない）──');
p = plan({ people: [P(1, { imasuguByFukues: false })], workingCastIds: ['101'] });
eq('今すぐが無い人は何もしない（blocked にも入れない）', [p.sets, p.blocked], [[], []]);
eq('1行', v.sokuhimePlanSummary(p), '送る人はいません');

console.log('\n── 3. 送れない理由（順番に意味がある）──');
eq('結びが無い → unlinked', reasons(plan({ people: [P(1, { castId: null })], workingCastIds: [] })), ['unlinked']);
eq('出勤中でない → not_working', reasons(plan({ people: [P(1)], workingCastIds: [] })), ['not_working']);
eq('既に枠に居る（生きている） → already_on', reasons(plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })] })), ['already_on']);
eq('空き枠が無い → no_free_slot', reasons(plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '555', sokuikuId: '1', expiresAtUnix: NOW + 600 })] })), ['no_free_slot']);
eq('回数制で残り0 → no_remaining_count', reasons(plan({ people: [P(1)], workingCastIds: ['101'], remainingCount: 0 })), ['no_remaining_count']);
eq('回数制で残り1 → 送る', plan({ people: [P(1)], workingCastIds: ['101'], remainingCount: 1 }).sets.length, 1);
// ★★ 第338便: 画面の名前は実物（セラピスト設定）。★ 消えた画面の名前を案内しない
eq('★ 文言は店舗様の言葉（「セラピスト設定」で連携してください）', plan({ people: [P(1, { castId: null })] }).blocked[0].message.includes('「セラピスト設定」で連携してください'), true);
eq('★★ 消えた画面の名前（セラピスト一覧）を出さない', plan({ people: [P(1, { castId: null })] }).blocked[0].message.includes('セラピスト一覧'), false);

console.log('\n── 3-b. ★★★ 回数制は残り回数を超えて押さない（第327便・まとめ押しの頭打ち）──');
p = plan({
  people: [P(1), P(2), P(3), P(4)], workingCastIds: ['101', '102', '103', '104'],
  boxes: [B(0), B(1), B(2), B(3)], remainingCount: 2, maxSet: 6,
});
eq('残り2回なら2人まで。残りは waiting', [names(p), p.waiting.map((w) => w.name)], [['人1', '人2'], ['人3', '人4']]);

console.log('\n── 4. ★★★ 45分で切れた枠は空きとみなして押し直す（§12-2）──');
p = plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW - 60 }), B(1)] });
eq('切れている自分の枠へ押し直す（oldGirlId / oldSokuikuId を渡す＝入れ替え）', p.sets.map((s) => [s.slotIndex, s.oldGirlId, s.oldSokuikuId]), [[0, '101', '9']]);
p = plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '555', sokuikuId: '9', expiresAtUnix: NOW - 60 }), B(1)] });
eq('切れている他人の枠も空き扱い（小さい番号から）', p.sets.map((s) => [s.slotIndex, s.oldGirlId]), [[0, '555']]);
p = plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '555', sokuikuId: '9', expiresAtUnix: NOW + 60 }), B(1)] });
eq('生きている他人の枠は使わない → 枠2へ', p.sets.map((s) => s.slotIndex), [1]);

console.log('\n── 5. ★★★ 消す（フクエスの今すぐが終わった・フクエスが押した枠だけ）──');
p = plan({ people: [P(1, { imasuguByFukues: false })], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })], pushedByFukues: ['101'] });
eq('今すぐが終わった → その枠を消す', p.dels.map((d) => [d.slotIndex, d.castId, d.sokuikuId, d.expiresAtUnix]), [[0, '101', '9', NOW + 600]]);
p = plan({ people: [P(1, { imasuguByFukues: false })], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })], pushedByFukues: [] });
eq('★★★ フクエスが押していない枠（店舗が駅ちかで直接押した）は消さない', p.dels, []);
p = plan({ people: [P(1)], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })], workingCastIds: ['101'], pushedByFukues: ['101'] });
eq('今すぐがまだ生きていれば消さない（already_on）', [p.dels, reasons(p)], [[], ['already_on']]);
p = plan({ people: [], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW - 1 })], pushedByFukues: ['101'] });
eq('もう切れている枠は消さない（相手が消す）', p.dels, []);
p = plan({ people: [], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 1 })], pushedByFukues: ['101'] });
eq('people に居ない（退店など）でもフクエスが押した枠なら消す', p.dels.map((d) => d.castId), ['101']);
const twoBoxes = [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 1 }), B(1, { girlId: '102', sokuikuId: '8', expiresAtUnix: NOW + 1 })];
p = plan({ people: [], boxes: twoBoxes, pushedByFukues: ['101', '102'] });
eq('既定（maxDel を渡さない）は1周1件', p.dels.map((d) => d.castId), ['101']);
eq('1行', v.sokuhimePlanSummary(p), '送る人はいません ／ 枠1を消す');
p = plan({ people: [], boxes: twoBoxes, pushedByFukues: ['101', '102'], maxDel: 6 });
eq('★ 第327便: maxDel を渡せばまとめて消す', p.dels.map((d) => d.castId), ['101', '102']);
eq('1行（複数）', v.sokuhimePlanSummary(p), '送る人はいません ／ 枠1・枠2を消す');

console.log('\n── 6. 空き枠の数え方 ──');
p = plan({ people: [P(1), P(2), P(3)], workingCastIds: ['101', '102', '103'], boxes: [B(0), B(1)] });
eq('枠2つに3人（1人上限） → 1人 sets・1人 waiting・1人 no_free_slot', [names(p), p.waiting.map((w) => w.name), reasons(p)], [['人1'], ['人2'], ['no_free_slot']]);
eq('入力を壊さない', (() => { const b = [B(0)]; const s = JSON.stringify(b); plan({ boxes: b }); return JSON.stringify(b) === s; })(), true);

console.log('\n── 7. まとめ押しの1行 ──');
p = plan({ people: [P(1), P(2)], workingCastIds: ['101', '102'], maxSet: 6 });
eq('2人まとめ', v.sokuhimePlanSummary(p), '人1さん・人2さんの2名を枠へ');

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
