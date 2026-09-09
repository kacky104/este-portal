// エステ魂の段（src/lib/esutamaFlow.ts）の自己点検（第109便）。
//   使い方:  npm run check:esutamaflow  （relayFlow.ts を tsc したあと）

const path = require('path');
const F = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaFlow.js'));
const RF = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w2 = JSON.stringify(want);
  if (g !== w2) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w2); fail++; }
  else console.log('ok ' + name);
};

const CSRF = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const AXIS = [];
for (let m = 20 * 60; m <= 26 * 60; m += 30) AXIS.push(Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'));
function dayHtml(date, opts) {
  const o = Object.assign({ start: '', end: '', values: {} }, opts || {});
  const sel = (name, vals, cur, first) => '<select name="' + name + '"><option value="">' + first + '</option>' +
    vals.map((v) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>';
  let h = sel('column[' + date + '][select][select_start]', AXIS, o.start, '出勤') + sel('column[' + date + '][select][select_end]', ['99:99'].concat(AXIS), o.end, '退勤');
  h += '<input type="checkbox" name="column[' + date + '][work_status]" value="2">';
  for (const lab of AXIS) {
    const v = o.values[lab] || '0';
    h += '<select name="column[' + date + '][period][' + lab + ']">' + ['0', '1', '2', '3', '99'].map((x) => '<option value="' + x + '"' + (x === v ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>';
  }
  return h;
}
function pageHtml(cast, days) {
  return '<html><body><form id="WorkScheduleForm">' + days.join('') +
    '<input type="hidden" name="brws_shop_id" value="12345"><input type="hidden" name="cast_id" value="' + cast + '"><input type="hidden" name="week" value="0"><input type="hidden" name="_check" value=""></form>' +
    '<input type="hidden" id="csrf_footer" value="' + CSRF + '"></body></html>';
}
const TODAY = '2026-09-02';
const D = ['2026-09-02', '2026-09-03', '2026-09-04'];
// ★★★ 第150便で直した前提（2026-09-05）。
//   ★ ここには「6時前でも今日は 9/2（営業日ではなく暦の日）」と書いてあった。★ 間違いだった。
//   ★★ 実測: エステ魂の表の1日目は【営業日】（午前6時始まり）。3時なら 9/1 になる。
//     → 平常の周を表す時刻として、6時より後（9時）に置き直した。
const NOW = Date.parse('2026-09-02T09:00:00+09:00');
const ctx0 = RF.newFlowContext({ flowId: 'f1', intent: 'work_dryrun', startedAt: '2026-09-02T12:00:00+09:00' });
const H = (extra) => Object.assign({ 'set-cookie': ['sid=abc; Path=/; HttpOnly'] }, extra || {});

// ── ① ログイン画面 ──
{
  const r = F.afterEsutamaLoginPage({ status: 200, headers: H(), body: '<input type="hidden" id="csrf_footer" value="' + CSRF + '">' }, ctx0);
  eq('①: login_needed を返す', [r.kind, r.csrf], ['esutama_login_needed', CSRF]);
  eq('①: Cookie を畳む', r.context.cookie, 'sid=abc');
  eq('①: 文脈に csrf', r.context.esutamaCsrf, CSRF);
  eq('①: まだ何も記録しない', r.audits, []);
  const bad = F.afterEsutamaLoginPage({ status: 200, headers: H(), body: '<html>no csrf</html>' }, ctx0);
  eq('①: csrf 無しは止める', [bad.kind, bad.audits[0].detail.reason], ['stop', 'csrf_missing']);
  eq('①: 5xx は止める', F.afterEsutamaLoginPage({ status: 503, headers: {}, body: '' }, ctx0).kind, 'stop');
}

// ── ② ログイン応答 ──
const ctxL = Object.assign({}, ctx0, { cookie: 'sid=abc', esutamaCsrf: CSRF });
{
  const r = F.afterEsutamaLogin({ status: 200, headers: { 'set-cookie': ['sid=login1; Path=/'] }, body: '["REDIRECT_OK","/admin/"]' }, ctxL);
  eq('②: 名簿 GET を積む', [r.kind, r.next.purpose, r.next.url], ['next', 'esutama_roster', 'https://estama.jp/admin/schedule/list/']);
  eq('②: Cookie を更新', r.next.context.cookie, 'sid=login1');
  eq('②: csrf は文脈から消す', r.next.context.esutamaCsrf, undefined);
  eq('②: 文脈にパスワードの項目が無い', Object.keys(r.next.context).some((k) => /pass|pw|login/i.test(k)), false);
  const out = F.afterEsutamaLogin({ status: 200, headers: {}, body: '["OUT",{"mail":"違います"}]' }, ctxL);
  eq('②: OUT は止める（文言は件数だけ）', [out.kind, out.audits[0].detail.reason, out.audits[0].detail.messages], ['stop', 'rejected', 1]);
  eq('②: OUT の summary に文言を入れない', /違います/.test(out.audits[0].summary), false);
  const html = F.afterEsutamaLogin({ status: 200, headers: {}, body: '<html>' }, ctxL);
  eq('②: HTML が返ったら止める', [html.kind, html.audits[0].detail.reason], ['stop', 'unexpected_response']);
  eq('②: 止めるときは先頭100文字を残す', html.audits[0].detail.bodyHead, '<html>');
  const ok = F.afterEsutamaLogin({ status: 200, headers: { 'set-cookie': ['sid=login2; Path=/'] }, body: '["OK","/admin/"]' }, ctxL);
  eq('②: ["OK", …] も成功として名簿へ（確証は名簿の段）', [ok.kind, ok.next.purpose], ['next', 'esutama_roster']);
}

// ── ③ 名簿 ──
const ctxR = Object.assign({}, ctx0, { cookie: 'sid=login1' });
const LIST = '<a href="/admin/schedule/757480/">れみ 本日の出勤：─</a><a href="/admin/schedule/757481/">さら 本日の出勤：─</a>';
{
  const r = F.afterEsutamaRoster({ status: 200, headers: {}, body: LIST }, ctxR);
  eq('③: esutama_roster', [r.kind, r.rows.length], ['esutama_roster', 2]);
  eq('③: ログインできた・名簿を読んだ の2件を記録', r.audits.map((a) => a.event + ':' + a.outcome), ['login:ok', 'read_girls:ok']);
  const back = F.afterEsutamaRoster({ status: 302, headers: { location: 'https://estama.jp/login/' }, body: '' }, ctxR);
  eq('③: ログイン画面へ戻されたら止める', [back.kind, back.audits[0].detail.reason], ['stop', 'back_to_login']);
  const empty = F.afterEsutamaRoster({ status: 200, headers: {}, body: '<html></html>' }, ctxR);
  eq('③: 0人は「読めなかった」', [empty.kind, empty.audits[0].detail.reason], ['stop', 'parse_empty']);
}

// ── ④ 出勤表（試し打ち） ──
const people = [
  { therapistId: 10, castId: '757480', name: 'れみ', days: [{ dateISO: D[0], range: null }, { dateISO: D[1], range: { startMin: 1200, endMin: 1500 } }, { dateISO: D[2], range: null }] },
  { therapistId: 11, castId: '757481', name: 'さら', days: [{ dateISO: D[1], range: { startMin: 1260, endMin: 1440 } }] },
];
const V2124 = { '21:00': '1', '21:30': '1', '22:00': '1', '22:30': '1', '23:00': '1', '23:30': '1', '24:00': '1' };   // ★ 24:00 の枠まで ○
const pageRemi = pageHtml('757480', [dayHtml(D[0]), dayHtml(D[1], { start: '21:00', end: '24:00', values: V2124 }), dayHtml(D[2])]);
const pageSara = pageHtml('757481', [dayHtml(D[0]), dayHtml(D[1], { start: '21:00', end: '24:00', values: V2124 }), dayHtml(D[2])]);
const ctxW = Object.assign({}, ctxR, { esutamaPeople: people, esutamaIndex: 0 });
{
  const r = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, ctxW, NOW);
  eq('④試し打ち: 次の人を積む（送らない）', [r.kind, r.next.purpose, r.next.url], ['next', 'esutama_work_read', 'https://estama.jp/admin/schedule/757481/']);
  eq('④試し打ち: read_work と plan_work を記録', r.audits.map((a) => a.event + ':' + a.outcome), ['read_work:ok', 'plan_work:stopped']);
  eq('④試し打ち: 変わる日を1行で', /2026-09-03 21:00〜24:00→20:00〜25:00/.test(r.audits[1].summary), true);
  eq('④試し打ち: 変更人数を数える', r.next.context.esutamaChanged, 1);
  eq('④試し打ち: index が進む', r.next.context.esutamaIndex, 1);
  const r2 = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageSara }, r.next.context, NOW);
  eq('④試し打ち: 2人目は変更なし → done', [r2.kind, r2.audits.map((a) => a.event).join(',')], ['done', 'read_work,plan_work,plan_work']);
  eq('④試し打ち: done のまとめ（2人確認・1人に変更）', /2人を確認、1人に変更/.test(r2.audits[2].summary), true);
  eq('④試し打ち: まとめは stopped（送っていない）', r2.audits[2].outcome, 'stopped');
  // ★★★ 第149便: 人ごとの行は【こちらの作業ログ】。記録には残すが、店舗様の画面には出さない。
  //   ★ 2026-09-04 23:00: 「確かめる」を1回押しただけで23人ぶん（46行）並び、
  //     押したご本人が「何か動き続けている」と不安になった。★ 異常ではない・送っていない。
  eq('★★★ 人ごとの読み取りに、たたむ印が付く', r.audits[0].detail.shopVisible, false);
  eq('★★★ 人ごとの下見にも、たたむ印が付く', r.audits[1].detail.shopVisible, false);
  // ★★★ まとめの1行には印を付けない。★ ここだけは必ず店舗様に出る
  eq('★★★ まとめの1行には印を付けない', r2.audits[2].detail.shopVisible, undefined);
  eq('★★★ まとめ以外は全部たたむ（試し打ち）',
     r2.audits.map((a) => a.detail.shopVisible === false), [true, true, false]);
  // ★★ 文言は店舗様の言葉で。★ 「組み立てました」はこちらの言葉
  eq('★★★ まとめは「確かめました」と書く', /エステ魂へ送る内容を確かめました/.test(r2.audits[2].summary), true);
  eq('★★★ まとめは「まだ送っていません」と断る', /まだ送っていません/.test(r2.audits[2].summary), true);
  eq('★★ まとめで「組み立て」と言わない', /組み立て/.test(r2.audits[2].summary), false);
  // ★★ 人ごとの中身は消えていない（開けば読める）
  eq('★★ たたんでも中身は残る', r.audits[0].detail.days > 0, true);
  // 止めるもの
  const wrong = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageSara }, ctxW, NOW);
  eq('④: 別の人の表なら止める', [wrong.kind, wrong.audits[0].detail.reason], ['stop', 'cast_mismatch']);
  const shifted = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, Object.assign({}, ctxW, { startedAt: '2026-09-03T12:00:00+09:00' }), Date.parse('2026-09-03T12:00:00+09:00'));
  eq('④: 1日目が今日と違えば止める', [shifted.kind, shifted.audits[0].detail.reason], ['stop', 'date_shifted']);
  // ★★★ 第112便: 【何日とずれたか】を残す。★ 残さないと、相手の切り替わり時刻を何度流しても絞れない
  eq('④: ★★★ ずれた日付を両方とも残す',
     [shifted.audits[0].detail.mediaFirstDate, shifted.audits[0].detail.fukuesToday],
     ['2026-09-02', '2026-09-03']);
  const back = F.afterEsutamaWorkRead({ status: 302, headers: { location: '/login/' }, body: '' }, ctxW, NOW);
  eq('④: ログイン切れは止める', [back.kind, back.audits[0].detail.reason], ['stop', 'back_to_login']);
}

