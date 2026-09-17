// エステ魂のプロフィール更新（src/lib/esutamaCastEdit.ts ＋ esutamaCastEditFlow.ts）の自己点検（第430便）。
//   使い方:  npm run check:esutamacastedit
const path = require('path');
const e = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaCastEdit.js'));
const f = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));
let fail = 0;
const eq = (name, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name); };

const CAST = '955513';
const TYPES = [['1', '新人'], ['2', '経験豊富'], ['9', '清楚系'], ['20', '美人系'], ['22', 'かわいい系'], ['23', '癒し系']];
function page(o) {
  const opt = Object.assign({ cast: CAST, age: '24', desc: 'よろしく', checked: ['1'], cup: 'C', blood: '', food: '', labelStyle: 'wrap' }, o || {});
  let h = '<html><body><form method="POST">';
  h += '<input type="hidden" name="cast_id" value="' + opt.cast + '"><input type="hidden" name="ctk" value="tok123">';
  h += '<input type="hidden" name="order_cast_images[]" value="a.jpg">';
  h += '<input type="text" name="name" value="るう" maxlength="10">';
  h += '<textarea name="description" maxlength="500">' + opt.desc + '</textarea><textarea name="cast_pr"></textarea>';
  for (const [id, label] of TYPES) {
    const chk = opt.checked.includes(id) ? ' checked' : '';
    if (opt.labelStyle === 'wrap') h += '<label><input type="checkbox" name="type[]" value="' + id + '"' + chk + '> ' + label + '</label>';
    else h += '<input type="checkbox" id="t' + id + '" name="type[]" value="' + id + '"' + chk + '><label for="t' + id + '">' + label + '</label>';
  }
  h += '<input type="text" name="experience" value=""><input type="text" name="qualified" value="">';
  h += '<input type="text" name="age" value="' + opt.age + '"><input type="text" name="tall" value="155">';
  h += '<select name="body_style"><option value="0">未選択</option><option value="2" selected>スレンダー</option><option value="3">普通</option></select>';
  h += '<input type="text" name="size_b" value="85"><input type="text" name="size_w" value="56"><input type="text" name="size_h" value="84">';
  h += '<select name="size_cup"><option value="">秘密</option>' + ['A', 'B', 'C', 'D', 'E'].map((c) => '<option value="' + c + '"' + (c === opt.cup ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
  h += '<select name="blood"><option value="0">秘密</option>' + ['A', 'B', 'O', 'AB'].map((c, i) => '<option value="' + (i + 1) + '"' + (c === opt.blood ? ' selected' : '') + '>' + c + '型</option>').join('') + '</select>';
  for (const n of ['forte_procedure', 'man_like_type', 'like_talent', 'holiday', 'vogue']) h += '<input type="text" name="' + n + '" value="">';
  h += '<input type="text" name="food" value="' + opt.food + '">';
  for (const n of ['blog', 'twitter', 'bluesky_url', 'instagram']) h += '<input type="text" name="' + n + '" value="">';
  h += '<input type="checkbox" name="set_up_limit" value="1" checked>';
  h += '</form></body></html>';
  return h;
}
const URL0 = 'https://estama.jp/admin/cast_edit/' + CAST + '/';

console.log('── 1. 読む ──');
const form = e.parseEsutamaCastEditForm(page(), URL0);
eq('特徴のラベル（label で包む形）', form.typeLabels, { '1': '新人', '2': '経験豊富', '9': '清楚系', '20': '美人系', '22': 'かわいい系', '23': '癒し系' });
eq('特徴のラベル（label for の形）', e.parseEsutamaCastEditForm(page({ labelStyle: 'for' }), URL0).typeLabels['20'], '美人系');
eq('★ set_up_limit は読んだ時点で無い', form.fields.some((x) => x.name === 'set_up_limit'), false);
eq('警告なし・cast_id・ctk', [form.warnings, form.castIdHidden, form.ctk], [[], CAST, 'tok123']);

console.log('── 2. 計画 ──');
const V = { age: '25', description: 'よろしく', castPr: 'はじめまして', types: ['清楚系', '美人系'], cup: 'D', blood: 'A', bodyStyle: '普通', answers: { food: 'いちご' }, sns: { instagram: 'https://instagram.com/x' }, bust: '', experience: '3' };
const plan = e.planEsutamaCastEdit(form, V);
eq('変わる欄', plan.changes.map((c) => c.label), ['年齢', 'カップ', '血液型', '体型', 'セラピストコメント', 'エステ歴', '好きな食べ物', 'Instagram', '特徴']);
eq('★ 名前はそのまま・order_cast_images[] もそのまま', [plan.pairs.find(([k]) => k === 'name')[1], plan.pairs.find(([k]) => k === 'order_cast_images[]')[1]], ['るう', 'a.jpg']);
eq('★ 特徴は差し替え', plan.pairs.filter(([k]) => k === 'type[]').map(([, v]) => v), ['9', '20']);
eq('★ 空の欄は今のまま（バスト85）', plan.pairs.find(([k]) => k === 'size_b')[1], '85');
eq('★ 同じ値は変わる欄にしない（ショップコメント）', plan.changes.some((c) => c.field === 'description'), false);
const p2 = e.planEsutamaCastEdit(form, { types: ['清楚系', 'ギャル系'], castPr: 'あ'.repeat(501), age: 'x' });
eq('★ 画面に無い特徴・上限超え・数字でない は送らない', p2.skipped, ['年齢（数字2けたまで）', 'セラピストコメント（500文字を超えている・501文字）', '特徴（エステ魂の画面に「ギャル系」が見つからない）']);
eq('★ そのとき特徴は今のまま', p2.pairs.filter(([k]) => k === 'type[]').map(([, v]) => v), ['1']);
eq('★ 特徴5つは送らない', e.planEsutamaCastEdit(form, { types: ['新人', '経験豊富', '清楚系', '美人系', '癒し系'] }).skipped, ['特徴（4つを超えている）']);

console.log('── 3. 本文の止め ──');
const body = e.buildEsutamaCastEditBody(form, CAST, plan);
eq('★ 本文に set_up_limit が無い・name はるう', [body.includes('set_up_limit'), body.includes('name=%E3%82%8B%E3%81%86')], [false, true]);
const thrown = (fn) => { try { fn(); return null; } catch (x) { return x.message.slice(0, 20); } };
eq('★ 別の人のフォーム', thrown(() => e.buildEsutamaCastEditBody(form, '111', plan)) !== null, true);
eq('★ 変わる欄なし', thrown(() => e.buildEsutamaCastEditBody(form, CAST, { pairs: plan.pairs, changes: [], skipped: [] })), '変わる欄が無いので送らない');

console.log('── 4. 照合 ──');
const after = e.parseEsutamaCastEditForm(page({ age: '25', checked: ['9', '20'], cup: 'D', blood: 'A' }), URL0);
const r = e.verifyEsutamaCastEdit(after, e.planEsutamaCastEdit(form, { age: '25', types: ['清楚系', '美人系'], cup: 'D', blood: 'A' }));
eq('★ 変わっていれば ok', [r.ok, r.ng], [4, []]);
eq('★ 年齢が戻っていたら ng', e.verifyEsutamaCastEdit(e.parseEsutamaCastEditForm(page({ age: '24' }), URL0), e.planEsutamaCastEdit(form, { age: '25' })).ng, ['年齢']);

console.log('── 5. 流れ ──');
const base = (o) => Object.assign({ v: f.RELAY_FLOW_VERSION, flowId: 'F1', intent: 'cast_edit', cookie: 'S=1', startedAt: '2026-09-17T00:00:00Z', castEditCastId: CAST, castEditName: 'るう', castEditValues: { age: '25', types: ['清楚系'] } }, o || {});
const run = (purpose, ctx, o) => f.advanceFlow(Object.assign({ purpose, status: 200, headers: {}, body: '', context: ctx }, o || {}));
const dry = run('esutama_edit_form', base(), { body: page() });
eq('★ 試し打ちは送らない', [dry.kind, dry.audits[0].outcome, dry.audits[0].detail.dryRun, dry.audits[0].detail.changes], ['done', 'stopped', true, 2]);
const ap = run('esutama_edit_form', base({ castEditApply: true }), { body: page() });
eq('★ apply は保存へ', [ap.kind, ap.next.purpose, ap.next.method, ap.next.url], ['next', 'esutama_edit_save', 'POST', URL0]);
const sv = run('esutama_edit_save', ap.next.context, { status: 302, headers: { location: '/admin/cast/' } });
eq('★ 保存のあと読み直す', [sv.next.purpose, sv.next.context.castEditStage], ['esutama_edit_form', 'verify']);
const ok = run('esutama_edit_form', sv.next.context, { body: page({ age: '25', checked: ['9'] }) });
eq('★ 照合 ok', [ok.kind, ok.audits[0].outcome], ['done', 'ok']);
const ng = run('esutama_edit_form', sv.next.context, { body: page({ age: '24', checked: ['9'] }) });
eq('★ 照合 ng', [ng.kind, ng.audits[0].outcome, ng.audits[0].detail.ng], ['stop', 'failed', '年齢']);
const none = run('esutama_edit_form', base({ castEditApply: true, castEditValues: { age: '24' } }), { body: page() });
eq('変わるところなし', [none.kind, none.audits[0].outcome], ['done', 'ok']);
const bounce = run('esutama_edit_form', base({ castEditApply: true }), { status: 307, headers: { location: '/admin/cast_edit/' } });
eq('★ 入口へ突き返されたら ?disabled=true で開き直す', [bounce.next.purpose, bounce.next.url], ['esutama_edit_form', URL0 + '?disabled=true']);
const other = run('esutama_edit_form', base({ castEditApply: true }), { body: page({ cast: '111' }) });
eq('★ 別の方のページなら止める', [other.kind, other.audits[0].detail.reason], ['stop', 'cast_mismatch']);
const q = run('esutama_edit_form', base({ castEditQueue: [{ castId: '222', name: 'さら', values: { age: '30' }, therapistId: 9 }] }), { body: page() });
eq('★ まとめて：次の人へ', [q.kind, q.next.purpose, q.next.context.castEditCastId, q.next.context.castEditQueue.length, q.next.context.castEditStage], ['next', 'esutama_edit_form', '222', 0, undefined]);
const login = run('esutama_edit_form', base({ castEditQueue: [{ castId: '222', name: 'さら', values: {} }] }), { body: '<form><input name="login_id"><input name="password"></form>' });
eq('★ ログイン切れは次へ進まない', [login.kind, login.audits[0].event], ['stop', 'login']);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
