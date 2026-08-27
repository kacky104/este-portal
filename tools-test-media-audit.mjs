// src/lib/mediaAudit.ts のテスト（第39便）。
//
//   node --test tools-test-media-audit.mjs
//
// ★ 監査ログの値は「後から直せないこと」と「秘密が入っていないこと」で決まる。
//   前者はDBのトリガー（追記専用）。ここで試すのは後者と、店舗が読む文言。
// ★ 通してよいものより【通してはいけないもの】を厚く試す（relayJob.ts と同じ作法）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tools-ts-resolve.mjs', import.meta.url);

const A = await import('./src/lib/mediaAudit.ts');

// ────────────────────── 秘密を落とす ──────────────────────

test('キー名が秘密に見えるものを落とす', () => {
  const { detail, dropped } = A.scrubAuditDetail({
    people: 37,
    password: 'hunter2',
    sessionCookie: 'PHPSESSID=abc',
    loginId: 'shop@example.com',
  });
  assert.deepEqual(detail, { people: 37 });
  assert.deepEqual(dropped.sort(), ['loginId', 'password', 'sessionCookie'].sort());
});

test('shop_id は落とさない（公開ページから機械的に取れる値）', () => {
  const { detail, dropped } = A.scrubAuditDetail({ shop_id: '37168', people: 37 });
  assert.deepEqual(detail, { shop_id: '37168', people: 37 });
  assert.deepEqual(dropped, []);
});

test('値が暗号文の形（v1.）なら、キー名が無害でも落とす', () => {
  const { detail, dropped } = A.scrubAuditDetail({ note: 'v1.aaa.bbb.ccc' });
  assert.equal(detail, null);
  assert.deepEqual(dropped, ['note']);
});

test('値が宛先URLなら落とす', () => {
  const { dropped } = A.scrubAuditDetail({ note: 'https://ranking-deli.jp/admin/girlswork/1/' });
  assert.deepEqual(dropped, ['note']);
});

test('値にセッションや csrf の手がかりが入っていたら落とす', () => {
  assert.equal(A.valueLooksSecret('PHPSESSID=xyz'), true);
  assert.equal(A.valueLooksSecret('fuel_csrf_token=abc'), true);
});

test('長すぎる値は落とす（件数を入れる場所に長文が来たら何かを間違えている）', () => {
  const long = 'あ'.repeat(A.MAX_DETAIL_VALUE_LENGTH + 1);
  const { dropped } = A.scrubAuditDetail({ note: long });
  assert.deepEqual(dropped, ['note']);
});

test('数値・真偽値は落とさない', () => {
  const { detail, dropped } = A.scrubAuditDetail({ people: 37, changed: 0, verified: true });
  assert.deepEqual(detail, { people: 37, changed: 0, verified: true });
  assert.deepEqual(dropped, []);
});

test('detail が無い／全部落ちたときは null を返す（空オブジェクトを残さない）', () => {
  assert.deepEqual(A.scrubAuditDetail(null), { detail: null, dropped: [] });
  assert.deepEqual(A.scrubAuditDetail({ password: 'x' }), { detail: null, dropped: ['password'] });
});

// ────────────────────── 店舗が読む文言 ──────────────────────

test('媒体名は店舗が読める呼び名になる', () => {
  assert.equal(A.targetLabel('ekichika', 1), '駅ちか（枠1）');
  assert.equal(A.targetLabel('esulove', 2), 'エステラブ（枠2）');
});

test('知らない媒体でも空にしない', () => {
  assert.equal(A.providerLabel('unknown_media'), 'unknown_media');
});

test('出勤を読んだ記録に在籍人数が入る', () => {
  const s = A.defaultAuditSummary({
    event: 'read_work', outcome: 'ok', provider: 'ekichika', slot: 1, detail: { people: 37 },
  });
  assert.match(s, /駅ちか（枠1）/);
  assert.match(s, /在籍37人/);
});

test('照合が合わなかったときは、確認が要ると分かる文言になる', () => {
  const s = A.defaultAuditSummary({
    event: 'verify_work', outcome: 'failed', provider: 'ekichika', slot: 1,
  });
  assert.match(s, /一致しませんでした/);
  assert.match(s, /確認/);
});

test('★ 打ち切りは「送っていない」と言い切らない（こちらには分からないので）', () => {
  const s = A.defaultAuditSummary({
    event: 'relay_expired', outcome: 'stopped', provider: 'ekichika', slot: 1,
  });
  assert.ok(!s.includes('更新されていません'), '断定してはいけない: ' + s);
  assert.match(s, /確認が必要/);
});

test('疎通確認は「ログイン情報を使っていない」と分かる', () => {
  const s = A.defaultAuditSummary({
    event: 'selftest', outcome: 'ok', provider: 'ekichika', slot: 1,
  });
  assert.match(s, /ログイン情報は使っていません/);
});

test('どのイベントでも空にならず、長さの上限に収まる', () => {
  for (const event of A.MEDIA_AUDIT_EVENTS) {
    for (const outcome of ['ok', 'failed', 'stopped']) {
      const s = A.defaultAuditSummary({ event, outcome, provider: 'ekichika', slot: 1 });
      assert.ok(s.length > 0, `空になった: ${event}/${outcome}`);
      assert.ok(s.length <= A.MAX_SUMMARY_LENGTH, `長すぎる: ${event}/${outcome}`);
    }
  }
});
