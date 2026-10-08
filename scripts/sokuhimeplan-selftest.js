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

console.log('\n── 8. ★★★ 第1282便: 「フクエスが押した枠」は、押してから45分以内の記録だけ ──');
{
  // ★ 実際に起きた（ラビリンス様 10/6）: 15:59 に押した2名（～16:44 迄）を、17:09 に「フクエスの枠」として外した。
  //   16:44 を過ぎて枠に居たのは、だれかが入れ直した即ヒメ。
  const at = (hhmm) => Date.parse('2026-10-06T' + hhmm + ':00+09:00');
  const pushedAt = at('15:59');
  const owned = (nowMs) => pushedAt >= Date.parse(v.sokuhimeOwnedSinceISO(nowMs));
  eq('即ヒメが続く時間は45分', v.SOKUHIME_LIFETIME_MIN, 45);
  eq('★ 16:39（押して40分）: まだフクエスの枠', owned(at('16:39')), true);
  eq('★ 16:44（押して45分ちょうど）: まだフクエスの枠', owned(at('16:44')), true);
  eq('★★★ 16:49（押して50分）: もうフクエスの枠ではない', owned(at('16:49')), false);
  eq('★★★ 17:09（実際に外してしまった時刻）: フクエスの枠ではない', owned(at('17:09')), false);
  // ★ 計画: 「フクエスが押した」に入っていなければ、枠に居ても外さない
  const boxes = [B(0, { girlId: '101' }), B(1, { girlId: '102' }), B(2)];
  const off = [P(1, { imasuguByFukues: false }), P(2, { imasuguByFukues: false })];
  eq('★★★ 45分を過ぎた記録を渡さなければ、人が入れた即ヒメは外さない', plan({ people: off, boxes, workingCastIds: ['101', '102'], pushedByFukues: [], maxDel: 6 }).dels, []);
  eq('★ 45分以内の記録の方は、今すぐが終わっていれば外す（今までどおり）', plan({ people: off, boxes, workingCastIds: ['101', '102'], pushedByFukues: ['101'], maxDel: 6 }).dels.map((d) => d.castId), ['101']);

  // ★★ 2か所（中継の計画・周の入口）が同じ物差しを使っていること。★ 片方だけ24時間に戻すと、用の無いログインか、人の枠の解除が戻る
  const fs = require('fs'), path = require('path');
  const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const near = (text) => {
    const out = [];
    let i = -1;
    while ((i = text.indexOf("from('media_sokuhime_pushes')", i + 1)) >= 0) out.push(text.slice(i, i + 420));
    return out;
  };
  const flow = src('src/app/lib/media/relayFlow.ts');
  const planRead = near(flow).filter((x) => x.includes(".select('cast_id')"));
  eq('★★★ 中継の計画: 押した記録を読むところは1か所で、45分の物差しを使う', [planRead.length, planRead.every((x) => x.includes('sokuhimeOwnedSinceISO('))], [1, true]);
  const route = src('src/app/api/admin/sokuhime-push/route.ts');
  const routeRead = near(route.replace(/\r/g, '').replace(/\n\s*/g, ' '));
  eq('★★★ 周の入口: 開いた記録を数えるところも、45分の物差しを使う', [routeRead.length, routeRead.every((x) => x.includes('sokuhimeOwnedSinceISO('))], [1, true]);
  eq('★ 周の入口に「24時間」の絞り込みが残っていない', /24 \* 3600 \* 1000/.test(route), false);
}

