// 監査ログの文言（src/lib/mediaAudit.ts の defaultAuditSummary）の自己点検（第53便）。
//
// ★★★ なぜ要るか
//   この関数が作る文字列は【店舗がマイページで読む文】。
//   ★ 2026-08-29 に「★」（内部の注記記号）を2回混ぜた。1回目を直した直後に、
//     別のイベントの文言で同じことをした。
//   ★★ 直したのが【その1か所】だけで、**同じ失敗が起きない形にしていなかった**。
//   → 全イベント × 全結果 の文言を機械的に走査する。★ 人が気をつけるのをやめる。
//
//   使い方:  npm run check:auditsummary

const a = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaAudit.js'));

let fail = 0;
const eq = (name, got, want) => {
  const x = JSON.stringify(got), y = JSON.stringify(want);
  if (x !== y) { console.log('NG ' + name + '\n   got  ' + x + '\n   want ' + y); fail++; }
  else console.log('ok ' + name);
};

// 件数を入れる detail の例。★ 実際に使っているキーを並べる
const DETAILS = [
  null,
  {},
  { people: 37 },
  { people: 37, applied: false, found: 37, matched: 37, created: 0, updated: 0, unchanged: 37, unmatched: 0 },
  { people: 37, applied: true, found: 37, matched: 36, created: 36, updated: 0, unchanged: 1, unmatched: 1 },
  { changed: 12, fields: 818 },
  { httpStatus: 302, reason: 'back_to_login' },
  { consentVersion: 'v1-2026-08-27' },
];
const OUTCOMES = ['ok', 'failed', 'stopped'];

const all = [];
for (const event of a.MEDIA_AUDIT_EVENTS) {
  for (const outcome of OUTCOMES) {
    for (const detail of DETAILS) {
      all.push({ event, outcome, s: a.defaultAuditSummary({ event, outcome, provider: 'ekichika', slot: 1, detail }) });
    }
  }
}

console.log('── 全イベントの文言を走査 ──');
eq('走査した組み合わせ数', all.length, a.MEDIA_AUDIT_EVENTS.length * OUTCOMES.length * DETAILS.length);

// ★★★ これがこの点検の本体
{
  const bad = all.filter((x) => x.s.indexOf('★') >= 0);
  eq('★★ 文言に「★」を混ぜない', bad.map((x) => x.event + '/' + x.outcome), []);
}
// ★ 英語の状態名・内部の識別子を出さない
{
  const re = /(ok|failed|stopped|applied|castId|therapist_id|salon_id|provider|slot=|null|undefined)/;
  const bad = all.filter((x) => re.test(x.s));
  eq('★ 英語の状態名や内部の識別子を出さない', bad.map((x) => x.event + ': ' + x.s.slice(0, 40)), []);
}
// ★ 空の文言を返さない（記録に空行が並ぶ）
eq('空の文言を返さない', all.filter((x) => !x.s || !x.s.trim()).length, 0);
// ★ 1行で読める長さに収まる
eq('長すぎる文言が無い', all.filter((x) => x.s.length > a.MAX_SUMMARY_LENGTH).map((x) => x.event), []);
// ★ 媒体名は日本語（'ekichika' と書かない）
eq('媒体名を日本語で出す', all.filter((x) => x.s.indexOf('ekichika') >= 0).length, 0);

console.log('\n── 件数が本文に出ているか ──');
// ★ 件数を入れたのに文言に出ていなければ、記録として役に立たない
{
  const s1 = a.defaultAuditSummary({
    event: 'read_maillist', outcome: 'ok', provider: 'ekichika', slot: 1,
    detail: { applied: true, created: 36, updated: 0, unchanged: 1, unmatched: 0 },
  });
  eq('登録の段は件数を出す', /新規36名/.test(s1) && /変更なし1名/.test(s1), true);
  eq('登録の段は「登録しました」と言う', s1.indexOf('登録しました') > 0, true);

  const s2 = a.defaultAuditSummary({
    event: 'read_maillist', outcome: 'ok', provider: 'ekichika', slot: 1,
    detail: { applied: false, created: 36, updated: 0, unchanged: 1, unmatched: 0 },
  });
  eq('確認の段は件数を出す', /新規36名/.test(s2), true);
  // ★★ 同じ入力で、applied の有無だけで文言が割れること
  eq('★ 確認の段は「まだ登録していません」と断る', s2.indexOf('まだ登録していません') > 0, true);
  eq('★ 登録と確認で文言が割れる', s1 === s2, false);

  const s3 = a.defaultAuditSummary({
    event: 'read_maillist', outcome: 'ok', provider: 'ekichika', slot: 1,
    detail: { people: 37 },
  });
  eq('読み取りの段は人数だけ', /37名/.test(s3) && s3.indexOf('新規') < 0, true);
}
// ★ 名簿の読み取り（第50便）も既定の文言に落ちない
{
  const s = a.defaultAuditSummary({
    event: 'read_girls', outcome: 'ok', provider: 'ekichika', slot: 1, detail: { people: 37 },
  });
  eq('名簿の読み取りは専用の文言', /名簿を読み取りました/.test(s) && /37名/.test(s), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
