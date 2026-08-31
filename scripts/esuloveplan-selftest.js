// エステラブへ送る出勤の計画（src/lib/esulovePlan.ts）の自己点検（第79便）。
//
// ★★★ なぜ要るか
//   ここが「誰に・どの日・何時を送るか」を決める。★ 間違えると他人の欄に出勤が入る。
//   ★ しかも向こうを読まずに送ると、㉟ の「黙って2人」が全員ぶん起きる。
//   → 「送らない」と決める場面を、全部ここで固定する。
//
//   使い方:  npm run check:esuloveplan

const p = require(require('path').join(__dirname, '..', '_tmpcheck', 'esulovePlan.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const e = (castId, name) => ({ castId, name });
const T = (id, name) => ({ therapistId: id, name });
const S = (id, dateISO, start, end, active) =>
  ({ therapistId: id, dateISO, active: active !== false, start, end });

const ROSTER = [e('696449', 'さら'), e('696450', 'るい')];
const plan = (o) => p.planEsuloveWork(Object.assign({
  roster: ROSTER, therapists: [T(1, 'さら')], shifts: [],
}, o));

// ── ★★ 名簿が読めていないときは1件も送らない ──
{
  const r = plan({ roster: null, therapists: [T(1, 'さら'), T(2, 'るい')], shifts: [S(1, '2026-08-31', '20:00', '03:00')] });
  eq('★ 1件も送らない', r.rows.length, 0);
  eq('★ ok は false', r.ok, false);
  eq('全員が送れない扱い', r.blocked.length, 2);
  eq('理由は unknown', r.blocked[0].reason, 'unknown');
  eq('★ 「0件」ではなく「読み取れなかった」と言う',
    r.summary, 'エステラブの名簿を読み取れなかったため、1件も送っていません');
}

// ── ふつうに送れる ──
{
  const r = plan({ shifts: [S(1, '2026-08-31', '20:00', '03:00')] });
  eq('1枠送る', r.rows.length, 1);
  eq('castId は名簿から取る', r.rows[0].castId, '696449');
  eq('日と時刻', [r.rows[0].day, r.rows[0].start, r.rows[0].end], ['20260831', '2000', '2700']);
  // ★ 既存の出勤行のIDは推測で作らない
  eq('★ 既存IDは null のまま', r.rows[0].existingId, null);
  eq('ok', r.ok, true);
  // ★★ 片方向であることを必ず言う
  eq('★ お休みが残ることを言う', /お休みにした日はエステラブ側に残ります/.test(r.summary), true);
}

// ── ★★★ 向こうに居ない人は【登録しない】（§4・禁則269）──
{
  const r = plan({ therapists: [T(1, 'さら'), T(9, 'ひまり')], shifts: [
    S(1, '2026-08-31', '20:00', '03:00'), S(9, '2026-08-31', '20:00', '03:00'),
  ] });
  eq('居る人だけ送る', r.rows.length, 1);
  eq('居ない人は送らない', r.blocked.map(b => [b.name, b.reason]), [['ひまり', 'not_registered']]);
  eq('★ 自動登録していないと明言する',
    /自動登録はしていません/.test(r.blocked[0].message), true);
}

// ── ★★★ 同名が2人いる人は送らない（㉟ の形）──
{
  const dupRoster = [e('1', 'てすら'), e('2', 'てすら')];
  const r = plan({ roster: dupRoster, therapists: [T(1, 'てすら')], shifts: [S(1, '2026-08-31', '20:00', '03:00')] });
  eq('★ 送らない', r.rows.length, 0);
  eq('理由は ambiguous', r.blocked[0].reason, 'ambiguous');
  eq('人数を文に入れる', /2人登録されている/.test(r.blocked[0].message), true);
}

// ── 送れない人が居ても、送れる人は送る ──
{
  const dupRoster = [e('1', 'てすら'), e('2', 'てすら'), e('696449', 'さら')];
  const r = plan({ roster: dupRoster, therapists: [T(1, 'さら'), T(2, 'てすら')], shifts: [
    S(1, '2026-08-31', '20:00', '03:00'), S(2, '2026-08-31', '20:00', '03:00'),
  ] });
  eq('送れる人は送る', r.rows.length, 1);
  eq('送れない人も返す', r.blocked.length, 1);
  eq('内訳を1行で言う', /1人 \/ 1日ぶん（1枠）を送ります \/ ★ 1人は送りません/.test(r.summary), true);
}

// ── ★★ 休みは送らない（この版）──
{
  const r = plan({ shifts: [S(1, '2026-08-31', null, null, false), S(1, '2026-09-01', '20:00', '03:00')] });
  eq('休みの日は送らない', r.rows.length, 1);
  eq('送るのは出勤の日だけ', r.rows[0].day, '20260901');
}

// ── 時刻の寄せ・送れない枠は、誰のどの日かを言う ──
{
  const r = plan({ shifts: [S(1, '2026-08-31', '20:15', '02:45')] });
  eq('寄せて送る', [r.rows[0].start, r.rows[0].end], ['2030', '2630']);
  eq('★ 寄せたことを誰のどの日かで言う', r.notes[0], 'さら 2026-08-31（20:15〜26:45 → 20:30〜26:30）');
}
{
  const r = plan({ shifts: [S(1, '2026-08-31', '20:15', '20:30')] });
  eq('寄せると無くなる枠は送らない', r.rows.length, 0);
  eq('★ 送れなかった理由を残す', /さら 2026-08-31/.test(r.notes[0]), true);
}
{
  // ★ 範囲の外（翌6:30）は送らない
  const r = plan({ shifts: [S(1, '2026-08-31', '20:00', '06:30')] });
  eq('範囲の外は送らない', r.rows.length, 0);
  eq('★ 理由に範囲を書く', /6:00〜翌6:00/.test(r.notes[0]), true);
}

// ── 0件のときに「変更なし」と言わない ──
eq('相手も出勤も無ければ、そう言う', plan({ shifts: [] }).summary, 'エステラブへ送る出勤がありません');
eq('送れない人が居るときは、その数を言う',
  plan({ therapists: [T(9, 'ひまり')], shifts: [S(9, '2026-08-31', '20:00', '03:00')] }).summary,
  'エステラブへ送れる出勤がありません（1人は送れません）');

// ★ 使わない入力は受け取らない（渡せば効くと誤解されないため）
eq('★ planEsuloveWork は shopId を受け取らない',
  /shopId/.test(p.planEsuloveWork.toString().split(')')[0]), false);

// ── POST の形にする ──
{
  const r = plan({ shifts: [S(1, '2026-08-31', '20:00', '03:00')] });
  const body = p.esulovePlanBody(r, '37865');
  eq('項目が6つ', Object.keys(body).length, 6);
  eq('therapist_id が入る', body['TherapistSchedules[0][therapist_id]'], '696449');
  // ★ 送らないと決めた計画からは、中身を作らない
  eq('★ ok が false なら空', Object.keys(p.esulovePlanBody(plan({ roster: null, shifts: [] }), '37865')).length, 0);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
