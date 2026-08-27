// src/lib/mediaCredentials.ts のテスト（第38便）。
//
//   node --test tools-test-media-credentials.mjs
//
// ★ .mjs なのは tsconfig の対象から外して `next build` に混ぜないため。依存は node 標準だけ。

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const KEY_A = crypto.randomBytes(32).toString('base64');
const KEY_B = crypto.randomBytes(32).toString('base64');
process.env.MEDIA_CRED_KEY = KEY_A;

const {
  credentialAad,
  encryptSecret,
  decryptSecret,
  maskSecret,
  looksEncrypted,
} = await import('./src/lib/mediaCredentials.ts');

const REF = { salonId: 6, provider: 'ekichika', slot: 1 };
const OTHER_SLOT = { salonId: 6, provider: 'ekichika', slot: 2 };
const OTHER_SALON = { salonId: 11, provider: 'ekichika', slot: 1 };

test('暗号化して復号できる', () => {
  const enc = encryptSecret('p@ssw0rd', REF);
  assert.equal(decryptSecret(enc, REF), 'p@ssw0rd');
  assert.ok(looksEncrypted(enc));
  assert.match(enc, /^v1\./);
  assert.ok(!enc.includes('p@ssw0rd'));
});

test('同じ平文でも毎回ちがう暗号文になる', () => {
  // ★ 同じ暗号文が並ぶと「同じパスワードを使い回している店舗」がDBを見ただけで分かってしまう
  const a = encryptSecret('same', REF);
  const b = encryptSecret('same', REF);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a, REF), decryptSecret(b, REF));
});

test('★ 別の枠・別の店舗の行に貼り替えても復号できない', () => {
  const enc = encryptSecret('secret', REF);
  assert.throws(() => decryptSecret(enc, OTHER_SLOT), /復号できない/);
  assert.throws(() => decryptSecret(enc, OTHER_SALON), /復号できない/);
  assert.throws(() => decryptSecret(enc, { ...REF, provider: 'esulove' }), /復号できない/);
});

test('★ 改ざんは検出される', () => {
  const enc = encryptSecret('secret', REF);
  const parts = enc.split('.');
  const ct = Buffer.from(parts[3], 'base64');
  ct[0] ^= 0xff; // 1バイトだけ変える
  const tampered = [parts[0], parts[1], parts[2], ct.toString('base64')].join('.');
  assert.throws(() => decryptSecret(tampered, REF), /復号できない/);
});

test('★ 鍵が違えば復号できない', () => {
  const enc = encryptSecret('secret', REF);
  process.env.MEDIA_CRED_KEY = KEY_B;
  try {
    assert.throws(() => decryptSecret(enc, REF), /復号できない/);
  } finally {
    process.env.MEDIA_CRED_KEY = KEY_A;
  }
});

test('鍵が無い・長さが違うときは何が悪いか言う', () => {
  const saved = process.env.MEDIA_CRED_KEY;
  try {
    delete process.env.MEDIA_CRED_KEY;
    assert.throws(() => encryptSecret('x', REF), /MEDIA_CRED_KEY が設定されていない/);
    process.env.MEDIA_CRED_KEY = crypto.randomBytes(16).toString('base64');
    assert.throws(() => encryptSecret('x', REF), /長さが 16 バイト/);
  } finally {
    process.env.MEDIA_CRED_KEY = saved;
  }
});

test('壊れた暗号文は形の時点で弾く', () => {
  assert.throws(() => decryptSecret('ただの平文', REF), /4つの部分に分かれていない/);
  assert.throws(() => decryptSecret('v9.a.b.c', REF), /知らない暗号文の版/);
  assert.equal(looksEncrypted('ただの平文'), false);
});

test('空の値は暗号化しない', () => {
  // ★ 空を暗号化できてしまうと「未入力」と「空を保存した」が区別できなくなる
  assert.throws(() => encryptSecret('', REF), /空の値は暗号化しない/);
});

test('AADは3点の組み合わせ / 画面へは伏字だけ返す', () => {
  assert.equal(credentialAad(REF), '6|ekichika|1');
  assert.equal(maskSecret(), '●●●●');
});