// ── ④→⑤→⑥ 送信 ──
const ctxP = Object.assign({}, ctxW, { intent: 'work_push' });
{
  const r = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, ctxP, NOW);
  eq('④送信: 保存 POST を積む', [r.kind, r.next.purpose, r.next.method, r.next.url], ['next', 'esutama_work_save', 'POST', 'https://estama.jp/admin/schedule/post_work_schedule/']);
  eq('④送信: 本文に当てた値（20:00=1）', /column%5B2026-09-03%5D%5Bperiod%5D%5B20%3A00%5D=1/.test(r.next.body), true);
  eq('④送信: 本文の末尾は ctk', r.next.body.endsWith('&ctk=' + CSRF), true);
  eq('④送信: 照合の期待を文脈に', r.next.context.esutamaExpect, [{ dateISO: D[1], after: '20:00〜25:00' }]);
  eq('④送信: まだ write_work を記録しない', r.audits.map((a) => a.event), ['read_work']);
  // ★★ 送信の道でも、人ごとの読み取りは同じくたたむ（第149便）。★ まとめの write_work は出す
  eq('★★★ 送信でも人ごとの読み取りはたたむ', r.audits[0].detail.shopVisible, false);
  // ⑤
  const s = F.afterEsutamaWorkSave({ status: 200, headers: {}, body: '["OK"]' }, r.next.context);
  eq('⑤: OK なら照合 GET を積む', [s.kind, s.next.purpose, s.next.url], ['next', 'esutama_work_verify', 'https://estama.jp/admin/schedule/757480/']);
  const err = F.afterEsutamaWorkSave({ status: 200, headers: {}, body: '["ERROR","だめ"]' }, r.next.context);
  eq('⑤: ERROR は止める', [err.kind, err.audits[0].event, err.audits[0].detail.reason], ['stop', 'write_work', 'rejected']);
  const rd = F.afterEsutamaWorkSave({ status: 200, headers: {}, body: '["REDIRECT","/login/"]' }, r.next.context);
  eq('⑤: REDIRECT はログイン切れ', rd.audits[0].detail.reason, 'back_to_login');
  // ⑥ 一致
  const after = pageHtml('757480', [dayHtml(D[0]), dayHtml(D[1], { start: '20:00', end: '25:00', values: Object.fromEntries(AXIS.slice(0, 11).map((l) => [l, '1'])) }), dayHtml(D[2])]);
  const v = F.afterEsutamaWorkVerify({ status: 200, headers: {}, body: after }, s.next.context, NOW);
  eq('⑥: 一致 → verify_work ok → 次の人', [v.kind, v.audits[0].event + ':' + v.audits[0].outcome, v.next.purpose], ['next', 'verify_work:ok', 'esutama_work_read']);
  eq('⑥: 保存人数を数える', v.next.context.esutamaSaved, 1);
  eq('⑥: 期待は消す', v.next.context.esutamaExpect, undefined);
  // ⑥ 不一致
  const v2 = F.afterEsutamaWorkVerify({ status: 200, headers: {}, body: pageRemi }, s.next.context, NOW);
  eq('⑥: 不一致は止める（先の人へ進まない）', [v2.kind, v2.audits[0].event + ':' + v2.audits[0].outcome], ['stop', 'verify_work:failed']);
  // 最後の人まで
  const last = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageSara }, v.next.context, NOW);
  eq('送信: 変更なしの人は保存せず done', [last.kind, last.audits.map((a) => a.event + ':' + a.outcome).join(',')], ['done', 'read_work:ok,write_work:ok']);
  eq('送信: done のまとめ（1人ぶん反映・2人確認）', /1人ぶん 反映しました（2人を確認）/.test(last.audits[1].summary), true);
}

