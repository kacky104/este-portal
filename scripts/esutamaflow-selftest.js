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
const NOW = Date.parse('2026-09-02T03:00:00+09:00');   // ★ 6時前でも「今日」は 9/2（営業日ではなく暦の日。表の1日目は暦の今日）
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
const pageRemi = pageHtml('757480', [dayHtml(D[0]), dayHtml(D[1], { start: '21:00', end: '24:00', values: { '21:00': '1', '21:30': '1', '22:00': '1', '22:30': '1', '23:00': '1', '23:30': '1' } }), dayHtml(D[2])]);
const pageSara = pageHtml('757481', [dayHtml(D[0]), dayHtml(D[1], { start: '21:00', end: '24:00', values: { '21:00': '1', '21:30': '1', '22:00': '1', '22:30': '1', '23:00': '1', '23:30': '1' } }), dayHtml(D[2])]);
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
  // 止めるもの
  const wrong = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageSara }, ctxW, NOW);
  eq('④: 別の人の表なら止める', [wrong.kind, wrong.audits[0].detail.reason], ['stop', 'cast_mismatch']);
  const shifted = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, Object.assign({}, ctxW, { startedAt: '2026-09-03T12:00:00+09:00' }), Date.parse('2026-09-03T12:00:00+09:00'));
  eq('④: 1日目が今日と違えば止める', [shifted.kind, shifted.audits[0].detail.reason], ['stop', 'date_shifted']);
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
  // ⑤
  const s = F.afterEsutamaWorkSave({ status: 200, headers: {}, body: '["OK"]' }, r.next.context);
  eq('⑤: OK なら照合 GET を積む', [s.kind, s.next.purpose, s.next.url], ['next', 'esutama_work_verify', 'https://estama.jp/admin/schedule/757480/']);
  const err = F.afterEsutamaWorkSave({ status: 200, headers: {}, body: '["ERROR","だめ"]' }, r.next.context);
  eq('⑤: ERROR は止める', [err.kind, err.audits[0].event, err.audits[0].detail.reason], ['stop', 'write_work', 'rejected']);
  const rd = F.afterEsutamaWorkSave({ status: 200, headers: {}, body: '["REDIRECT","/login/"]' }, r.next.context);
  eq('⑤: REDIRECT はログイン切れ', rd.audits[0].detail.reason, 'back_to_login');
  // ⑥ 一致
  const after = pageHtml('757480', [dayHtml(D[0]), dayHtml(D[1], { start: '20:00', end: '25:00', values: Object.fromEntries(AXIS.slice(0, 10).map((l) => [l, '1'])) }), dayHtml(D[2])]);
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

// ── work_auto はまだ書かない（ESUTAMA_AUTO_WRITE_ENABLED=false のあいだ試し打ちと同じ）──
{
  eq('自動反映の旗はまだ倒れている', F.ESUTAMA_AUTO_WRITE_ENABLED, false);
  const a = F.afterEsutamaWorkRead({ status: 200, headers: {}, body: pageRemi }, Object.assign({}, ctxW, { intent: 'work_auto' }), NOW);
  eq('work_auto: 保存を積まず次の人へ（読んで記録するだけ）', [a.kind, a.next.purpose, a.audits.map((x) => x.event).join(',')], ['next', 'esutama_work_read', 'read_work,plan_work']);
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

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
