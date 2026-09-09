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
  // ★ 実物の読み: 21:00〜24:00 は「24:00 の枠まで ○」（両端を含む）
  dayHtml(D[1], { start: '21:00', end: '24:00', values: { '21:00': '1', '21:30': '1', '22:00': '2', '22:30': '1', '23:00': '3', '23:30': '1', '24:00': '1' } }),
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
eq('period の値を読む', page.days[1].period.slice(2, 9).map((p) => p.value), ['1', '1', '2', '1', '3', '1', '1']);
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
  eq('★ 終了の枠（25:00）も ○（両端を含む・実物の読み）', r1.day.period[10].value, '1');
  eq('範囲の外（25:30〜）は 0', r1.day.period.slice(11).map((p) => p.value), ['0', '0']);
  eq('select も揃える', [r1.day.start, r1.day.end], ['20:00', '25:00']);
  eq('変わったと言う', r1.changed, true);
  const r2 = W.applyEsutamaShift(page, D[1], null);
  eq('出勤なしは全部 0・select 空', [r2.day.start, r2.day.end, r2.day.period.every((p) => p.value === '0')], ['', '', true]);
  const r3 = W.applyEsutamaShift(page, D[2], { startMin: 1200, endMin: 1500 });
  eq('お休みの日は触らない', [r3.ok, r3.reason], [false, 'day_off_on_media']);
  const r4 = W.applyEsutamaShift(page, '2026-09-20', null);
  eq('表に無い日は作らない', [r4.ok, r4.reason], [false, 'no_such_day']);
  const same = W.applyEsutamaShift(page, D[1], { startMin: 1260, endMin: 1440 });
  eq('同じ内容なら changed=false（21:00〜24:00 ＝ 24:00 の枠まで ○）', same.changed, false);
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
eq('飛び飛びは区間で並べる（終了は最後に ○ の枠）', W.esutamaDayLabel({ off: false, period: [{ label: '20:00', value: '1' }, { label: '20:30', value: '0' }, { label: '21:00', value: '1' }] }), '20:00〜20:00、21:00〜21:00');
eq('○ の数', W.countEsutamaWorking(page), 5);

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
  eq('適用: ○ の数 5 → 9（20:00〜25:00 は 20:00..25:00 の11枠。×/TEL の2枠は残す）', [ap.diff.workingBefore, ap.diff.workingAfter], [5, 9]);
  eq('適用: changed', ap.diff.changed, true);
  eq('適用: 元の page は触らない', page.days[1].start, '21:00');
  const again = L.applyEsutamaPerson(ap.page, plan.people[0]);
  eq('もう一度当てても変わらない（冪等）', again.diff.changed, false);
  const pay = W.buildEsutamaPayload(ap.page);
  eq('適用後の payload に 20:00=1', pay.find((f) => f[0] === 'column[2026-09-03][period][20:00]')[1], '1');
}

