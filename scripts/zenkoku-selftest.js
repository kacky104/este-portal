// 全国エステランキング（src/lib/zenkokuParse.ts）の自己点検（第1769便・2026-11-07）。
//
// ★ この点検の芯
//   ① 画面の読み取り（ログインの隠し値・セラピスト一覧・1日の出勤）が、実物（11/7 オイルクエスト様の管理画面）と同じ形で読める
//   ② 保存の中身は【全員ぶん】を読んだとおり送り返し、変える人だけ差し替える（フクエスに居ない人を消さない）
//   ③ 時刻の寄せ（30分刻み・6:00〜翌5:30）
//
//   使い方:  npm run check:zenkoku

const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'zenkokuParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ログイン画面 ──');
const loginHtml = '<form method="get" action="/find/"><input type="text" name="q"></form>' +
  '<form method="post" accept-charset="utf-8" action="/login/"><div style="display:none;"><input type="hidden" name="_method" value="POST"/>' +
  '<input type="hidden" name="_csrfToken" autocomplete="off" value="abc123"/></div>' +
  '<input type="text" name="loginname"><input type="password" name="password">' +
  '<div style="display:none;"><input type="hidden" name="_Token[fields]" autocomplete="off" value="f%3A1"/><input type="hidden" name="_Token[unlocked]" autocomplete="off" value=""/></div></form>';
eq('隠し値3つ', m.readZenkokuLoginForm(loginHtml), { csrfToken: 'abc123', tokenFields: 'f%3A1', tokenUnlocked: '' });
eq('ログイン画面と分かる', m.looksLikeZenkokuLoginPage(loginHtml), true);
eq('★ 隠し値が欠けたら null', m.readZenkokuLoginForm(loginHtml.replace('_csrfToken', '_x')), null);

console.log('── 2. セラピスト一覧 ──');
const girlRow = (gid, name, hide) =>
  '<tr class="tr-horizontal-full-check-disable girl-tr' + (hide ? ' gi-hide' : '') + '" data-girl-id="' + gid + '">' +
  '<td>1</td><td><label><input type="checkbox" name="ads[]" value="' + gid + '"><span></span></label></td>' +
  '<td><img class="lazy" data-nickname="' + name + '"></td><td>' + name + '</td>' +
  '<td><a class="btn btn-primary girl-edit" href="/shop/image/girl/upload/detail/' + gid + '/">編集</a></td>' +
  '<td class="delete-multi-cell"><input type="checkbox" name="delete_multi[]" value="' + gid + '" data-checked="0" data-name="' + name + '"></td></tr>';
const list = m.parseZenkokuGirlList('<table>' + girlRow(1805066, 'みみ', false) + girlRow(1457279, 'ゆな &amp; り', true) + '</table>');
eq('2名・名前と非公開', list.rows, [{ gid: '1805066', name: 'みみ', hidden: false }, { gid: '1457279', name: 'ゆな & り', hidden: true }]);

console.log('── 3. 1日の出勤 ──');
const opt = (v, sel) => '<option value="' + v + '"' + (sel ? ' selected="selected"' : '') + '>' + v + '</option>';
const times = ['06:00', '09:30', '0', '10:00', '13:00', '15:30', '22:00', '00:00', '05:30'];
const sel = (name, v) => '<select name="' + name + '" class="form-control">' + times.map((t) => opt(t, t === v)).join('') + '</select>';
const dayRow = (gid, name, id, s, e, notSet) =>
  '<tr data-girl-id="' + gid + '" class="tr-admin-linkcheck"><td><input type="hidden" name="' + gid + '[id]" value="' + id + '"/></td>' +
  '<td><div><img class="lazy"><span>' + name + '</span></div></td>' +
  '<td><span class="badge">x</span><div class="input checkbox"><input type="hidden" name="' + gid + '[delete_flag]" value="0"/><label><input type="checkbox" name="' + gid + '[delete_flag]" value="1"></label></div></td>' +
  '<td><input type="hidden" name="' + gid + '[is_time_not_set]" value="0"/><input type="checkbox" name="' + gid + '[is_time_not_set]" value="1"' + (notSet ? ' checked="checked"' : '') + '></td>' +
  '<td>' + sel(gid + '[start_work]', s) + '</td><td>' + sel(gid + '[end_work]', e) + '</td>' +
  '<input type="hidden" name="' + gid + '" value=""/></tr>';
