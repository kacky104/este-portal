// src/lib/relayJob.ts のテスト（第38便）。
//
//   node --test tools-test-relay-job.mjs
//
// ★ 中継は「任意のリクエストを転送する口」になりうるので、
//   通してよいものより【通してはいけないもの】を厚く試す。

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { register } from 'node:module';

// ★ relayJob.ts は mediaCredentials を拡張子なしで import している（Next の作法）。
//   Node に直接読ませるために、テストのときだけ拡張子を補う。
register('./tools-ts-resolve.mjs', import.meta.url);

process.env.MEDIA_CRED_KEY = crypto.randomBytes(32).toString('base64');

const R = await import('./src/lib/relayJob.ts');

const JOB = '2f1c9a70-0000-4000-8000-000000000001';
const OTHER_JOB = '2f1c9a70-0000-4000-8000-000000000002';
const OK_URL = 'https://ranking-deli.jp/admin/girlswork/';

// ────────────────────────── 宛先 ──────────────────────────

test('許可した宛先だけ通す', () => {
  assert.equal(R.assertAllowedUrl(OK_URL).hostname, 'ranking-deli.jp');
});

test('★ 似た名前のホストを通さない', () => {
  // 前方一致・後方一致で書くと、この2つが通ってしまう
  assert.throws(() => R.assertAllowedUrl('https://ranking-deli.jp.evil.com/x'), /許可していない宛先/);
  assert.throws(() => R.assertAllowedUrl('https://evil-ranking-deli.jp/x'), /許可していない宛先/);
  assert.throws(() => R.assertAllowedUrl('https://sub.ranking-deli.jp/x'), /許可していない宛先/);
});

test('★ https 以外・ポート・ユーザー情報つきを通さない', () => {
  assert.throws(() => R.assertAllowedUrl('http://ranking-deli.jp/x'), /https 以外/);
  assert.throws(() => R.assertAllowedUrl('file:///etc/passwd'), /https 以外/);
  assert.throws(() => R.assertAllowedUrl('https://ranking-deli.jp:8443/x'), /ポート指定/);
  assert.throws(() => R.assertAllowedUrl('https://a:b@ranking-deli.jp/x'), /ユーザー情報/);
  assert.throws(() => R.assertAllowedUrl('ranking-deli.jp/x'), /URLとして読めない/);
});

// ────────────────────────── ヘッダー ──────────────────────────

test('送ってよいヘッダーだけ残す', () => {
  const out = R.filterRequestHeaders({
    Cookie: 'a=1',
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: 'Bearer himitsu',   // ★ 落とす
    'X-Forwarded-For': '1.2.3.4',      // ★ 落とす
    Host: 'evil.com',                  // ★ 落とす
  });
  assert.deepEqual(Object.keys(out).sort(), ['content-type', 'cookie']);
  assert.ok(!('authorization' in out));
});

test('★ ヘッダーに改行が入っていたら止める', () => {
  assert.throws(
    () => R.filterRequestHeaders({ cookie: 'a=1\r\nX-Evil: 1' }),
    /改行が入っている/,
  );
});

test('持ち帰るレスポンスヘッダーは絞る', () => {
  const out = R.filterResponseHeaders({
    'Set-Cookie': ['s=1; Path=/', 't=2'],
    Server: 'Apache/2.4.46',
    'X-Powered-By': 'PHP',   // ★ 落とす
  });
  assert.deepEqual(Object.keys(out).sort(), ['server', 'set-cookie']);
});

// ────────────────────────── ボディ ──────────────────────────

test('大きい本文を gzip して往復できる', () => {
  const html = '<html>' + 'あ'.repeat(300_000) + '</html>'; // 実物の出勤ページ相当
  const packed = R.packBody(html);
  assert.ok(packed.length < html.length / 5, '圧縮が効いていない: ' + packed.length);
  assert.equal(R.unpackBody(packed), html);
});

test('上限を超える本文は運ばない', () => {
  assert.throws(() => R.packBody('x'.repeat(R.MAX_RESPONSE_BODY_BYTES + 1)), /大きすぎる/);
});

// ────────────────────────── ジョブの組み立て ──────────────────────────

test('GET と POST 以外は中継しない', () => {
  assert.throws(() => R.buildRelayRequest({ method: 'DELETE', url: OK_URL }), /GET と POST/);
  assert.throws(() => R.buildRelayRequest({ method: 'GET', url: OK_URL, body: 'a=1' }), /GET にボディ/);
});

test('★ ジョブの中身は暗号化され、平文の秘密が残らない', () => {
  const req = R.buildRelayRequest({
    method: 'POST',
    url: 'https://ranking-deli.jp/admin/login',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'shopid=37168&email=someone&password=himitsu',
  });
  const sealed = R.sealRequest(req, JOB);
  assert.ok(!sealed.includes('himitsu'));
  assert.ok(!sealed.includes('37168'));
  assert.match(sealed, /^v1\./);
  assert.deepEqual(R.openRequest(sealed, JOB), req);
});

test('★ 別のジョブの中身を貼り替えても開けない', () => {
  const sealed = R.sealRequest(R.buildRelayRequest({ method: 'GET', url: OK_URL }), JOB);
  assert.throws(() => R.openRequest(sealed, OTHER_JOB), /復号できない/);
});

test('★ 復号できても allowlist をもう一度通す', async () => {
  // DBを直接書き換えられ、正しい鍵で「別の宛先」を仕込まれた場合を想定
  const { encryptWithAad } = await import('./src/lib/mediaCredentials.ts');
  const evil = JSON.stringify({ method: 'GET', url: 'https://evil.com/', headers: {}, body: '' });
  const sealed = encryptWithAad(evil, R.relayAad(JOB, 'request'));
  assert.throws(() => R.openRequest(sealed, JOB), /許可していない宛先/);
});

test('レスポンスも封をして往復できる', () => {
  const res = { status: 200, headers: { 'set-cookie': ['sess=abc'] }, bodyPacked: R.packBody('<html>x</html>') };
  const sealed = R.sealResponse(res, JOB);
  assert.ok(!sealed.includes('sess=abc'));
  const back = R.openResponse(sealed, JOB);
  assert.equal(R.unpackBody(back.bodyPacked), '<html>x</html>');
});

// ────────────────────────── Cookie の持ち回り ──────────────────────────

test('set-cookie を次のリクエストの Cookie に畳む', () => {
  const c1 = R.mergeCookies('', ['fuelcid=abc; Path=/; HttpOnly', 'other=1']);
  assert.equal(c1, 'fuelcid=abc; other=1');
  // 更新される
  assert.equal(R.mergeCookies(c1, 'fuelcid=xyz; Path=/'), 'fuelcid=xyz; other=1');
  // ★ 空の値は「消してよい」の合図。残すと期限切れのセッションを使い続ける
  assert.equal(R.mergeCookies(c1, 'other=; Expires=Thu, 01 Jan 1970 00:00:00 GMT'), 'fuelcid=abc');
  // set-cookie が無ければそのまま
  assert.equal(R.mergeCookies(c1, undefined), c1);
});