// ── ★★★ 第144便: ajax の口は「ブラウザのJSから呼ばれた形」で送る ──────────────
//   2026-09-04 21:04 の実測。即セラの ON を、ふつうのページ取得と同じヘッダで送ったら
//   **403** で断られた。★ 相手は ajax_* の口を、JSから呼ばれた形でしか受けない。
//   ★★ 「宛先は合っていた」と「相手が受け取ってくれる」は別。★ ここを混ぜて1便使った。
//   → ★ 宛先に 'ajax' が入る口を【全部】数えて、付け忘れが1つでもあれば落とす。
{
  const lower = (h) => {
    const o = {};
    for (const k of Object.keys(h || {})) o[k.toLowerCase()] = h[k];
    return o;
  };
  // ★ 組み立てる口を【全部】並べる。★ 新しい口を足したらここに足す
  const built = [
    ['ログインページ', R.buildEsutamaLoginPageRequest()],
    ['名簿', R.buildEsutamaRosterRequest('c=1')],
    ['出勤を読む', R.buildEsutamaWorkReadRequest('c=1', '757481')],
    ['出勤を書く', R.buildEsutamaWorkSaveRequest('c=1', '757481', [['cast_id', '757481'], ['brws_shop_id', '1'], ['ctk', 'x'.repeat(32)], ['column[2026-09-03][period][20:00]', '1']])],
    ['セラピスト管理', R.buildEsutamaTherapistAdminRequest('c=1')],
    ['入場券の発行', R.buildEsutamaCreateShopTokenRequest('c=1', '757481', 'x'.repeat(32))],
    ['写メ日記のページ', R.buildEsutamaDiaryPageRequest('c=1')],
    ['写メ日記を送る', R.buildEsutamaDiaryPostRequest('c=1', [['a', 'b']])],
    ['即セラのページ', R.buildEsutamaSokuseraPageRequest('c=1')],
    ['★ 即セラをONにする', R.buildEsutamaSokuseraStartRequest('c=1', 'message=%E3%81%82')],
    ['代理ログイン終了', R.buildEsutamaEndProxyRequest('c=1')],
  ];
  const ajax = built.filter(([, r]) => String(r.url).includes('ajax'));
  eq('★ ajax の口を1つ以上見ている（★ 数え漏らしの番人）', ajax.length >= 1, true);
  for (const [name, r] of ajax) {
    const h = lower(r.headers);
    eq('★★★ ' + name + ': x-requested-with が付いている', h['x-requested-with'], 'XMLHttpRequest');
    eq('★★ ' + name + ': origin が付いている', h['origin'], R.ESUTAMA_ORIGIN);
    eq('★ ' + name + ': referer が付いている', typeof h['referer'] === 'string' && h['referer'].length > 0, true);
  }
  // ★ 即セラの ON は、必ず即セラのページを referer にする
  const st = lower(R.buildEsutamaSokuseraStartRequest('c=1', 'message=').headers);
  eq('★ 即セラON の referer は即セラのページ', st['referer'], R.ESUTAMA_SOKUSERA_PAGE_URL);
  eq('★ 即セラON は cookie を持って行く', st['cookie'], 'c=1');
  // ★★★ OFF の宛先は【置かない】（★ 打たないと決めた。★ 置けばいつか誰かが呼ぶ）
  eq('★★★ OFF の宛先が生えていない', Object.keys(R).some((k) => /stop/i.test(k)), false);
}