// ── 第110便: 店舗の画面に出す計画（diffs / 指紋）と、承認した内容との突き合わせ ──
{
  const ctxD = Object.assign({}, ctxW, { esutamaWindow: D, esutamaDiffs: [], esutamaBlocked: ['ねねさんは未登録'], esutamaNotes: [] });
  const r1 = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, ctxD, NOW);
  eq('計画: 変わるところを文脈に足す（dayIndex は窓の添え字）', r1.next.context.esutamaDiffs, [{ castId: '757480', name: 'れみ', dayIndex: 1, before: '21:00〜24:00', after: '20:00〜25:00' }]);
  const r2 = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageSara }, r1.next.context, NOW);
  eq('計画: 終わりに esutamaPlan を返す', [r2.kind, !!r2.esutamaPlan], ['done', true]);
  eq('計画: sendable（変更あり・送る相手あり）', r2.esutamaPlan.sendable, true);
  eq('計画: 指紋は castId:dayIndex:after', r2.esutamaPlan.fingerprint, '757480:1:20:00〜25:00');
  eq('計画: 送らない人の理由を持ち回る', r2.esutamaPlan.blocked, ['ねねさんは未登録']);
  eq('鍵: 順序に依らない', F.esutamaPersonKey([{ dayIndex: 3, after: 'b' }, { dayIndex: 1, after: 'a' }]), '1=a|3=b');
  eq('承認の形: media_work_plans.diff から castId → 鍵', F.esutamaApprovedFromDiff([{ girlId: '757480', dayIndex: 1, after: '20:00〜25:00' }]), { '757480': '1=20:00〜25:00' });

  // 承認どおり → 送る
  const okCtx = Object.assign({}, ctxD, { intent: 'work_push', esutamaApproved: { '757480': '1=20:00〜25:00' } });
  const p1 = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, okCtx, NOW);
  eq('承認どおりなら保存を積む', [p1.kind, p1.next.purpose], ['next', 'esutama_work_save']);
  // 承認と違う → その人は送らない・次へ
  const ngCtx = Object.assign({}, ctxD, { intent: 'work_push', esutamaApproved: { '757480': '1=20:00〜24:30' } });
  const p2 = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, ngCtx, NOW);
  eq('承認と違えば送らず次の人へ（plan_changed）', [p2.kind, p2.next.purpose, p2.audits[1].detail.reason], ['next', 'esutama_work_read', 'plan_changed']);
  eq('承認に無い人も送らない', F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, Object.assign({}, ngCtx, { esutamaApproved: {} }), NOW).audits[1].detail.reason, 'plan_changed');
  eq('運営の口（承認なし）は突き合わせない', F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, Object.assign({}, ctxD, { intent: 'work_push' }), NOW).next.purpose, 'esutama_work_save');
  // 照合が通った人の行は「残り」から外れる
  const s1 = F.afterEsutamaWorkSave({ status: 200, headers: {}, body: '["OK"]' }, p1.next.context);
  const after = pageHtml('757480', [dayHtml(D[0]), dayHtml(D[1], { start: '20:00', end: '25:00', values: Object.fromEntries(AXIS.slice(0, 11).map((l) => [l, '1'])) }), dayHtml(D[2])]);
  const v1 = F.afterEsutamaWorkVerify({ status: 200, headers: {}, body: after }, s1.next.context, NOW);
  eq('送れた人の行は残りから外す', v1.next.context.esutamaDiffs, []);
  const end = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageSara }, v1.next.context, NOW);
  eq('送ったあとの計画は「残り0・送れる=false」', [end.esutamaPlan.diffs.length, end.esutamaPlan.sendable, end.esutamaPlan.saved], [0, false, 1]);
}

