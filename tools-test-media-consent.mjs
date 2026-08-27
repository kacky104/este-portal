// src/lib/mediaConsent.ts のテスト（第39便）。
//
//   node --test tools-test-media-consent.mjs
//
// ★★★ このテストの役目は「文言が正しいこと」ではなく、
//   【消してはいけないものが消えていないこと】の見張り。
//   第38便 §6 の射程（駅ちかを開ける＝求人サイトも開ける）は、
//   説明が長いという理由で真っ先に削られる種類の文章なので、ここで止める。

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tools-ts-resolve.mjs', import.meta.url);

const C = await import('./src/lib/mediaConsent.ts');

test('★ 権限の射程（求人サイトにも入れてしまうこと）が文言に残っている', () => {
  const all = C.consentFullText();
  assert.match(all, /求人サイト/, '§6 の射程が消えている');
  assert.match(all, /駅ちかだけに収まりません|収まりません/, '射程が限定的だと読める文言になっている');
});

test('同じパスワードの使い回しへの注意が残っている', () => {
  assert.match(C.consentFullText(), /同じパスワード/);
});

test('止められること・記録が残ることが書いてある（免責より先に）', () => {
  const all = C.consentFullText();
  const stopAt = all.indexOf('いつでも止められます');
  const logAt = all.indexOf('記録が残ります');
  const disclaimAt = all.indexOf('できないこと');
  assert.ok(stopAt >= 0 && logAt >= 0 && disclaimAt >= 0, '節が足りない');
  // ★ 第37便 §12「障害時は備えがある話を先に、免責は後に」
  assert.ok(logAt < disclaimAt, '免責が記録より先に来ている');
  assert.ok(stopAt < disclaimAt, '免責が「止められます」より先に来ている');
});

test('版が違えば同意を取り直す', () => {
  assert.equal(C.needsConsent(null), true);
  assert.equal(C.needsConsent(undefined), true);
  assert.equal(C.needsConsent('v0-古い版'), true);
  assert.equal(C.needsConsent(C.MEDIA_CONSENT_VERSION), false);
});

test('チェックの一文だけ読んでも「預ける」ことが分かる', () => {
  assert.match(C.MEDIA_CONSENT_AGREE_LABEL, /預ける/);
  assert.match(C.MEDIA_CONSENT_AGREE_LABEL, /同意/);
});

test('版番号が空でない', () => {
  assert.ok(C.MEDIA_CONSENT_VERSION.length > 0);
});
