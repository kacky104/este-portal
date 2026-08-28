// src/lib/relayFlow.ts のテスト（第41便）。
//
//   node --test tools-test-relay-flow.mjs
//
// ★★★ ここで見張っているのは1つ。
//   **「ログインできたつもり」を作らないこと。**
//   駅ちかのログインは失敗時の応答の形が実機で未確認なので、
//   成否は【次の段が読めたかどうか】で決めている（relayFlow.ts 冒頭）。
//   その判定が、どの失敗の形でも同じ結論になることを固定する。
//
// ★ .mjs にしてあるのは tsconfig の対象から外して `next build` に混ぜないため。

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { register } from 'node:module';

// ★ relayFlow.ts → relayJob.ts → mediaCredentials.ts と拡張子なしで辿るので解決フックが要る
register('./tools-ts-resolve.mjs', import.meta.url);
process.env.MEDIA_CRED_KEY = crypto.randomBytes(32).toString('base64');

const F = await import('./src/lib/relayFlow.ts');
const A = await import('./src/lib/mediaAudit.ts');

// ── 出勤ページの fixture（tools-test-ekichika-work.mjs と同じ形）──────────────

const DATES = ['08/27(木)', '08/28(金)', '08/29(土)', '08/30(日)', '08/31(月)', '09/01(火)', '09/02(水)'];

function header(counts) {
  const dls = DATES.map(
    (d, i) => `<dl><dt class="x"> <span>${d}</span> </dt><dd><span class="y">${counts[i]}</span></dd></dl>`,
  );
  return `<div><dl><dt><span>日付</span></dt><dd><span>出勤人数</span></dd></dl>${dls.join('')}</div>`;
}

function girlBlock(girlId, name, cells) {
  const days = cells.map((c, d) => {
    const gid = d === 0 ? `<input name="girl_work[${girlId}][0][girl_id]" value="${girlId}" type="hidden">` : '';
    const flg = `<input name="girl_work[${girlId}][${d}][work_flg]" value="1"${c.work ? ' checked="checked"' : ''} type="checkbox"><label>出勤</label>`;
    return `<li><div>${gid}
      <select class="s" name="girl_work[${girlId}][${d}][start_time]">
        <optgroup><option value="00:00">0:00</option>
        <option value="${c.start}" selected="selected">${c.start}</option></optgroup>
      </select> ～
      <select class="s" name="girl_work[${girlId}][${d}][end_time]">
        <optgroup><option value="${c.end}" selected="selected">disp</option>
        <option value="47:30">23:30</option></optgroup>
      </select>
      <div>${flg}</div>
    </div></li>`;
  });
  return `<ul><li><p></p><span class="name">${name}</span></li>${days.join('')}</ul>`;
}

const OFF = { start: '00:00', end: '00:00', work: false };
const NIGHT = { start: '20:00', end: '27:00', work: true };
const DAY = { start: '10:00', end: '19:00', work: true };

const GIRLS = [
  { girlId: '5232208', name: 'さら', cells: [OFF, NIGHT, NIGHT, OFF, OFF, OFF, OFF] },
  { girlId: '5232190', name: 'るい', cells: [DAY, OFF, DAY, OFF, OFF, OFF, OFF] },
];

const WORK_HTML = `<!DOCTYPE html><html><body>
  <form action="https://ranking-deli.jp/admin/girlswork" method="post" id="frmSearch"></form>
  <form id="frmfix" action="https://ranking-deli.jp/admin/girlswork/1/" accept-charset="utf-8" method="post">
    <input type="hidden" name="fuel_csrf_token" value="${'a'.repeat(128)}">
    ${header([1, 1, 2, 0, 0, 0, 0])}
    ${GIRLS.map((g) => girlBlock(g.girlId, g.name, g.cells)).join('')}
    <input name="work_btn" value="" type="submit">
  </form></body></html>`;

// ★ 実物のログイン画面の形（設計メモ §17-9）。password と shopid が揃っているのが目印
const LOGIN_HTML = `<!DOCTYPE html><html><body>
  <form action="https://ranking-deli.jp/admin/login" accept-charset="utf-8" method="post">
    <input type="text" name="email"><input type="password" name="password">
    <input type="text" name="shopid"><input type="submit" name="submit" value="">
  </form></body></html>`;

function ctx(overrides = {}) {
  return {
    ...F.newFlowContext({ flowId: 'flow-1', intent: 'connect_test', startedAt: '2026-08-28T00:00:00.000Z' }),
    ...overrides,
  };
}

