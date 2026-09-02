// エステ魂の部品（src/lib/esutama*.ts）の自己点検（第109便）。
//
// ★★★ なぜ要るか
//   エステ魂は「1人 × 14日分の丸ごと上書き」。読み違い・並び違いが、そのまま【出勤が消える】になる。
//   ★ 実物で見た形（設計メモ_エステ魂の出勤書き込み_2026-09-02）を、そのまま点検として固定する。
//
//   使い方:  npm run check:esutama

const path = require('path');
const P = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaParse.js'));
const W = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaWorkParse.js'));
const R = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaRequests.js'));
const K = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaWork.js'));
const L = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaPlan.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w2 = JSON.stringify(want);
  if (g !== w2) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w2); fail++; }
  else console.log('ok ' + name);
};
const throws = (name, fn, re) => {
  try { fn(); console.log('NG ' + name + '（例外にならなかった）'); fail++; }
  catch (e) { if (re && !re.test(e.message)) { console.log('NG ' + name + '（違う例外: ' + e.message + '）'); fail++; } else console.log('ok ' + name); }
};

// ── 実物に似せた出勤表（軸は短くしてある: 20:00〜26:00 の13枠。実物は 9:00〜30:00 の43枠）──
const AXIS = [];
for (let m = 20 * 60; m <= 26 * 60; m += 30) AXIS.push(Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'));
const CSRF = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
function dayHtml(date, opts) {
  const o = Object.assign({ start: '', end: '', off: false, values: {} }, opts || {});
  const sel = (name, vals, cur, first) => '<select name="' + name + '" class="sce_parent">' +
    '<option value="">' + first + '</option>' +
    vals.map((v) => '<option value="' + v + '"' + (v === cur ? ' selected="selected"' : '') + '>' + v + '</option>').join('') + '</select>';
  const endVals = ['99:99'].concat(AXIS);
  let h = '<div class="sce_day">';
  h += sel('column[' + date + '][select][select_start]', AXIS, o.start, '出勤');
  h += sel('column[' + date + '][select][select_end]', endVals, o.end, '退勤');
  h += '<label><input type="checkbox" name="column[' + date + '][work_status]" value="2"' + (o.off ? ' checked' : '') + '>お休み</label>';
  for (const lab of AXIS) {
    const v = o.values[lab] || '0';
    h += '<select name="column[' + date + '][period][' + lab + ']" class="sce_child a-selects">' +
      ['0', '1', '2', '3', '99'].map((x) => '<option value="' + x + '"' + (x === v ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>';
  }
  return h + '</div>';
}
function pageHtml(days, opts) {
  const o = Object.assign({ csrf: CSRF, shop: '12345', cast: '757480' }, opts || {});
  return '<html><body><div class="menu"><select name="dummy"><option value="x" selected>x</option></select></div>' +
    '<form id="WorkScheduleForm">' + days.join('') +
    '<input type="hidden" name="brws_shop_id" value="' + o.shop + '"><input type="hidden" name="cast_id" value="' + o.cast + '">' +
    '<input type="hidden" name="week" value="0"><input type="hidden" name="_check" value=""></form>' +
    '<a id="SendWorkSchedule" class="btn">出勤情報を保存する</a>' +
    (o.csrf ? '<input type="hidden" id="csrf_footer" value="' + o.csrf + '">' : '') + '</body></html>';
}
const D = ['2026-09-02', '2026-09-03', '2026-09-04'];
const html = pageHtml([
  dayHtml(D[0]),
  dayHtml(D[1], { start: '21:00', end: '24:00', values: { '21:00': '1', '21:30': '1', '22:00': '2', '22:30': '1', '23:00': '3', '23:30': '1' } }),
  dayHtml(D[2], { off: true }),
]);

// ── 読み取り ──
const page = W.parseEsutamaWorkPage(html);
eq('csrf を読む', page.csrf, CSRF);
eq('hidden を読む', [page.shopId, page.castId, page.week, page.check], ['12345', '757480', '0', '']);
eq('日を3つ読む', page.days.map((d) => d.date), D);
eq('軸は13枠', page.axis.length, 13);
eq('選択値（selected）を読む', [page.days[1].start, page.days[1].end], ['21:00', '24:00']);
eq('未選択は空', [page.days[0].start, page.days[0].end], ['', '']);
eq('period の値を読む', page.days[1].period.slice(2, 8).map((p) => p.value), ['1', '1', '2', '1', '3', '1']);
eq('お休み checkbox', [page.days[0].off, page.days[2].off], [false, true]);
eq('退勤の選択肢に 99:99 が入る', page.days[0].endOptions[0], '99:99');
eq('フォーム外の select を拾わない', page.days.every((d) => d.period.length === 13), true);
eq('検査を通る', W.checkEsutamaWorkPage(page), []);
eq('P.readEsutamaCsrf も同じ', P.readEsutamaCsrf(html), CSRF);
eq('csrf が無ければ null', P.readEsutamaCsrf(pageHtml([dayHtml(D[0])], { csrf: '' })), null);
eq('csrf が2つで値が違えば null', P.readEsutamaCsrf(html + '<input id="csrf_footer" value="Zz' + CSRF.slice(2) + '">'), null);
eq('空の本文は warnings', W.parseEsutamaWorkPage('').warnings, ['本文が空']);

// ── 検査が止めるもの ──
{
  const bad = W.parseEsutamaWorkPage(pageHtml([dayHtml(D[0]), dayHtml(D[2])]));
  eq('日付が飛んでいたら止める', W.checkEsutamaWorkPage(bad).some((p) => /連続していない/.test(p)), true);
  const noCsrf = W.parseEsutamaWorkPage(pageHtml([dayHtml(D[0])], { csrf: '' }));
  eq('csrf 無しは止める', W.checkEsutamaWorkPage(noCsrf).some((p) => /CSRF/.test(p)), true);
  const noCast = W.parseEsutamaWorkPage(pageHtml([dayHtml(D[0])], { cast: '' }));
  eq('cast_id 無しは止める', W.checkEsutamaWorkPage(noCast).some((p) => /cast_id/.test(p)), true);
  throws('assertEsutamaTodayIsIndex0: 今日とずれたら止める', () => W.assertEsutamaTodayIsIndex0(page, '2026-09-03'), /1日目/);
  W.assertEsutamaTodayIsIndex0(page, '2026-09-02'); console.log('ok assertEsutamaTodayIsIndex0: 一致なら通る');
}

// ── 時刻 ──
eq('9:00 → 540', W.esutamaLabelToMinutes('9:00'), 540);
eq('27:00 → 1620', W.esutamaLabelToMinutes('27:00'), 1620);
eq('1620 → "27:00"（前ゼロ無し）', W.esutamaMinutesToLabel(1620), '27:00');
eq('540 → "9:00"（前ゼロ無し）', W.esutamaMinutesToLabel(540), '9:00');
eq('読めない表記は null', W.esutamaLabelToMinutes('9時'), null);

// ── フクエスの出勤 → 範囲 ──
eq('20:00〜03:00 → 1200〜1620（翌3:00）', K.toEsutamaRange({ start: '20:00', end: '03:00' }).range, { startMin: 1200, endMin: 1620 });
eq('20:15〜02:50 は内側へ寄せる（20:30〜26:30）', K.toEsutamaRange({ start: '20:15', end: '02:50' }).range, { startMin: 1230, endMin: 1590 });
eq('寄せたことを note で言う', typeof K.toEsutamaRange({ start: '20:15', end: '02:50' }).snappedNote, 'string');
eq('寄せていなければ note は null', K.toEsutamaRange({ start: '20:00', end: '03:00' }).snappedNote, null);
eq('同じ時刻は断る', K.toEsutamaRange({ start: '20:00', end: '20:00' }).ok, false);
eq('24時超えの入力は断る（二重に +24 しない）', K.toEsutamaRange({ start: '25:00', end: '27:00' }).ok, false);

// ── 書き換え（2026-09-02 カッキーさん決定: 範囲の中の ×/TEL は残す・お休みは触らない）──
{
  // 9/3 は 21:00〜24:00（22:00 が ×、23:00 が TEL）。フクエス 20:00〜03:00（軸は 26:00 まで → 選べない）
  const r0 = W.applyEsutamaShift(page, D[1], { startMin: 1200, endMin: 1620 });
  eq('軸の外は送らない（27:00 は選べない）', [r0.ok, r0.reason], [false, 'outside_axis']);
  const r1 = W.applyEsutamaShift(page, D[1], { startMin: 1200, endMin: 1500 });
  eq('範囲の中で 0 → 1', r1.day.period.slice(0, 2).map((p) => p.value), ['1', '1']);
  eq('範囲の中の × / TEL は残す', [r1.day.period[4].value, r1.day.period[6].value], ['2', '3']);
  eq('範囲の外（25:00〜）は 0', r1.day.period.slice(10).map((p) => p.value), ['0', '0', '0']);
  eq('select も揃える', [r1.day.start, r1.day.end], ['20:00', '25:00']);
  eq('変わったと言う', r1.changed, true);
  const r2 = W.applyEsutamaShift(page, D[1], null);
  eq('出勤なしは全部 0・select 空', [r2.day.start, r2.day.end, r2.day.period.every((p) => p.value === '0')], ['', '', true]);
  const r3 = W.applyEsutamaShift(page, D[2], { startMin: 1200, endMin: 1500 });
  eq('お休みの日は触らない', [r3.ok, r3.reason], [false, 'day_off_on_media']);
  const r4 = W.applyEsutamaShift(page, '2026-09-20', null);
  eq('表に無い日は作らない', [r4.ok, r4.reason], [false, 'no_such_day']);
  const same = W.applyEsutamaShift(page, D[1], { startMin: 1260, endMin: 1440 });
  eq('同じ内容なら changed=false', same.changed, false);
  eq('元のページは触っていない', page.days[1].period[0].value, '0');
}

// ── 送る形 ──
{
  const fields = W.buildEsutamaPayload(page);
  const names = fields.map((f) => f[0]);
  eq('先頭は 1日目の select_start', names[0], 'column[2026-09-02][select][select_start]');
  eq('お休みの日は work_status=2 を送る', fields.some((f) => f[0] === 'column[2026-09-04][work_status]' && f[1] === '2'), true);
  eq('お休みの日の period は送らない', names.some((n) => n.startsWith('column[2026-09-04][period]')), false);
  eq('お休みでない日は work_status を送らない', names.some((n) => n === 'column[2026-09-03][work_status]'), false);
  eq('末尾は hidden → ctk', names.slice(-5), ['brws_shop_id', 'cast_id', 'week', '_check', 'ctk']);
  eq('ctk は csrf', fields[fields.length - 1][1], CSRF);
  eq('項目数 = 2日×(2+13) + 1日×(2+1) + 5', fields.length, 2 * 15 + 3 + 5);
  eq('period の値がそのまま', fields.find((f) => f[0] === 'column[2026-09-03][period][22:00]')[1], '2');
  throws('検査に落ちる表は組み立てない', () => W.buildEsutamaPayload(W.parseEsutamaWorkPage(pageHtml([dayHtml(D[0])], { csrf: '' }))), /送れる形でない/);
}

// ── 見せる形 ──
eq('○×TEL の範囲を1行に', W.esutamaDayLabel(page.days[1]), '21:00〜24:00');
eq('○ が無ければ ─', W.esutamaDayLabel(page.days[0]), '─');
eq('お休みは お休み', W.esutamaDayLabel(page.days[2]), 'お休み');
eq('飛び飛びは区間で並べる', W.esutamaDayLabel({ off: false, period: [{ label: '20:00', value: '1' }, { label: '20:30', value: '0' }, { label: '21:00', value: '1' }] }), '20:00〜20:30、21:00〜21:30');
eq('○ の数', W.countEsutamaWorking(page), 4);

// ── 名簿 ──
{
  const list = '<ul><li><a href="/admin/schedule/list/">セラピストの出勤設定</a></li>' +
    '<li><a href="/admin/schedule/757480/"><span class="nm">れみ</span> <span>本日の出勤：─</span> 次回出勤日：9月4日 (金) 20:00 ～ 25:00 <b>2件の出勤リクエストがあります</b></a></li>' +
    '<li><a href="/admin/schedule/757481/">さら 本日の出勤：─ 次回出勤日：未定</a></li>' +
    '<li><a href="/admin/schedule/757481/">さら 本日の出勤：─</a></li>' +
    '<li><a href="/admin/schedule/999/">（名前なし）</a></li></ul>';
  const r = P.parseEsutamaRoster(list);
  eq('名簿: 名前 → cast_id', r.rows, [{ castId: '757480', name: 'れみ' }, { castId: '757481', name: 'さら' }]);
  eq('名簿: 切り出せない行は warnings', r.warnings.length, 1);
  eq('名簿: 空なら warnings', P.parseEsutamaRoster('<html></html>').warnings.length, 1);
}

// ── JSON 応答 ──
eq('REDIRECT_OK', P.parseEsutamaJson('["REDIRECT_OK","/admin/"]'), { kind: 'redirect_ok', url: '/admin/' });
eq('OUT（項目ごとの文言）', P.parseEsutamaJson('["OUT",{"mail":"メールアドレスが違います","password":["必須"]}]'), { kind: 'out', messages: ['メールアドレスが違います', '必須'] });
eq('OK', P.parseEsutamaJson('["OK"]'), { kind: 'ok' });
eq('ERROR', P.parseEsutamaJson('["ERROR","保存できません"]'), { kind: 'error', text: '保存できません' });
eq('REDIRECT', P.parseEsutamaJson('["REDIRECT","/login/"]'), { kind: 'redirect', url: '/login/' });
eq('HTML が返ったら unknown（先頭を添える）', P.parseEsutamaJson('<html><title>ログイン</title>').kind, 'unknown');
eq('空は unknown', P.parseEsutamaJson('').kind, 'unknown');
eq('知らない札は unknown', P.parseEsutamaJson('["NG"]').kind, 'unknown');

// ── 要求 ──
{
  const lp = R.buildEsutamaLoginPageRequest();
  eq('ログイン画面 GET', [lp.method, lp.url], ['GET', 'https://estama.jp/login/']);
  const lg = R.buildEsutamaLoginRequest({ loginId: 'a@b.jp', password: 'p&w' }, CSRF, 'sid=1');
  eq('ログイン POST の宛先', [lg.method, lg.url], ['POST', 'https://estama.jp/post/login_shop/']);
  eq('ログイン本文は str[n][name]/[value] の並び ＋ ctk', decodeURIComponent(lg.body),
    'str[0][name]=mail&str[0][value]=a@b.jp&str[1][name]=password&str[1][value]=p&w&str[2][name]=r&str[2][value]=&ctk=' + CSRF);
  eq('& は符号化される', /value%5D=p%26w/.test(lg.body), true);
  eq('ajax の見た目（x-requested-with / referer / cookie）', [lg.headers['x-requested-with'], lg.headers.referer, lg.headers.cookie], ['XMLHttpRequest', 'https://estama.jp/login/', 'sid=1']);
  throws('csrf 無しでログインを組まない', () => R.buildEsutamaLoginRequest({ loginId: 'a', password: 'b' }, '', ''), /CSRF/);
  throws('空の ID/PW は組まない', () => R.buildEsutamaLoginRequest({ loginId: '', password: 'b' }, CSRF, ''), /どちらかが空/);
  eq('名簿 GET', R.buildEsutamaRosterRequest('sid=1').url, 'https://estama.jp/admin/schedule/list/');
  throws('Cookie 無しで名簿を読まない', () => R.buildEsutamaRosterRequest(''), /Cookie/);
  eq('出勤表 GET', R.buildEsutamaWorkReadRequest('sid=1', '757480').url, 'https://estama.jp/admin/schedule/757480/');
  throws('cast_id の形が違えば URL を組まない', () => R.esutamaWorkPageUrl('../admin'), /cast_id/);
  const fields = W.buildEsutamaPayload(page);
  const sv = R.buildEsutamaWorkSaveRequest('sid=1', '757480', fields);
  eq('保存 POST の宛先', [sv.method, sv.url], ['POST', 'https://estama.jp/admin/schedule/post_work_schedule/']);
  eq('保存の referer は本人の出勤表', sv.headers.referer, 'https://estama.jp/admin/schedule/757480/');
  eq('保存本文の末尾は ctk', sv.body.endsWith('&ctk=' + CSRF), true);
  throws('読んだ cast_id と送り先が違えば組まない', () => R.buildEsutamaWorkSaveRequest('sid=1', '757481', fields), /一致しません/);
  throws('period の無い表は送らない', () => R.buildEsutamaWorkSaveRequest('sid=1', '757480', [['cast_id', '757480'], ['brws_shop_id', '1'], ['ctk', CSRF]]), /period/);
  eq('宛先はすべて estama.jp', [lp, lg, sv].every((r) => new URL(r.url).hostname === 'estama.jp'), true);
}

// ── 計画 ──
{
  const roster = [{ castId: '757480', name: 'れみ' }, { castId: '757481', name: 'さら' }, { castId: '1', name: 'みお' }, { castId: '2', name: 'みお' }];
  const therapists = [{ therapistId: 10, name: 'れみ' }, { therapistId: 11, name: 'さら' }, { therapistId: 12, name: 'みお' }, { therapistId: 13, name: 'ねね' }];
  const shifts = [
    { therapistId: 10, dateISO: D[1], active: true, start: '20:00', end: '01:00' },
    { therapistId: 10, dateISO: D[2], active: false, start: null, end: null },
    { therapistId: 10, dateISO: '2026-10-01', active: true, start: '20:00', end: '01:00' },   // 窓の外
    { therapistId: 12, dateISO: D[1], active: true, start: '20:00', end: '01:00' },
  ];
  const plan = L.planEsutamaWork({ roster, therapists, shifts, windowDates: D });
  eq('計画: 送るのは れみ だけ', plan.people.map((p) => p.name), ['れみ']);
  eq('計画: れみ の3日（なし／出勤／なし）', plan.people[0].days.map((d) => d.range ? d.range.startMin + '-' + d.range.endMin : null), [null, '1200-1500', null]);
  eq('計画: 窓の外は入れない', plan.people[0].days.length, 3);
  eq('計画: 止めた理由', plan.blocked.map((b) => b.name + ':' + b.reason).sort(), ['さら:no_fukues_rows', 'ねね:not_registered', 'みお:ambiguous']);
  eq('計画: ok', plan.ok, true);
  eq('計画: summary に人数', /1人/.test(plan.summary), true);
  const none = L.planEsutamaWork({ roster: null, therapists, shifts, windowDates: D });
  eq('名簿が読めていなければ全員 unknown・送らない', [none.ok, none.blocked.every((b) => b.reason === 'unknown')], [false, true]);
  eq('名簿が空（0人）は unknown と混ぜない', L.planEsutamaWork({ roster: [], therapists, shifts, windowDates: D }).blocked.every((b) => b.reason === 'not_registered'), true);

  // 結び（therapist_media_ids）があれば名前で探さない
  const linked = L.planEsutamaWork({ roster, therapists, shifts, windowDates: D, links: [{ therapistId: 12, castId: '2' }, { therapistId: 13, castId: '777' }] });
  eq('結び: 同名2人でも結んだ番号を使う', linked.people.map((p) => p.name + ':' + p.castId).sort(), ['みお:2', 'れみ:757480']);
  eq('結び: 名簿に無い番号は送らない', linked.blocked.find((b) => b.therapistId === 13).reason, 'not_registered');
  eq('結び: 結んでいない人は名前で探す（さら は出勤なし）', linked.blocked.find((b) => b.therapistId === 11).reason, 'no_fukues_rows');

  // 適用（れみ のページ = 上の page）
  const ap = L.applyEsutamaPerson(page, plan.people[0]);
  eq('適用: 9/3 が 21:00〜24:00 → 20:00〜25:00', ap.diff.changes, [{ dateISO: D[1], before: '21:00〜24:00', after: '20:00〜25:00' }]);
  eq('適用: お休みの 9/4 は skipped', ap.diff.skipped.map((s) => s.reason), ['day_off_on_media']);
  eq('適用: ○ の数 4 → 8', [ap.diff.workingBefore, ap.diff.workingAfter], [4, 8]);
  eq('適用: changed', ap.diff.changed, true);
  eq('適用: 元の page は触らない', page.days[1].start, '21:00');
  const again = L.applyEsutamaPerson(ap.page, plan.people[0]);
  eq('もう一度当てても変わらない（冪等）', again.diff.changed, false);
  const pay = W.buildEsutamaPayload(ap.page);
  eq('適用後の payload に 20:00=1', pay.find((f) => f[0] === 'column[2026-09-03][period][20:00]')[1], '1');
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