// ── 第110便: work_auto は書く（旗 true）。ただし「その人の ○ が全部消える」書き換えは自動では送らない ──
{
  eq('自動反映の旗が立っている', F.ESUTAMA_AUTO_WRITE_ENABLED, true);
  const ctxA = Object.assign({}, ctxW, { intent: 'work_auto', esutamaWindow: D });
  const a = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, ctxA, NOW);
  eq('work_auto: ふつうの変更は保存を積む', [a.kind, a.next.purpose], ['next', 'esutama_work_save']);
  // れみ の計画を「全部なし」にする → 21:00〜24:00 が消える書き換え
  const clearPeople = [Object.assign({}, people[0], { days: [{ dateISO: D[0], range: null }, { dateISO: D[1], range: null }, { dateISO: D[2], range: null }] }), people[1]];
  const c = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, Object.assign({}, ctxA, { esutamaPeople: clearPeople }), NOW);
  eq('work_auto: ○ が全部消える人は送らず次へ（auto_would_clear）', [c.kind, c.next.purpose, c.audits[1].detail.reason], ['next', 'esutama_work_read', 'auto_would_clear']);
  const cp = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, Object.assign({}, ctxA, { intent: 'work_push', esutamaPeople: clearPeople }), NOW);
  eq('人が押す work_push なら全消しも送る', cp.next.purpose, 'esutama_work_save');
}