console.log('\n── 9. ★★★ 第1283便: 即ヒメを送らない枠（運営が枠ごとに止める・既定は送る）──');
{
  const fs = require('fs'), path = require('path');
  const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const route = src('src/app/api/admin/sokuhime-push/route.ts');
  eq('★★★ 周の入口が、止めた枠（sokuhime_push_off）を引いている', /\.eq\('sokuhime_push_off', true\)/.test(route), true);
  // ★ 止めた枠は、同意やほかの条件より前に外す（★ 中継ジョブを積まない＝ログインしない）
  const iOff = route.indexOf('pushOff.has('), iStart = route.indexOf('await startRelayFlow({\n        salonId: Number(r.salon_id)');
  eq('★★★ 止めた枠は、中継ジョブを積む前に外す', iOff > 0 && iStart > iOff, true);
  // ★★ 追加SQL の前に push されても、周ごと落ちない（列が無い＝止めた枠は無い）。★ 落ちるとラビリンス様の即ヒメが止まる
  eq('★★★ 列がまだ無いときは「止めた枠は無い」として進む', /offErr\.code !== '42703' && offErr\.code !== 'PGRST204'\) return NextResponse\.json/.test(route), true);
  // ★ 一覧（駅ちかへ書く向きの枠を引く問い合わせ）には、新しい列を足さない（足すと、列が無いあいだ全店の即ヒメが止まる）
  const mainSelect = /\.select\('salon_id, slot, salons!inner\(conecf_enabled_at\)'\)/.test(route);
  eq('★★ 書く向きの枠を引く問い合わせは、今までの列だけ', mainSelect, true);
  const ov = src('src/app/actions/mediaCredentials.ts');
  eq('★★ 店舗様の画面へ渡す側も、読めなくても画面を止めない（別の問い合わせ）', /\.eq\('salon_id', salonId\)\.eq\('sokuhime_push_off', true\)/.test(ov), true);
}

