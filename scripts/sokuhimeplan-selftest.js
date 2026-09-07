// 今すぐ→即ヒメ の計画（src/lib/ekichikaSokuhimePlan.ts）の自己点検（第214便）。
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

console.log('── 1. ★★★ 1周で押すのは1人だけ ──');
let p = plan({ people: [P(1), P(2), P(3)], workingCastIds: ['101', '102', '103'] });
eq('1人目だけ set（枠1）', p.set && [p.set.name, p.set.slotIndex, p.set.castId], ['人1', 0, '101']);
eq('残り2人は waiting', p.waiting.map((w) => w.name), ['人2', '人3']);
eq('blocked は無し', p.blocked, []);
eq('1行', v.sokuhimePlanSummary(p), '人1さんを枠1へ ／ 次の周で 2名');

console.log('\n── 2. ★★★ 書く元はフクエスの枠だけ（取り込み枠は書き戻さない）──');
p = plan({ people: [P(1, { imasuguByFukues: false })], workingCastIds: ['101'] });
eq('今すぐが無い人は何もしない（blocked にも入れない）', [p.set, p.blocked], [null, []]);
eq('1行', v.sokuhimePlanSummary(p), '送る人はいません');

console.log('\n── 3. 送れない理由（順番に意味がある）──');
eq('結びが無い → unlinked', reasons(plan({ people: [P(1, { castId: null })], workingCastIds: [] })), ['unlinked']);
eq('出勤中でない → not_working', reasons(plan({ people: [P(1)], workingCastIds: [] })), ['not_working']);
eq('既に枠に居る（生きている） → already_on', reasons(plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })] })), ['already_on']);
eq('空き枠が無い → no_free_slot', reasons(plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '555', sokuikuId: '1', expiresAtUnix: NOW + 600 })] })), ['no_free_slot']);
eq('回数制で残り0 → no_remaining_count', reasons(plan({ people: [P(1)], workingCastIds: ['101'], remainingCount: 0 })), ['no_remaining_count']);
eq('回数制で残り1 → 送る', plan({ people: [P(1)], workingCastIds: ['101'], remainingCount: 1 }).set !== null, true);
eq('★ 文言は店舗様の言葉（結びつけてください）', plan({ people: [P(1, { castId: null })] }).blocked[0].message.includes('セラピスト一覧で結びつけてください'), true);

console.log('\n── 4. ★★★ 45分で切れた枠は空きとみなして押し直す（§12-2）──');
p = plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW - 60 }), B(1)] });
eq('切れている自分の枠へ押し直す（oldGirlId / oldSokuikuId を渡す＝入れ替え）', p.set && [p.set.slotIndex, p.set.oldGirlId, p.set.oldSokuikuId], [0, '101', '9']);
p = plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '555', sokuikuId: '9', expiresAtUnix: NOW - 60 }), B(1)] });
eq('切れている他人の枠も空き扱い（小さい番号から）', p.set && [p.set.slotIndex, p.set.oldGirlId], [0, '555']);
p = plan({ people: [P(1)], workingCastIds: ['101'], boxes: [B(0, { girlId: '555', sokuikuId: '9', expiresAtUnix: NOW + 60 }), B(1)] });
eq('生きている他人の枠は使わない → 枠2へ', p.set && p.set.slotIndex, 1);

console.log('\n── 5. ★★★ 消す（フクエスの今すぐが終わった・フクエスが押した枠だけ）──');
p = plan({ people: [P(1, { imasuguByFukues: false })], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })], pushedByFukues: ['101'] });
eq('今すぐが終わった → その枠を消す', p.del && [p.del.slotIndex, p.del.castId, p.del.sokuikuId, p.del.expiresAtUnix], [0, '101', '9', NOW + 600]);
p = plan({ people: [P(1, { imasuguByFukues: false })], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })], pushedByFukues: [] });
eq('★★★ フクエスが押していない枠（店舗が駅ちかで直接押した）は消さない', p.del, null);
p = plan({ people: [P(1)], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 600 })], workingCastIds: ['101'], pushedByFukues: ['101'] });
eq('今すぐがまだ生きていれば消さない（already_on）', [p.del, reasons(p)], [null, ['already_on']]);
p = plan({ people: [], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW - 1 })], pushedByFukues: ['101'] });
eq('もう切れている枠は消さない（相手が消す）', p.del, null);
p = plan({ people: [], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 1 })], pushedByFukues: ['101'] });
eq('people に居ない（退店など）でもフクエスが押した枠なら消す', p.del && p.del.castId, '101');
p = plan({ people: [], boxes: [B(0, { girlId: '101', sokuikuId: '9', expiresAtUnix: NOW + 1 }), B(1, { girlId: '102', sokuikuId: '8', expiresAtUnix: NOW + 1 })], pushedByFukues: ['101', '102'] });
eq('消すのも1周1件', p.del && p.del.castId, '101');
eq('1行', v.sokuhimePlanSummary(p), '送る人はいません ／ 枠1を消す');

console.log('\n── 6. 空き枠の数え方 ──');
p = plan({ people: [P(1), P(2), P(3)], workingCastIds: ['101', '102', '103'], boxes: [B(0), B(1)] });
eq('枠2つに3人 → 1人 set・1人 waiting・1人 no_free_slot', [p.set && p.set.name, p.waiting.map((w) => w.name), reasons(p)], ['人1', ['人2'], ['no_free_slot']]);
eq('入力を壊さない', (() => { const b = [B(0)]; const s = JSON.stringify(b); plan({ boxes: b }); return JSON.stringify(b) === s; })(), true);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