// ── advanceFlow から段へ届く ──
{
  const r = RF.advanceFlow({ purpose: 'esutama_login_page', status: 200, headers: H(), body: '<input id="csrf_footer" value="' + CSRF + '">', context: ctx0 });
  eq('advanceFlow: esutama_login_page が振り分けられる', r.kind, 'esutama_login_needed');
  const r2 = RF.advanceFlow({ purpose: 'esutama_roster', status: 200, headers: {}, body: LIST, context: ctxR });
  eq('advanceFlow: esutama_roster が振り分けられる', r2.kind, 'esutama_roster');
}

// ── 窓 ──
eq('窓は14日', F.esutamaWindowDates(TODAY).length, 14);
eq('窓の最後は13日後', F.esutamaWindowDates(TODAY)[13], '2026-09-15');
eq('今日（Asia/Tokyo）は startedAt から', F.esutamaTodayISO(ctx0), '2026-09-02');

// ── ★★★ エステ魂の1日は午前6時に始まる（第150便・実測で確定）──
// ★ 09/04 00:01〜05:01 の6回と 09/05 00:20 の計7回、相手の1日目 = こちらの今日 − 1日だった。
//   ★ 06:01 の周は1度も落ちていない。★ 境目は6時。
const at = (iso) => F.esutamaTodayISO(ctx0, Date.parse(iso));
eq('★★★ 0:00 は前の営業日', at('2026-09-05T00:00:00+09:00'), '2026-09-04');
eq('★★★ 実測の 0:20 は前の営業日', at('2026-09-05T00:20:00+09:00'), '2026-09-04');
eq('★★★ 実測の 5:01 は前の営業日', at('2026-09-04T05:01:00+09:00'), '2026-09-03');
eq('★★★ 5:59 はまだ前の営業日', at('2026-09-05T05:59:59+09:00'), '2026-09-04');
eq('★★★ 6:00 ちょうどで当日に変わる', at('2026-09-05T06:00:00+09:00'), '2026-09-05');
eq('★★ 実測の 6:01 は当日（落ちていない周）', at('2026-09-04T06:01:00+09:00'), '2026-09-04');
eq('★ 昼はそのまま当日', at('2026-09-05T12:00:00+09:00'), '2026-09-05');
eq('★ 23:59 もその日', at('2026-09-05T23:59:00+09:00'), '2026-09-05');
// ★★ 月またぎ・年またぎ（★ 日付の足し引きで転ぶ定番）
eq('★★★ 月またぎの深夜は前月末', at('2026-10-01T02:00:00+09:00'), '2026-09-30');
eq('★★★ 年またぎの深夜は前年末', at('2027-01-01T03:00:00+09:00'), '2026-12-31');
eq('★★ うるう日の翌深夜', at('2028-03-01T01:00:00+09:00'), '2028-02-29');
// ★★★ 窓も営業日から始まる（★ 深夜に「いま出勤中の日」を落とさない）
eq('★★★ 深夜の窓は前の営業日から', F.esutamaWindowDates(at('2026-09-05T00:20:00+09:00'))[0], '2026-09-04');