// ───────────── ★★★ セラピスト設定（表示／非表示）第229便・2026-09-09 ─────────────
//
// ★ 2026-09-09 に実物で確かめた形（ラビリンス様の許可のもと・cast_id 955433 で往復）:
//     表示中 … <div class="item tg_block ">          中の <a data-post="cast_disabled" data-row="955433">
//     非表示 … <div class="item tg_block disabled">   中の <a data-post="cast_enable"   data-row="955433">
//                ＋ <span class="tag-disabled">非表示</span>
// ★★ data-row は【div ではなく中の <a>】に在る（esutamaParse.ts 冒頭の実物どおり）。
// ★★★ 状態は **class の disabled ただ1点**で決める。★ バッジや文言では決めない（文言は変わる）。
{
  // ★★★ 実物は <li>（2026-09-09・第232便で数え直した）。★ 第229便は <div> と書いていて、
  //   その決め打ちのせいで実弾のとき1件も読めなかった。★ だから **両方の形で点検する**。
  const castRow = (id, name, opts) => {
    const o = Object.assign({ disabled: false, editId: null, junk: '', tag: 'li' }, opts || {});
    const eid = o.editId === null ? id : o.editId;
    return '<' + o.tag + ' class="item tg_block ' + (o.disabled ? 'disabled' : '') + '">'
      + (o.disabled ? '<span class="tag-disabled">非表示</span>' : '')
      + '<a class="btn btn-warning card-btn1" href="/shop/labyrinth/cast/' + id + '/">' + name + '</a>'
      + '<a class="btn btn-success" href="/admin/cast_edit/' + eid + '/">編集</a>'
      + '<a class="send-easy_confirm_post" data-post="' + (o.disabled ? 'cast_enable' : 'cast_disabled')
      + '" data-row="' + id + '" data-confirm="' + name + 'を'
      + (o.disabled ? '表示' : '非表示') + 'にしますか？">' + (o.disabled ? '表示する' : '非表示') + '</a>'
      + '<a class="btn btn-danger send-post_delete" data-delete="cast,' + id + ',">削除</a>'
      + o.junk + '</' + o.tag + '>';
  };
  const castPage = (rows) => '<html><body><div class="list">' + rows.join('') + '</div>'
    + '<input type="hidden" name="ctk" id="csrf_footer" value="' + CSRF + '">'
    + '</body></html>';

  const a = P.parseEsutamaCastList(castPage([
    castRow('955433', 'てすと'),
    castRow('757480', 'さくら', { disabled: true }),
  ]));
  eq('★ セラピスト設定: 2人読める', a.rows.length, 2);
  eq('★ 表示中は disabled:false', a.rows[0], { castId: '955433', name: 'てすと', disabled: false });
  eq('★★ 非表示は disabled:true', a.rows[1], { castId: '757480', name: 'さくら', disabled: true });
  eq('★ 素直な形では警告が出ない', a.warnings, []);

  // ★★★ 文言・バッジでは決めない。★ 行の中に "disabled" の字が在っても、class に無ければ表示中
  const b = P.parseEsutamaCastList(castPage([
    castRow('955433', 'てすと', { junk: '<span class="tag-disabled">非表示</span>' }),
  ]));
  eq('★★★ 行の中の tag-disabled に釣られない（class で決める）', b.rows[0].disabled, false);

  // ★★ 番号が食い違う行は【使わない】（駅ちかの名簿と同じ作法）
  const c = P.parseEsutamaCastList(castPage([castRow('955433', 'てすと', { editId: '111111' })]));
  eq('★★ 編集リンクの番号と食い違う行は捨てる', c.rows.length, 0);
  eq('★ 捨てたことが警告に残る', c.warnings.length >= 1, true);

  // ★ 同じ番号が2回出てきたら1人ぶんだけ。★ 黙って2人にしない
  const d = P.parseEsutamaCastList(castPage([castRow('955433', 'てすと'), castRow('955433', 'てすと')]));
  eq('★ 同じ cast_id は1人ぶん', d.rows.length, 1);
  eq('★ 重なりが警告に残る', d.warnings.length >= 1, true);

  // ★★★ 読めなかったときに【空の名簿として通さない】。★ 空で通すと「誰も居ない」と誤って照合してしまう
  eq('★★★ 空の本文は警告つきで0人', P.parseEsutamaCastList('').warnings.length >= 1, true);
  const e = P.parseEsutamaCastList('<html><body>メンテナンス中</body></html>');
  eq('★★★ tg_block が1つも無ければ警告', e.warnings.length >= 1, true);
  eq('★★★ そのとき行は0件', e.rows.length, 0);

  // ★★★ タグ名で決め打ちしない（第232便の失敗）。★ li でも div でも同じに読めること
  {
    const li = P.parseEsutamaCastList(castPage([castRow('955433', 'てすと', { tag: 'li' })]));
    const dv = P.parseEsutamaCastList(castPage([castRow('955433', 'てすと', { tag: 'div' })]));
    eq('★★★ <li> で読める（★ 実物はこれ）', li.rows, [{ castId: '955433', name: 'てすと', disabled: false }]);
    eq('★★★ <div> でも同じに読める（★ タグ名を当てにしない）', dv.rows, li.rows);
    const mix = P.parseEsutamaCastList(castPage([
      castRow('955433', 'てすと', { tag: 'li' }),
      castRow('757480', 'さくら', { tag: 'div', disabled: true }),
    ]));
    eq('★★ 混ざっていても両方読める', mix.rows.length, 2);
    eq('★★ 混ざっていても非表示の判定は効く', mix.rows[1].disabled, true);
  }

  // ★ 使い捨てトークンは既存の読み手（#csrf_footer）でそのまま取れる
  eq('★ セラピスト設定から ctk が取れる', P.readEsutamaCsrf(castPage([castRow('955433', 'てすと')])), CSRF);

  // ── 送る形 ──────────────────────────────────────────
  const list = R.buildEsutamaCastListRequest('c=1');
  eq('★ セラピスト設定は GET（読むだけ）', list.method, 'GET');
  eq('★ セラピスト設定の宛先', list.url, 'https://estama.jp/admin/cast/');

  const low = (h) => { const o = {}; for (const k of Object.keys(h || {})) o[String(k).toLowerCase()] = h[k]; return o; };
  const hide = R.buildEsutamaCastDisableRequest('c=1', '955433', CSRF);
  eq('★★★ 非表示は POST', hide.method, 'POST');
  eq('★★★ 非表示の宛先は cast_disabled（★ enable ではない）', hide.url, 'https://estama.jp/admin_post/cast_disabled');
  eq('★★★ 中身は post_data と ctk の2つだけ', hide.body, 'post_data=955433&ctk=' + CSRF);
  eq('★★ ajax の印が付いている', low(hide.headers)['x-requested-with'], 'XMLHttpRequest');
  eq('★ referer はセラピスト設定', low(hide.headers)['referer'], R.ESUTAMA_CAST_LIST_URL);
  throws('★★ cookie が無ければ押さない', () => R.buildEsutamaCastDisableRequest('', '955433', CSRF), /Cookie/);
  throws('★★ 番号の形が違えば押さない', () => R.buildEsutamaCastDisableRequest('c=1', 'abc', CSRF), /cast_id/);
  throws('★★ ctk が無ければ押さない', () => R.buildEsutamaCastDisableRequest('c=1', '955433', ''), /ctk/);

  // ★★★ 「表示に戻す」宛先は【置かない】（第229便の決め）。★ 置けばいつか誰かが呼ぶ
  eq('★★★ cast_enable の宛先が生えていない',
     Object.keys(R).some((k) => /enable/i.test(k))
     || Object.values(R).some((v) => typeof v === 'string' && /cast_enable/.test(v)), false);
}