function events(outcome) {
  return outcome.audits.map((a) => `${a.event}:${a.outcome}`);
}

// ────────────────────────── ログインの組み立て ──────────────────────────

test('ログインは3点（shopid / email / password）を送る', () => {
  const req = F.buildLoginRequest({ shopId: '37168', loginId: 'shop@example.com', password: 'p@ss&word' });
  assert.equal(req.method, 'POST');
  assert.equal(req.url, F.EKICHIKA_LOGIN_URL);
  assert.equal(req.headers['content-type'], 'application/x-www-form-urlencoded');
  // ★ 3点そろっていること。1つ落ちても通ってしまう形にしない
  assert.match(req.body, /(^|&)email=shop%40example\.com(&|$)/);
  assert.match(req.body, /(^|&)shopid=37168(&|$)/);
  // ★ 記号がそのまま出ない（URLエンコードされている）
  assert.match(req.body, /(^|&)password=p%40ss%26word(&|$)/);
  assert.match(req.body, /(^|&)submit=(&|$)/);
});

test('3点のどれかが空なら組み立てない', () => {
  assert.throws(() => F.buildLoginRequest({ shopId: '', loginId: 'a', password: 'b' }), /3点/);
  assert.throws(() => F.buildLoginRequest({ shopId: '1', loginId: '', password: 'b' }), /3点/);
  assert.throws(() => F.buildLoginRequest({ shopId: '1', loginId: 'a', password: '' }), /3点/);
});

// ────────────────────────── login の段 ──────────────────────────

test('★ ログインの応答だけでは成功と書かない（監査ログを1件も書かない）', () => {
  const out = F.advanceFlow({
    purpose: 'login',
    status: 302,
    headers: { 'set-cookie': ['ci_session=abc; path=/; HttpOnly'] },
    body: '',
    context: ctx(),
  });
  assert.equal(out.kind, 'next');
  assert.deepEqual(out.audits, []); // ★ ここが要点。302 を「ログインできた」と書かない
  assert.equal(out.next.purpose, 'read_work');
  assert.equal(out.next.method, 'GET');
  assert.equal(out.next.url, F.EKICHIKA_WORK_URL);
  assert.equal(out.next.headers.cookie, 'ci_session=abc');
  assert.equal(out.next.context.cookie, 'ci_session=abc'); // ★ 次の段へ持ち回る
});

test('セッションが発行されなければ、そこで失敗と言い切る', () => {
  const out = F.advanceFlow({ purpose: 'login', status: 200, headers: {}, body: '', context: ctx() });
  assert.equal(out.kind, 'stop');
  assert.deepEqual(events(out), ['login:failed']);
  assert.equal(out.audits[0].detail.reason, 'no_cookie');
});

test('ログインの応答が 4xx / 5xx なら止まる', () => {
  for (const status of [403, 500]) {
    const out = F.advanceFlow({ purpose: 'login', status, headers: {}, body: '', context: ctx() });
    assert.equal(out.kind, 'stop');
    assert.deepEqual(events(out), ['login:failed']);
    assert.equal(out.audits[0].detail.httpStatus, status);
  }
});

// ────────────────────────── read_work の段（＝ログインの判定） ──────────────────────────

test('★ ログイン画面へ戻されたら「ログインできなかった」と記録する（302）', () => {
  const out = F.advanceFlow({
    purpose: 'read_work',
    status: 302,
    headers: { location: 'https://ranking-deli.jp/admin/login' },
    body: '',
    context: ctx({ cookie: 'ci_session=abc' }),
  });
  assert.equal(out.kind, 'stop'); // ★ 積み直さない（凍結を避ける）
  assert.deepEqual(events(out), ['login:failed']);
  assert.equal(out.audits[0].detail.reason, 'back_to_login');
});

test('★ 200 でログイン画面が返っても、同じ結論になる', () => {
  const out = F.advanceFlow({
    purpose: 'read_work',
    status: 200,
    headers: {},
    body: LOGIN_HTML,
    context: ctx({ cookie: 'ci_session=abc' }),
  });
  assert.equal(out.kind, 'stop');
  assert.deepEqual(events(out), ['login:failed']);
  assert.equal(out.audits[0].detail.reason, 'login_page');
});