// ───────── ★★★ 非表示の段（第229便・2026-09-09）─────────
//
//   login → esutama_cast_list（状態＋ctk）→ esutama_cast_hide → esutama_cast_list（照合）
// ★★★ 見張りたいのは3つ:
//   ① 押す前に「居る・まだ表示中」を確かめること（居なければ・すでに非表示なら**押さない**）
//   ② 応答では成否を決めないこと（★ 必ず読み直して照合する）
//   ③ 照合で disabled が付いていなければ **失敗として残す**（黙って成功にしない）
{
  const castRow = (id, name, opts) => {
    const o = Object.assign({ disabled: false }, opts || {});
    return '<div class="item tg_block ' + (o.disabled ? 'disabled' : '') + '">'
      + (o.disabled ? '<span class="tag-disabled">非表示</span>' : '')
      + '<a href="/shop/labyrinth/cast/' + id + '/">' + name + '</a>'
      + '<a href="/admin/cast_edit/' + id + '/">編集</a>'
      + '<a class="send-easy_confirm_post" data-post="' + (o.disabled ? 'cast_enable' : 'cast_disabled')
      + '" data-row="' + id + '">' + (o.disabled ? '表示する' : '非表示') + '</a></div>';
  };
  const listPage = (rows, opts) => {
    const o = Object.assign({ ctk: true }, opts || {});
    return '<html><body>' + rows.join('')
      + (o.ctk ? '<input type="hidden" name="ctk" id="csrf_footer" value="' + CSRF + '">' : '')
      + '</body></html>';
  };
  const SHOWN = listPage([castRow('955433', 'てすと'), castRow('757480', 'さくら')]);
  const HIDDEN = listPage([castRow('955433', 'てすと', { disabled: true }), castRow('757480', 'さくら')]);
  const GONE = listPage([castRow('757480', 'さくら')]);
  const ctxH = Object.assign({}, ctx0, { intent: 'cast_hide', cookie: 'sid=abc', hideCastId: '955433' });
  const V = (extra) => Object.assign({}, ctxH, { hideStage: 'verify', hideName: 'てすと' }, extra || {});

  // ── ログインの直後は【セラピスト設定】へ（★ 出勤名簿は読まない）──
  {
    const r = F.afterEsutamaLogin({ status: 200, headers: { 'set-cookie': ['sid=login1; Path=/'] }, body: '["REDIRECT_OK","/admin/"]' },
      Object.assign({}, ctxH, { esutamaCsrf: CSRF }));
    eq('★★ 非表示: ログイン後はセラピスト設定を読む', [r.kind, r.next.purpose, r.next.method], ['next', 'esutama_cast_list', 'GET']);
    eq('★★★ 非表示: ログイン後に出勤名簿を読みに行かない', /schedule/.test(r.next.url), false);
  }

  // ── 1回目: 居て、まだ表示中 → 押しに行く ──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: SHOWN }, ctxH);
    eq('★ 非表示①: 押しに行く', [r.kind, r.next.purpose, r.next.method], ['next', 'esutama_cast_hide', 'POST']);
    eq('★★★ 非表示①: 送るのは post_data と ctk だけ', r.next.body, 'post_data=955433&ctk=' + CSRF);
    eq('★★ 非表示①: 次は照合の段', r.next.context.hideStage, 'verify');
    eq('★★ 非表示①: 誰を押すのか名前を持ち回す', r.next.context.hideName, 'てすと');
  }

  // ── 1回目: すでに非表示 → **押さない** ──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: HIDDEN }, ctxH);
    eq('★★★ 非表示①: すでに非表示なら押さない', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['done', 'stopped', 'already_hidden']);
    eq('★★★ そのとき次の手順は無い', r.next === undefined, true);
  }

  // ── 1回目: 一覧に居ない → **押さない**（★ 他人を押さないための安全装置）──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: GONE }, ctxH);
    eq('★★★ 非表示①: 居なければ押さない', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['done', 'stopped', 'not_listed']);
  }

  // ── 1回目: 相手が指定されていない → 何もしない ──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: SHOWN }, Object.assign({}, ctxH, { hideCastId: undefined }));
    eq('★★★ 非表示①: 相手が無ければ何もしない', [r.kind, r.audits[0].detail.reason], ['stop', 'no_cast_id']);
  }

  // ── 1回目: ctk が拾えない → 押さない ──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage([castRow('955433', 'てすと')], { ctk: false }) }, ctxH);
    eq('★★★ 非表示①: ctk が無ければ押さない', [r.kind, r.audits[0].detail.reason], ['stop', 'no_ctk']);
  }

  // ── 1回目: 読めない画面（作りが変わった）→ 空の名簿として通さない ──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: '<html>メンテナンス中</html>' }, ctxH);
    eq('★★★ 非表示①: 読めない画面を「0人」で通さない', [r.kind, r.audits[0].detail.reason], ['stop', 'parse_empty']);
  }
  {
    const r = F.afterEsutamaCastList({ status: 302, headers: { location: 'https://estama.jp/admin/login/' }, body: '' }, ctxH);
    eq('★★ 非表示①: ログイン画面へ戻されたら止める', [r.kind, r.audits[0].event], ['stop', 'login']);
  }

  // ── POST の応答: **成否を判定しない**。★ 読み直しへ ──
  {
    const r = F.afterEsutamaCastHide({ status: 200, headers: {}, body: '{"success":true}' }, V());
    eq('★★★ 非表示②: 応答では成否を決めず、読み直す', [r.kind, r.next.purpose, r.next.method], ['next', 'esutama_cast_list', 'GET']);
    eq('★★ 非表示②: 照合の段のまま', r.next.context.hideStage, 'verify');
    eq('★★ 非表示②: まだ「できました」と記録しない', r.audits, []);
  }
  {
    const r = F.afterEsutamaCastHide({ status: 500, headers: {}, body: '' }, V());
    eq('★★ 非表示②: 5xx は失敗として残す', [r.kind, r.audits[0].event, r.audits[0].outcome], ['stop', 'hide_cast', 'failed']);
  }

  // ── 3回目（照合）──────────────────────────────────
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: HIDDEN }, V());
    eq('★★★ 非表示③: disabled が付いていて初めて「できました」', [r.kind, r.audits[0].event, r.audits[0].outcome], ['done', 'hide_cast', 'ok']);
    eq('★ 非表示③: 誰を非表示にしたかが記録に残る', r.audits[0].detail.name, 'てすと');
  }
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: SHOWN }, V());
    eq('★★★ 非表示③: まだ表示中なら失敗として残す', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'failed', 'still_shown']);
  }
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: GONE }, V());
    eq('★★★ 非表示③: 一覧から消えていたら失敗として残す（消した可能性）', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'failed', 'gone']);
  }
}