// ───────── ★★★ セラピストの追加フォーム（第231便・2026-09-09）─────────
//
// ★ 2026-09-09 に実物（https://estama.jp/admin/cast_edit/）を読んで確かめた形をなぞる。
//   ★ 実物は65部品。★ ここは形の種類（text / textarea / select / checkbox / file / hidden）を
//     ぜんぶ1つずつ含む縮小版。★ 大事なのは「何を落とし、何を残すか」。
{
  const TYPES = ['1', '2', '3', '28', '25', '9', '19', '20', '22', '26', '29', '31'];
  const castForm = (opt) => {
    const o = Object.assign({ castId: '0', ctk: CSRF, cupSelected: '秘密', name: '', setUpLimit: true, form: true }, opt || {});
    let h = '<html><body>';
    if (o.form) h += '<form method="POST">';
    h += '<input type="text" name="name" maxlength="10" value="' + o.name + '">';
    h += '<textarea name="description"></textarea>';
    h += '<textarea name="cast_pr">\nもとの文</textarea>';
    for (const t of TYPES) h += '<label><input type="checkbox" name="type[]" value="' + t + '"> ラベル</label>';
    h += '<input type="text" name="age" maxlength="2" value="">';
    h += '<input type="text" name="tall" maxlength="3" value="">';
    h += '<select name="body_style"><option value="0">未選択</option><option value="2">スレンダー</option><option value="3">普通</option></select>';
    h += '<input type="text" name="size_b" maxlength="3" value="">';
    h += '<input type="text" name="size_w" maxlength="3" value="">';
    h += '<input type="text" name="size_h" maxlength="3" value="">';
    h += '<select name="size_cup">' + ['秘密', 'A', 'B', 'C'].map((c) =>
      '<option value="' + c + '"' + (c === o.cupSelected ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
    h += '<select name="blood"><option value="秘密" selected>秘密</option><option value="A">A</option></select>';
    h += '<input type="text" name="twitter" maxlength="255" value="">';
    for (let i = 1; i <= 6; i++) {
      h += '<input type="file" id="cast_icon_' + i + '">';
      h += '<input type="hidden" name="order_cast_images[]" value="photo' + i + '">';
    }
    h += '<input type="hidden" name="cast_id" value="' + o.castId + '">';
    h += '<input type="hidden" name="ctk" value="' + o.ctk + '">';
    if (o.setUpLimit) h += '<input type="checkbox" name="set_up_limit" id="set_up_limit" value="cast">';
    if (o.form) h += '</form>';
    return h + '<input type="hidden" name="ctk" id="csrf_footer" value="' + o.ctk + '"></body></html>';
  };

  const f = P.parseEsutamaCastForm(castForm());
  const names = f.fields.map((x) => x.name);
  const val = (n) => f.fields.filter((x) => x.name === n).map((x) => x.value);

  eq('★ 追加フォーム: ctk が取れる', f.ctk, CSRF);
  eq('★★★ 追加フォーム: cast_id は 0（★ 0 が「新規」の印）', f.castIdHidden, '0');
  eq('★★ 追加フォーム: 実在する特徴タグを全部拾う', f.typeIds, TYPES);

  // ★★★ ここがこの読み手の一番大事なところ
  eq('★★★ set_up_limit は【送る形に入れない】（保存と同時に上位表示・残り回数を使う）',
     names.includes('set_up_limit'), false);
  eq('★★★ 外したことを言う（黙って落とさない）',
     f.skipped.some((x) => x.startsWith('set_up_limit')), true);
  eq('★★ 写真の欄（name の無い file）も外す', f.skipped.filter((x) => x.includes('file')).length, 6);

  eq('★★ 未チェックの特徴タグは送らない（ブラウザと同じ）', val('type[]'), []);
  eq('★ 写真の並び順の hidden は残す', val('order_cast_images[]'), ['photo1', 'photo2', 'photo3', 'photo4', 'photo5', 'photo6']);
  eq('★★ selected の無い select は【先頭】（ブラウザと同じ・空にしない）', val('body_style'), ['0']);
  eq('★ selected のある select はその値', val('size_cup'), ['秘密']);
  eq('★ 空の text も欄として残す（黙って落とさない）', val('age'), ['']);
  eq('★ textarea の中身を読む（先頭の改行は落とす）', val('cast_pr'), ['もとの文']);
  eq('★ 素直な形では警告が出ない', f.warnings, []);

  // ★★★ 読めなかったときに「空のフォーム」として通さない
  eq('★★★ form が無ければ警告つきで空', [P.parseEsutamaCastForm('<html>メンテナンス中</html>').fields.length,
      P.parseEsutamaCastForm('<html>メンテナンス中</html>').warnings.length >= 1], [0, true]);
  eq('★★★ 空の本文も警告つき', P.parseEsutamaCastForm('').warnings.length >= 1, true);

  // ── 送る形 ────────────────────────────────────────────
  const V = { name: 'さくら', typeIds: [1, 9, 22], age: '24', tall: '158', sizeB: '85', sizeW: '58', sizeH: '86', sizeCup: 'D', bodyStyle: '2' };
  const r = R.buildEsutamaCastCreateRequest('c=1', f, V);
  const pairs = r.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent));
  const got = (n) => pairs.filter(([k]) => k === n).map(([, v]) => v);

  eq('★★★ 登録は POST', r.method, 'POST');
  eq('★★★ 宛先はフォームと同じ場所', r.url, 'https://estama.jp/admin/cast_edit/');
  eq('★ 名前が入る', got('name'), ['さくら']);
  eq('★★ 特徴タグは選んだぶんだけ', got('type[]'), ['1', '9', '22']);
  eq('★ 年齢・身長・3サイズ・カップ・体型が入る',
     [got('age'), got('tall'), got('size_b'), got('size_w'), got('size_h'), got('size_cup'), got('body_style')],
     [['24'], ['158'], ['85'], ['58'], ['86'], ['D'], ['2']]);
  eq('★★ 触っていない欄は読んだまま', [got('blood'), got('cast_pr'), got('twitter')], [['秘密'], ['もとの文'], ['']]);
  eq('★★ 新規の印（cast_id=0）と ctk を持って行く', [got('cast_id'), got('ctk')], [['0'], [CSRF]]);
  eq('★ 写真の並び順もそのまま', got('order_cast_images[]').length, 6);
  eq('★★★ set_up_limit は送らない', got('set_up_limit'), []);

  // ── 止める条件（★ 迷ったら送らない）────────────────────
  const bad = (o) => Object.assign({}, V, o);
  throws('★★ cookie が無ければ登録しない', () => R.buildEsutamaCastCreateRequest('', f, V), /Cookie/);
  throws('★★★ 名前が空なら登録しない', () => R.buildEsutamaCastCreateRequest('c=1', f, bad({ name: '  ' })), /名前が空/);
  throws('★★★ 名前が11文字なら登録しない（相手は10文字以内）',
         () => R.buildEsutamaCastCreateRequest('c=1', f, bad({ name: 'あいうえおかきくけこさ' })), /10文字以内/);
  eq('★ 名前ちょうど10文字は通る',
     R.buildEsutamaCastCreateRequest('c=1', f, bad({ name: 'あいうえおかきくけこ' })).method, 'POST');
  throws('★★★ 特徴タグ0個なら登録しない（相手の必須）', () => R.buildEsutamaCastCreateRequest('c=1', f, bad({ typeIds: [] })), /1つも無い/);
  throws('★★★ 特徴タグ5個なら登録しない（相手は4つまで）',
         () => R.buildEsutamaCastCreateRequest('c=1', f, bad({ typeIds: [1, 2, 3, 9, 19] })), /4つまで/);
  throws('★★★ 画面に無い番号は送らない（★ 番号は通し番号ではない）',
         () => R.buildEsutamaCastCreateRequest('c=1', f, bad({ typeIds: [1, 99] })), /画面に無い/);
  throws('★★ 年齢が数字でなければ登録しない', () => R.buildEsutamaCastCreateRequest('c=1', f, bad({ age: '二十四' })), /年齢/);
  throws('★★ バストが4けたなら登録しない', () => R.buildEsutamaCastCreateRequest('c=1', f, bad({ sizeB: '1234' })), /バスト/);
  throws('★★★ ctk が無ければ登録しない',
         () => R.buildEsutamaCastCreateRequest('c=1', { fields: f.fields.filter((x) => x.name !== 'ctk'), typeIds: f.typeIds, castIdHidden: '0' }, V), /ctk/);
  throws('★★★ 既存の人の編集フォームには送らない（cast_id が 0 でない）',
         () => R.buildEsutamaCastCreateRequest('c=1', { fields: f.fields, typeIds: f.typeIds, castIdHidden: '955433' }, V), /新規の追加フォームではありません/);
  throws('★★★ set_up_limit が混じっていたら送らない（二重の見張り）',
         () => R.buildEsutamaCastCreateRequest('c=1',
           { fields: [...f.fields, { name: 'set_up_limit', value: 'cast' }], typeIds: f.typeIds, castIdHidden: '0' }, V), /set_up_limit/);

  // ── 追加フォームを読む GET ──
  const g = R.buildEsutamaCastFormRequest('c=1');
  eq('★ 追加フォームは GET（読むだけ）', [g.method, g.url], ['GET', 'https://estama.jp/admin/cast_edit/']);
  throws('★ cookie が無ければ読みに行かない', () => R.buildEsutamaCastFormRequest(''), /Cookie/);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
