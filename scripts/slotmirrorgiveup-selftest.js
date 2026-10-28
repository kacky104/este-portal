// 枠2以降の自動登録の打ち切り（src/lib/slotMirrorGiveUp.ts・第1698便・A-3）の自己点検。
const path = require('path');
const G = require(path.join(__dirname, '..', '_tmpcheck', 'slotMirrorGiveUp.js'));

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? 'ok ' : 'NG ') + name + (ok ? '' : '\n   got:  ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want)));
};

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const h = (n) => new Date(NOW - n * 3600_000).toISOString();
const row = (name, hoursAgo, o = {}) => ({ event: 'create_girl', outcome: 'failed', created_at: h(hoursAgo), detail: { name, reason: 'not_created', ...o } });

console.log('── 記録から失敗を拾う ──');
{
  const f = G.createGirlFailures([
    row('りおな', 1),
    { event: 'create_girl', outcome: 'ok', created_at: h(1), detail: { name: 'きほ' } },
    { event: 'login', outcome: 'failed', created_at: h(1), detail: {} },
    { event: 'create_girl', outcome: 'stopped', created_at: h(2), detail: { reason: 'no_name' } },
    { event: 'create_girl', outcome: 'stopped', created_at: h(2), detail: { name: 'あい', reason: 'already_listed', sameCount: 2 } },
  ]);
  eq('ok・別の出来事・名前なしは拾わない', f.map((x) => x.name), ['りおな', 'あい']);
  eq('同名の人数を拾う', f[1].sameCount, 2);
}

console.log('── 打ち切り ──');
{
  const fails = G.createGirlFailures([row('りおな', 1), row('りおな', 2), row('りおな', 3), row('みさき', 1), row('みさき', 2), row('えいみ', 1), row('えいみ', 2), row('えいみ', 30)]);
  eq('★★★ 24時間で3回 → 試さない', G.slotMirrorGiveUp({ name: 'りおな', failures: fails, nowMs: NOW }).givenUp, true);
  eq('★★ 2回 → まだ試す', G.slotMirrorGiveUp({ name: 'みさき', failures: fails, nowMs: NOW }).givenUp, false);
  eq('★★ 24時間より前の失敗は数えない（えいみ は2回）', G.slotMirrorGiveUp({ name: 'えいみ', failures: fails, nowMs: NOW }).count, 2);
  eq('★★★ 最後の失敗より後に直した → また試す', G.slotMirrorGiveUp({ name: 'りおな', failures: fails, nowMs: NOW, updatedAt: h(0.5) }).givenUp, false);
  eq('★ 最後の失敗より前の更新 → 試さないまま', G.slotMirrorGiveUp({ name: 'りおな', failures: fails, nowMs: NOW, updatedAt: h(5) }).givenUp, true);
  eq('★ 名前の全角・半角の空白は同じ扱い', G.slotMirrorGiveUp({ name: ' りおな ', failures: fails, nowMs: NOW }).givenUp, true);
  eq('★ 失敗が無い方', G.slotMirrorGiveUp({ name: 'るい', failures: fails, nowMs: NOW }), { givenUp: false, last: null, count: 0 });
}

console.log('── 帯に出す理由（店舗様が直せるものだけ）──');
{
  const one = (o) => G.slotMirrorStuckReason(G.createGirlFailures([row('あい', 1, o)])[0]);
  eq('★★★ 同名が2人 → 出す', /同じ名前の方が2人/.test(one({ reason: 'already_listed', sameCount: 2 })), true);
  eq('★★ 同名が1人（結びつけた）→ 出さない', one({ reason: 'already_listed', sameCount: 1 }), null);
  eq('★★★ 組み立てが止めた（理由あり）→ 出す', one({ reason: 'blocked', note: '名前が長すぎます' }), '登録する内容に問題があるため（名前が長すぎます）');
  eq('★★ 一覧に増えない（駅ちか側）→ 運営だけ', one({ reason: 'not_created' }), null);
  eq('★★ 画面が読めない → 運営だけ', one({ reason: 'parse_failed' }), null);
  eq('★ 記録が無い → 出さない', G.slotMirrorStuckReason(null), null);
}

console.log('── 閉じる ──');
{
  const ids = G.slotMirrorStuckIds([{ slot: 2, therapistId: 9 }, { slot: 2, therapistId: 3 }]);
  eq('印は並べ替える', ids, ['2-3', '2-9']);
  eq('★ 閉じた記録が無ければ出す', G.slotMirrorStuckShouldShow(ids, null), true);
  eq('★★ 同じ顔ぶれ → 出さない', G.slotMirrorStuckShouldShow(ids, ['2-3', '2-9']), false);
  eq('★★ 1人減っただけ → 出さない', G.slotMirrorStuckShouldShow(['2-3'], ['2-3', '2-9']), false);
  eq('★★★ 新しい方が増えた → また出す', G.slotMirrorStuckShouldShow(['2-3', '2-11'], ['2-3', '2-9']), true);
  eq('★ 誰もいなければ出さない', G.slotMirrorStuckShouldShow([], null), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
