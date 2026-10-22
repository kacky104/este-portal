// 番人: フクエスポイントの決まり（src/lib/points.ts・第1444便）
const assert = require('assert');
const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'points.js'));
assert.strictEqual(m.POINT_VISIT, 50);
assert.strictEqual(m.POINT_USE_UNIT, 1000);
assert.strictEqual(m.POINT_USE_YEN, 1000);
// 期限は最後に貯めた日の12か月後
assert.strictEqual(m.pointExpiresAt('2026-10-14T03:00:00.000Z').toISOString(), '2027-10-14T03:00:00.000Z');
assert.strictEqual(m.pointExpiresAt(null), null);
assert.strictEqual(m.pointExpiresAt('xx'), null);
assert.ok(!m.pointsExpired('2026-10-14T03:00:00.000Z', Date.parse('2027-10-14T02:59:00.000Z')));
assert.ok(m.pointsExpired('2026-10-14T03:00:00.000Z', Date.parse('2027-10-14T03:01:00.000Z')));
assert.ok(!m.pointsExpired(null));
// あと何pt
assert.strictEqual(m.pointsToNextUse(0), 1000);
assert.strictEqual(m.pointsToNextUse(950), 50);
assert.strictEqual(m.pointsToNextUse(1000), 0);
assert.strictEqual(m.pointsToNextUse(-5), 1000);
// 券の形
assert.ok(m.isPointToken('abcdefghijklmnopqrstuvwxyz012345'));
assert.ok(!m.isPointToken('short'));
assert.ok(!m.isPointToken('abcdefghijklmnopqrstuvwxyz/012345'));
assert.ok(!m.isPointToken(123));
// 受け取り待ち
const now = Date.parse('2026-10-14T00:00:00Z');
assert.deepStrictEqual(m.parsePendingClaim(JSON.stringify({ token: 'abcdefghijklmnopqrstuvwxyz012345', exp: now + 1000 }), now), { token: 'abcdefghijklmnopqrstuvwxyz012345', exp: now + 1000 });
assert.strictEqual(m.parsePendingClaim(JSON.stringify({ token: 'abcdefghijklmnopqrstuvwxyz012345', exp: now - 1 }), now), null);
assert.strictEqual(m.parsePendingClaim('{', now), null);
assert.strictEqual(m.parsePendingClaim(null, now), null);
// 文
assert.strictEqual(m.pointClaimMessage('ok', 50), '50pt 貯まりました');
assert.ok(m.pointClaimMessage('daily').includes('1日1回'));
// 第1450便
assert.strictEqual(m.POINT_SIGNUP, 50);
assert.strictEqual(m.POINT_FIRST_REVIEW, 100); // 第1607便
assert.strictEqual(m.REVIEW_BODY_MIN, 50);
assert.ok(m.signupPointEligible('2026-10-14T03:00:00Z', '2026-10-14T03:05:00Z'));
assert.ok(!m.signupPointEligible('2026-10-13T10:00:00Z', '2026-10-13T10:05:00Z'));
assert.ok(!m.signupPointEligible('2026-10-14T03:00:00Z', null));
assert.strictEqual(m.reviewBodyLength('  あいう  '), 3);
assert.strictEqual(m.reviewBodyLength('😀あ'), 2);
// 第1454便: 使う
assert.ok(m.pointUseMessage('ok').includes('1,000円引き'));
assert.ok(m.pointUseMessage('short').includes('1,000pt'));
assert.strictEqual(m.pointsYenOf([-1000]), 1000);
assert.strictEqual(m.pointsYenOf([-1000, 1000]), 0);
assert.strictEqual(m.pointsYenOf([]), 0);
console.log('✔ points ok');