test('ログイン画面ではない転送は、ログイン失敗と混同しない', () => {
  const out = F.advanceFlow({
    purpose: 'read_work',
    status: 302,
    headers: { location: 'https://ranking-deli.jp/admin/maintenance' },
    body: '',
    context: ctx({ cookie: 'ci_session=abc' }),
  });
  assert.equal(out.kind, 'stop');
  assert.deepEqual(events(out), ['read_work:failed']); // ★ login:failed にしない
});

test('出勤ページが壊れて見えるときは read_work の失敗にする', () => {
  const broken = WORK_HTML.replace('name="fuel_csrf_token"', 'name="nope"');
  const out = F.advanceFlow({
    purpose: 'read_work', status: 200, headers: {}, body: broken,
    context: ctx({ cookie: 'ci_session=abc' }),
  });
  assert.equal(out.kind, 'stop');
  assert.deepEqual(events(out), ['read_work:failed']);
});

test('★ 出勤ページが読めて初めて「ログインできた」と記録する', () => {
  const out = F.advanceFlow({
    purpose: 'read_work', status: 200, headers: {}, body: WORK_HTML,
    context: ctx({ cookie: 'ci_session=abc' }),
  });
  assert.equal(out.kind, 'done'); // ★ 接続テストはここで終わり。書き込みへ進まない
  assert.deepEqual(events(out), ['login:ok', 'read_work:ok']);
  assert.equal(out.audits[1].detail.people, 2);
  assert.equal(out.audits[1].detail.days, 7);
});

test('ログイン画面の見分けは、出勤ページを誤判定しない', () => {
  assert.equal(F.looksLikeEkichikaLoginPage(LOGIN_HTML), true);
  assert.equal(F.looksLikeEkichikaLoginPage(WORK_HTML), false);
});

// ────────────────────────── 進めない場合 ──────────────────────────

test('この便では書き込みの段を積まない', () => {
  for (const purpose of ['write_work', 'verify_work']) {
    const out = F.advanceFlow({ purpose, status: 200, headers: {}, body: '', context: ctx({ cookie: 'x=1' }) });
    assert.equal(out.kind, 'stop');
  }
});

test('フロー文脈の版が違えば進めない', () => {
  const out = F.advanceFlow({
    purpose: 'login', status: 302, headers: { 'set-cookie': ['a=b'] }, body: '',
    context: ctx({ v: 99 }),
  });
  assert.equal(out.kind, 'stop');
  assert.deepEqual(out.audits, []);
});

// ────────────────────────── 監査に秘密を混ぜていないか ──────────────────────────

test('★ どの分岐でも、監査の detail から落ちる値を入れていない', () => {
  const cases = [
    { purpose: 'login', status: 500, headers: {}, body: '' },
    { purpose: 'login', status: 200, headers: {}, body: '' },
    { purpose: 'read_work', status: 302, headers: { location: 'https://ranking-deli.jp/admin/login' }, body: '' },
    { purpose: 'read_work', status: 302, headers: { location: 'https://ranking-deli.jp/x' }, body: '' },
    { purpose: 'read_work', status: 503, headers: {}, body: '' },
    { purpose: 'read_work', status: 200, headers: {}, body: LOGIN_HTML },
    { purpose: 'read_work', status: 200, headers: {}, body: WORK_HTML.replace('name="fuel_csrf_token"', 'name="nope"') },
    { purpose: 'read_work', status: 200, headers: {}, body: WORK_HTML },
  ];
  for (const c of cases) {
    const out = F.advanceFlow({ ...c, context: ctx({ cookie: 'ci_session=abc' }) });
    for (const a of out.audits) {
      const { dropped } = A.scrubAuditDetail(a.detail ?? null);
      // ★ 落ちる値を入れていたら、監査ログに「_droppedKeys」が残る＝入れた側の間違い
      assert.deepEqual(dropped, [], `${c.purpose}/${c.status} の ${a.event} で落ちた: ${dropped.join(',')}`);
    }
  }
});

test('★ 店舗が読む1行に、駅ちかのURLや技術用語を混ぜていない', () => {
  const out = F.advanceFlow({
    purpose: 'read_work', status: 302,
    headers: { location: 'https://ranking-deli.jp/admin/login' },
    body: '', context: ctx({ cookie: 'ci_session=abc' }),
  });
  const s = out.audits[0].summary ?? '';
  assert.ok(s.length > 0);
  assert.ok(!/https?:\/\//.test(s), 'summary にURLが入っている: ' + s);
});