// ───────── ★★★ 登録の段（第232便・2026-09-09）─────────
//
//   login → esutama_cast_list（もう居ないか＋顔ぶれ）→ esutama_cast_form → esutama_cast_create
//         → esutama_cast_list（照合＋cast_id 回収）
// ★★★ 見張りたいのは5つ:
//   ① 同じ名前がもう居たら**作らない**（二重掲載を自分で作らない）
//   ② 送る前に **いまの cast_id を全部控える**（増えた1人を番号の差で特定する）
//   ③ フォームは毎回読む。★ 組み立てが止めたら**送らない**
//   ④ 応答では成否を決めない。★ 読み直して照合する
//   ⑤ 増えていない／どれか決められない ときは **失敗として残す**（黙って成功にしない）
{
  const row = (id, name, opts) => {
    const o = Object.assign({ disabled: false }, opts || {});
    return '<div class="item tg_block ' + (o.disabled ? 'disabled' : '') + '">'
      + '<a href="/shop/labyrinth/cast/' + id + '/">' + name + '</a>'
      + '<a href="/admin/cast_edit/' + id + '/">編集</a>'
      + '<a class="send-easy_confirm_post" data-post="cast_disabled" data-row="' + id + '">非表示</a></div>';
  };
  const listPage = (rows, opt) => '<html><body>' + rows.join('')
    + ((opt && opt.ctk === false) ? '' : '<input type="hidden" name="ctk" id="csrf_footer" value="' + CSRF + '">')
    + '</body></html>';

  const TYPES = ['1', '2', '3', '9', '22', '26'];
  const formPage = (opt) => {
    const o = Object.assign({ castId: '0' }, opt || {});
    let h = '<html><body><form method="POST">';
    h += '<input type="text" name="name" maxlength="10" value="">';
    h += '<textarea name="description"></textarea>';
    for (const t of TYPES) h += '<input type="checkbox" name="type[]" value="' + t + '">';
    h += '<input type="text" name="age" value=""><input type="text" name="tall" value="">';
    h += '<input type="text" name="size_b" value=""><input type="text" name="size_w" value=""><input type="text" name="size_h" value="">';
    h += '<select name="size_cup"><option value="秘密" selected>秘密</option><option value="D">D</option></select>';
    h += '<input type="file" id="cast_icon_1"><input type="hidden" name="order_cast_images[]" value="photo1">';
    h += '<input type="hidden" name="cast_id" value="' + o.castId + '">';
    h += '<input type="hidden" name="ctk" value="' + CSRF + '">';
    h += '<input type="checkbox" name="set_up_limit" value="cast">';
    return h + '</form></body></html>';
  };

  const VALUES = { name: 'さくら', typeIds: [1, 9], age: '24', tall: '158', sizeB: '85', sizeW: '58', sizeH: '86', sizeCup: 'D', bodyStyle: null };
  const ctxC = Object.assign({}, ctx0, { intent: 'cast_create', cookie: 'sid=abc', createTherapistId: 601, createValues: VALUES });
  const OTHERS = [row('955433', 'てすと'), row('757480', 'みか')];

  // ── ログインの直後はセラピスト設定へ ──
  {
    const r = F.afterEsutamaLogin({ status: 200, headers: { 'set-cookie': ['sid=login1; Path=/'] }, body: '["REDIRECT_OK","/admin/"]' },
      Object.assign({}, ctxC, { esutamaCsrf: CSRF }));
    eq('★★ 登録: ログイン後はセラピスト設定を読む', [r.kind, r.next.purpose, r.next.method], ['next', 'esutama_cast_list', 'GET']);
  }

  // ── ①居ない → フォームを読みに行く。★ 顔ぶれを控える ──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage(OTHERS) }, ctxC);
    eq('★ 登録①: 追加フォームを読みに行く', [r.kind, r.next.purpose, r.next.method], ['next', 'esutama_cast_form', 'GET']);
    eq('★★★ 登録①: いまの cast_id を全部控える（増えた1人を見つける物差し）',
       r.next.context.createBeforeIds, ['955433', '757480']);
    eq('★★ 登録①: この段ではまだ1文字も送っていない', r.next.body, '');
  }

  // ── ①すでに同じ名前が居る → **作らない** ──
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage([...OTHERS, row('900001', 'さくら')]) }, ctxC);
    eq('★★★ 登録①: 同じ名前が居たら作らない', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['done', 'stopped', 'already_listed']);
    eq('★★ そのとき次の手順は無い', r.next === undefined, true);
    eq('★ その人の cast_id を記録に残す', r.audits[0].detail.castId, '900001');
  }
  {
    // ★★ 非表示の人も「居る」。★ 見えないからといって、もう1人作らない
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage([...OTHERS, row('900001', 'さくら', { disabled: true })]) }, ctxC);
    eq('★★★ 登録①: 非表示の人が居ても作らない（/admin/cast/ には非表示も載る）',
       [r.kind, r.audits[0].detail.reason, r.audits[0].detail.disabled], ['done', 'already_listed', true]);
  }
  {
    // ★ 読みが同じでも別の文字は別人（mediaMatch の決めごと）
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage([...OTHERS, row('900001', 'サクラ')]) }, ctxC);
    eq('★★ 登録①: 「サクラ」と「さくら」は別人として扱う（作りに行く）', r.next.purpose, 'esutama_cast_form');
  }
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage(OTHERS) }, Object.assign({}, ctxC, { createValues: undefined }));
    eq('★★★ 登録①: 送る相手が無ければ何もしない', [r.kind, r.audits[0].detail.reason], ['stop', 'no_name']);
  }
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage(OTHERS, { ctk: false }) }, ctxC);
    eq('★★ 登録①: ctk が拾えなければ進まない', [r.kind, r.audits[0].detail.reason], ['stop', 'no_ctk']);
  }

  // ── ②フォームを読んだ → 組み立てて送る ──
  const ctxF = Object.assign({}, ctxC, { createBeforeIds: ['955433', '757480'] });
  {
    const r = F.afterEsutamaCastForm({ status: 200, headers: {}, body: formPage() }, ctxF);
    eq('★★★ 登録②: 登録は POST', [r.kind, r.next.purpose, r.next.method], ['next', 'esutama_cast_create', 'POST']);
    const got = (n) => r.next.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)).filter(([k]) => k === n).map(([, v]) => v);
    eq('★ 登録②: 名前が入る', got('name'), ['さくら']);
    eq('★★ 登録②: 特徴タグが入る', got('type[]'), ['1', '9']);
    eq('★ 登録②: サイズが入る', [got('size_b'), got('size_cup'), got('age')], [['85'], ['D'], ['24']]);
    eq('★★★ 登録②: set_up_limit は送らない（保存と同時に上位表示・残り回数あり）', got('set_up_limit'), []);
    eq('★★ 登録②: 新規の印（cast_id=0）を持って行く', got('cast_id'), ['0']);
    eq('★★ 登録②: 照合の段へ進む', r.next.context.createStage, 'verify');
    eq('★★ 登録②: 控えた顔ぶれは持ち回す', r.next.context.createBeforeIds, ['955433', '757480']);
  }
  {
    // ★★★ 組み立てが止めたら送らない（★ 相手の画面に無い番号）
    const r = F.afterEsutamaCastForm({ status: 200, headers: {}, body: formPage() },
      Object.assign({}, ctxF, { createValues: Object.assign({}, VALUES, { typeIds: [1, 99] }) }));
    eq('★★★ 登録②: 画面に無い番号なら送らない', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'stopped', 'blocked']);
    eq('★★ 止めた理由をそのまま記録に残す（人が読んで直せるように）', /画面に無い/.test(r.audits[0].detail.note), true);
  }
  {
    const r = F.afterEsutamaCastForm({ status: 200, headers: {}, body: formPage({ castId: '955433' }) }, ctxF);
    eq('★★★ 登録②: 既存の人の編集フォームには送らない', [r.kind, r.audits[0].detail.reason], ['stop', 'blocked']);
  }
  {
    const r = F.afterEsutamaCastForm({ status: 200, headers: {}, body: '<html>メンテナンス中</html>' }, ctxF);
    eq('★★★ 登録②: フォームを読めなければ送らない', [r.kind, r.audits[0].detail.reason], ['stop', 'parse_failed']);
  }
  {
    const r = F.afterEsutamaCastForm({ status: 302, headers: { location: 'https://estama.jp/admin/login/' }, body: '' }, ctxF);
    eq('★★ 登録②: ログイン画面へ戻されたら止める', [r.kind, r.audits[0].event], ['stop', 'login']);
  }

  // ── ③POST の応答: 成否を決めず読み直す ──
  const ctxV = Object.assign({}, ctxF, { createStage: 'verify' });
  {
    const r = F.afterEsutamaCastCreate({ status: 200, headers: {}, body: 'ok' }, ctxV);
    eq('★★★ 登録③: 応答では成否を決めず、読み直す', [r.kind, r.next.purpose, r.next.method], ['next', 'esutama_cast_list', 'GET']);
    eq('★★ 登録③: まだ「できました」と記録しない', r.audits, []);
  }
  {
    const r = F.afterEsutamaCastCreate({ status: 500, headers: {}, body: '' }, ctxV);
    eq('★★ 登録③: 5xx は失敗として残す', [r.kind, r.audits[0].event, r.audits[0].outcome], ['stop', 'create_cast', 'failed']);
  }

  // ── ④照合 ──────────────────────────────────────────
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage([...OTHERS, row('900002', 'さくら')]) }, ctxV);
    eq('★★★ 登録④: 増えた1人を見つけて「できました」', [r.kind, r.audits[0].event, r.audits[0].outcome], ['done', 'create_cast', 'ok']);
    eq('★★★ 登録④: 回収した cast_id を返す（★ 表に書くのは呼び出し側）',
       r.esutamaCreated, { therapistId: 601, castId: '900002', name: 'さくら' });
  }
  {
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage(OTHERS) }, ctxV);
    eq('★★★ 登録④: 増えていなければ失敗として残す', [r.kind, r.audits[0].outcome, r.audits[0].detail.reason], ['stop', 'failed', 'not_created']);
  }
  {
    // ★★ 増えたのが2人。★ 名前で1人に絞れるなら、その人
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage([...OTHERS, row('900002', 'さくら'), row('900003', 'ゆい')]) }, ctxV);
    eq('★★ 登録④: 2人増えても名前で絞れれば通す', [r.kind, r.esutamaCreated.castId], ['done', '900002']);
  }
  {
    // ★★★ 増えたのが2人で、どちらも名前が違う → **決められない**。黙って選ばない
    const r = F.afterEsutamaCastList({ status: 200, headers: {}, body: listPage([...OTHERS, row('900002', 'あや'), row('900003', 'ゆい')]) }, ctxV);
    eq('★★★ 登録④: どれを登録したのか決められなければ止める', [r.kind, r.audits[0].detail.reason], ['stop', 'ambiguous']);
  }
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