console.log('\n── 10. ★★★ 第1317便: 用が無い周はログインしない（周の下調べ・sokuhimeIdleCheck）──');
{
  const NOW_MS = NOW * 1000;
  const minAgo = (m) => NOW_MS - m * 60 * 1000;
  const L = (id, o) => Object.assign({ castId: String(100 + id), imasuguByFukues: true }, o || {});
  const idle = (people, pushes) => v.sokuhimeIdleCheck({ people, pushes, nowMs: NOW_MS });
  const push = (id, m) => ({ castId: String(100 + id), pushedAtMs: minAgo(m) });

  eq('余裕の定数は3分', v.SOKUHIME_IDLE_MARGIN_MIN, 3);
  eq('★★★ 全員、押した記録が新しい → 用が無い', idle([L(1), L(2)], [push(1, 9), push(2, 29)]), { idle: true, reason: 'all_on' });
  eq('★★★ 1人でも押した記録が無ければ、読みに行く', idle([L(1), L(2)], [push(1, 9)]), { idle: false, reason: 'needs_push' });
  eq('★★★ 「今すぐ」でない方（取り込み枠だけの方も）は数えない', idle([L(1), L(2, { imasuguByFukues: false })], [push(1, 9)]), { idle: true, reason: 'all_on' });

  // ★ 切れる間際: 押してから42分までは待つ。42分を過ぎたら読みに行く（記録の時刻は実際に押した時刻より少し遅い）
  eq('41分前の記録 → 用が無い', idle([L(1)], [push(1, 41)]).idle, true);
  eq('★★ 43分前の記録（45分の内側だが間際）→ 読みに行く', idle([L(1)], [push(1, 43)]), { idle: false, reason: 'needs_push' });
  eq('★★ 46分前の記録（もう切れている）→ 読みに行く', idle([L(1)], [push(1, 46)]), { idle: false, reason: 'needs_push' });
  eq('★ 古い記録と新しい記録が両方あれば、新しいほうで決まる', idle([L(1)], [push(1, 50), push(1, 5)]).idle, true);

  // ★★★ 押し直しの間隔を今までと変えない: 周は10分ごと。押した周の次から 9・19・29・39分後は待ち、49分後に読みに行く
  eq('★★★ 押してから 9・19・29・39分後の周は入らず、49分後の周で入る',
    [9, 19, 29, 39, 49].map((m) => idle([L(1)], [push(1, m)]).idle), [true, true, true, true, false]);

  // ★ 外す仕事: フクエスが押して45分以内の方の「今すぐ」が終わっている → 読みに行く（枠にまだ居るかは読まないと分からない）
  eq('★★★ 押した方の「今すぐ」が終わっていれば、外しに行く', idle([L(1), L(2, { imasuguByFukues: false })], [push(1, 9), push(2, 20)]), { idle: false, reason: 'needs_del' });
  eq('★★ 「今すぐ」の方が0人でも、外す枠があれば行く', idle([L(2, { imasuguByFukues: false })], [push(2, 20)]), { idle: false, reason: 'needs_del' });
  eq('★ 45分を過ぎた記録は外す仕事に数えない（もう切れている・第1282便と同じ物差し）', idle([L(1), L(2, { imasuguByFukues: false })], [push(1, 9), push(2, 46)]), { idle: true, reason: 'all_on' });
  eq('「今すぐ」の方が0人で、外す枠も無い → 用が無い', idle([L(1, { imasuguByFukues: false })], []), { idle: true, reason: 'no_one' });

  // ★ 店舗様が直せる理由は、今までどおり記録に出す（＝読みに行く）
  eq('★★ 連携していない方が「今すぐ」なら、読みに行く', idle([L(1), L(2, { castId: null })], [push(1, 9)]), { idle: false, reason: 'unlinked' });
  // ★ 分からないときは「用が無い」と決めつけない
  eq('★★ 記録の時刻を読めなければ、読みに行く', idle([L(1)], [{ castId: '101', pushedAtMs: NaN }]), { idle: false, reason: 'unknown' });
  eq('★ いまの時刻が読めなければ、読みに行く', v.sokuhimeIdleCheck({ people: [L(1)], pushes: [push(1, 9)], nowMs: NaN }).idle, false);

  // ── つなぎ（周の入口と中継）──
  const fs = require('fs'), path = require('path');
  const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r/g, '');
  const route = src('src/app/api/admin/sokuhime-push/route.ts');
  const flow = src('src/app/lib/media/relayFlow.ts');
  const iWork = route.indexOf('await hasSokuhimeWork('), iStart = route.indexOf('await startRelayFlow({\n        salonId: Number(r.salon_id)');
  eq('★★★ 周の入口: 中継ジョブを積む前に下調べをする', iWork > 0 && iStart > iWork, true);
  eq('★★ 用が無ければ、理由を残して積まない', /if \(!work\.ok\) \{ skipped\.push\(\{ target, why: work\.why \}\); continue; \}/.test(route), true);
  // ★ 止めた枠・同意していない枠・「今すぐ」も外す枠も無い店は、下調べの前に外れる（問い合わせを増やさない）
  eq('★ 下調べは、止めた枠・同意・第325便のふるいの後ろ', route.indexOf('pushOff.has(') < iWork && route.indexOf('consentOk.has(') < iWork && route.indexOf('!liveSalons.has(') < iWork, true);
  const body = flow.slice(flow.indexOf('export async function hasSokuhimeWork('), flow.indexOf('★ 即ヒメ設定画面の写しを残す（第213便）'));
  eq('★★★ 下調べの決め方は sokuhimeIdleCheck（ここに条件を書かない）', /sokuhimeIdleCheck\(\{/.test(body), true);
  eq('★★★ 下調べも、押した記録を45分の物差しで引く', /\.is\('removed_at', null\)\s*\.gte\('pushed_at', sokuhimeOwnedSinceISO\(now\.getTime\(\)\)\)/.test(body), true);
  eq('★★ 読めなかったときは通す（4か所とも count: -1）', (body.match(/return \{ ok: true, count: -1 \};/g) || []).length, 4);
  eq('★★★ 「人」の組み立ては1つ（定義1＋中継の計画1＋下調べ1）', (flow.match(/sokuhimePeopleOf\(/g) || []).length, 3);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