const dayHtml = '<form method="get" action="/find/"></form><form method="post" action="/shop/schedule/2026-11-08/">' +
  '<input type="hidden" name="_method" value="POST"/><input type="hidden" name="user_id" value="bb77-uuid"/><table>' +
  dayRow(1, 'みみ', '0', '0', '0', false) + dayRow(2, 'あんな', '67588867', '10:00', '15:30', false) + dayRow(3, 'ゆゆ', '555', '13:00', '22:00', true) +
  '</table></form>';
const p = m.parseZenkokuDayPage(dayHtml, '2026-11-08');
eq('3行・user_id', [p.page.userId, p.page.rows.length], ['bb77-uuid', 3]);
eq('出勤なし・出勤・未定の見え方', p.page.rows.map(m.zenkokuCellLabel), ['─', '10:00-15:30', '未定']);
eq('★ ログイン画面が返ったら login_page', m.parseZenkokuDayPage(loginHtml, '2026-11-08'), { error: 'login_page' });
eq('★ 別の日の画面は読まない', m.parseZenkokuDayPage(dayHtml, '2026-11-09'), { error: 'form_missing' });

console.log('── 4. 計画と保存の中身 ──');
const plan = m.planZenkokuDay(p.page, { '1': '13:00-22:00', '2': '─', '9': '10:00-15:30' });
eq('みみ=出勤に・あんな=解除・居ない人は missing', [plan.changes.map((c) => c.gid + ':' + c.before + '>' + c.after), plan.missing], [['1:─>13:00-22:00', '2:10:00-15:30>─'], ['9']]);
eq('★ 同じなら変えない', m.planZenkokuDay(p.page, { '2': '10:00-15:30' }).changes.length, 0);
eq('★ 自動の守り（消すだけは止める）', m.planZenkokuDay(p.page, { '2': '─' }, { holdClears: true }).held, 1);
const body = m.buildZenkokuDayPayload(p.page, plan.changes).body;
const q = new URLSearchParams(body);
eq('_method・user_id', [q.get('_method'), q.get('user_id')], ['POST', 'bb77-uuid']);
eq('みみ: 13:00〜22:00', [q.getAll('1[start_work]'), q.getAll('1[end_work]'), q.getAll('1[delete_flag]')], [['13:00'], ['22:00'], ['0']]);
eq('あんな: 出勤解除にチェック（時刻はそのまま）', [q.getAll('2[delete_flag]'), q.getAll('2[start_work]')], [['0', '1'], ['10:00']]);
// ★ 第1866便: 相手の画面と同じく【変える人の行だけ】送る（変えない行・行の印 "<番号>" は送らない。全員ぶん送ると 500）
eq('★★ ゆゆ（計画に無い）: 送らない', [q.getAll('3[id]'), q.getAll('3[start_work]')], [[], []]);
eq('★ 変える人の行だけ入っている', [q.has('1[id]'), q.has('2[id]'), q.has('3[id]')], [true, true, false]);
eq('★ 行の印（"<番号>"）は送らない', [q.has('1'), q.has('2'), q.has('3')], [false, false, false]);

console.log('── 5. 時刻 ──');
eq('20:00〜03:00', m.toZenkokuRange('20:00', '03:00'), { ok: true, label: '20:00-03:00', note: null });
eq('★ 30分へ内側に寄せる', m.toZenkokuRange('10:15', '15:45').ok && m.toZenkokuRange('10:15', '15:45').label, '10:30-15:30');
eq('★ 翌5:30より後は送らない', m.toZenkokuRange('20:00', '06:00').ok, false);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
