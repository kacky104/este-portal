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

console.log('\n── ★★★ 連携の向きを変えた記録に、別の媒体の名前を出さない（第141便）──');
// ★★ 2026-09-04 実際に出た:
//   「エステ魂（枠1）の連携を『フクエスから【駅ちか】へ反映する』に変更しました」
//   ★ 第139便で「止まっています」は直したが、ここは直っていなかった。
//   ★★★ 1か所直して終わりにしない。★ 同じ間違いは別の場所に残る。
const lm = (provider, mode) => a.defaultAuditSummary({
  event: 'link_mode_changed', outcome: 'ok', provider, slot: 1, detail: { mode },
});
eq('★★★ エステ魂ならエステ魂と書く', lm('esutama', 'write').includes('フクエスからエステ魂へ反映する'), true);
eq('★★★ エステ魂の行に駅ちかと書かない', lm('esutama', 'write').includes('駅ちか'), false);
eq('★ 駅ちかなら今までどおり', lm('ekichika', 'write').includes('フクエスから駅ちかへ反映する'), true);
eq('★ 取り込みに戻す文もサイト名を使う', lm('esulove', 'read').includes('エステラブから取り込む'), true);
eq('★ 連携しないは媒体名を出さない', lm('esutama', 'none').includes('連携しない'), true);
// ★ 知らない provider は英字のまま（★ ごまかして別の名前を当てない）
eq('★ 知らない provider は英字のまま', lm('nanikore', 'write').includes('nanikore'), true);

console.log('\n── ★★★ 自動の周が「見ただけ」なら記録を残さない（第140便）──');
// ★★ 普段は黙らせないのが原則。★ ここだけ例外。
//   ★ 送るものが無い日は1日288回×2行＝576行。★ 直近50件が2時間で埋まり、
//     駅ちかの取り込みや出勤の記録が【見えなくなる】。★ 黙らせないことが見えなくする。
const look = [{ event: 'read_diary_targets', outcome: 'ok' }, { event: 'plan_diary', outcome: 'ok' }];
eq('★★★ 自動の周で見ただけなら落とす', a.shouldDropAutoAudits('diary_auto', false, look), true);
// ★★★ 人が押したものは必ず残す
eq('★★★ 手で撃った下見は残す', a.shouldDropAutoAudits('diary_dryrun', false, look), false);
eq('★★★ 手で撃った実弾も残す', a.shouldDropAutoAudits('diary_push', false, look), false);
// ★★★ 次の段を積んでいる＝これから相手を書き換える。★ 残す
eq('★★★ 送りに行くなら残す', a.shouldDropAutoAudits('diary_auto', true, look), false);
// ★★★ 失敗が1つでも混ざれば残す。★ 静かに失敗させない
eq('★★★ 失敗が混ざれば残す', a.shouldDropAutoAudits('diary_auto', false,
   [{ event: 'plan_diary', outcome: 'failed' }]), false);
eq('★★★ 中止が混ざれば残す', a.shouldDropAutoAudits('diary_auto', false,
   [look[0], { event: 'plan_diary', outcome: 'stopped' }]), false);
// ★★★ 書き換える出来事が混ざれば残す
eq('★★★ 送った記録が混ざれば残す', a.shouldDropAutoAudits('diary_auto', false,
   [look[0], { event: 'push_diary', outcome: 'ok' }]), false);
eq('★ 空なら落とすものが無い', a.shouldDropAutoAudits('diary_auto', false, []), false);
// ★★ 第143便: 即セラの周も同じ扱い。★ 「今すぐ」の人が居ない時間のほうが長い
const look2 = [{ event: 'read_sokusera', outcome: 'ok' }];
eq('★★★ 即セラの周も、見ただけなら落とす', a.shouldDropAutoAudits('sokusera_auto', false, look2), true);
eq('★★★ 手で撃った即セラは残す', a.shouldDropAutoAudits('sokusera_push', false, look2), false);
eq('★★★ ONにしに行くなら残す', a.shouldDropAutoAudits('sokusera_auto', true, look2), false);
eq('★★★ ONにした記録が混ざれば残す', a.shouldDropAutoAudits('sokusera_auto', false,
   [look2[0], { event: 'push_sokusera', outcome: 'ok' }]), false);

console.log('\n── ★★ 即セラの文言（第143便）──');
const sk = (event, outcome, detail) => a.defaultAuditSummary({ event, outcome, provider: 'esutama', slot: 1, detail: detail || null });
// ★★★ 「送った」と「ONになった」を混ぜない
eq('★★★ 送った記録は「指示を送りました」', sk('push_sokusera', 'ok', { name: 'さら' }).includes('指示を送りました'), true);
eq('★★★ 送った記録で「ONになりました」と言わない', sk('push_sokusera', 'ok', { name: 'さら' }).includes('ONになった'), false);
eq('★★★ 読み返しで初めて「確認しました」', sk('verify_sokusera', 'ok').includes('ONになったことを確認'), true);
// ★★ 読めなかった（stopped）を成功と書かない
eq('★★★ 読み取れなければそう書く', sk('verify_sokusera', 'stopped').includes('読み取れませんでした'), true);
eq('★★ ONになっていなければそう書く', sk('verify_sokusera', 'failed').includes('なっていませんでした'), true);

console.log('\n── ★★★ 店舗様の画面に出す行か（第149便）──');
// ★★ 「連携の記録」は店舗様のための画面。こちらの作業ログではない。
//   ★ 「確かめる」を1回押しただけで人ごとの読み取りが46行並び、
//     押したご本人が「何か動き続けている」と不安になった（2026-09-04 23:00）。
const vis = (o) => a.isShopVisibleAudit(o);
// ★★★ 既定は【出す】。★ 印が無い行を黙らせない
eq('★★★ 印が無ければ出す', vis({ event: 'write_work', outcome: 'ok', detail: { people: 23 } }), true);
eq('★★★ detail が無くても出す', vis({ event: 'write_work', outcome: 'ok' }), true);
eq('★★★ detail が null でも出す', vis({ event: 'write_work', outcome: 'ok', detail: null }), true);
// ★★ 隠すのは、明示的に false と書いたときだけ
eq('★★★ 印が false のときだけ、たたむ',
   vis({ event: 'read_work', outcome: 'ok', detail: Object.assign({}, a.AUDIT_SHOP_HIDDEN, { days: 7 }) }), false);
eq('★★ 印のキー名は1か所で決める', a.AUDIT_SHOP_VISIBLE_KEY, 'shopVisible');
eq('★★ AUDIT_SHOP_HIDDEN の中身', a.AUDIT_SHOP_HIDDEN, { shopVisible: false });
// ★ true と書いてあれば当然出す。★ 知らない値も【出す】側へ倒す
eq('★ true なら出す', vis({ event: 'read_work', outcome: 'ok', detail: { shopVisible: true } }), true);
eq('★★ 知らない値は出す側へ倒す', vis({ event: 'read_work', outcome: 'ok', detail: { shopVisible: 'no' } }), true);
eq('★★ 文字の false は隠さない（型を間違えたら出す）', vis({ event: 'read_work', outcome: 'ok', detail: { shopVisible: 'false' } }), true);
// ★★★ うまくいかなかったものは、印より優先して【必ず出す】。★ 静かに失敗させない
eq('★★★ failed は印が付いていても出す',
   vis({ event: 'read_work', outcome: 'failed', detail: a.AUDIT_SHOP_HIDDEN }), true);
// ★ 止めた（stopped）は印に従う。★ 人ごとの「変更なし」がこれ
eq('★ stopped は印に従う（人ごとの下見）',
   vis({ event: 'plan_work', outcome: 'stopped', detail: a.AUDIT_SHOP_HIDDEN }), false);
eq('★★ 印の無い stopped は出す（送らなかった理由）',
   vis({ event: 'write_work', outcome: 'stopped', detail: { reason: 'plan_changed' } }), true);
// ★★★ scrubAuditDetail を通しても印が残ること（★ 落ちると全部出てしまう）
{
  const scrubbed = a.scrubAuditDetail(Object.assign({}, a.AUDIT_SHOP_HIDDEN, { castId: '123', flowId: 'f1' }));
  eq('★★★ 秘密落としを通しても印が残る', scrubbed.detail.shopVisible, false);
  eq('★★★ 印は落とされない', scrubbed.dropped, []);
  eq('★★★ 通したあとも、たたむと判定できる',
     vis({ event: 'read_work', outcome: 'ok', detail: scrubbed.detail }), false);
}


console.log('\n── 駅ちかの新着情報の文言（第156便） ──');
//
// ★★★ 2026-09-05 の実弾で分かったこと:
//   管理画面には載った。★ でも公開ページには出なかった（枠そのものが非表示だった）。
//   → 「載りました」で終わらせない。★ 出ていないなら、そう書く。
// ★★ もうひとつ: 「駅ちか（枠1）」という書き方は店舗様に通じない。
//   ★ 相手の画面の言葉（新人速報／緊急出勤速報）で書く。
const sum = (event, outcome, detail) =>
  a.defaultAuditSummary({ event, outcome, provider: 'ekichika', slot: 1, detail: detail ?? null });
const WHERE = { where: '新人速報' };

eq('★★ 一覧を読んだ', sum('read_article_list', 'ok'), '駅ちかの新着情報の一覧を読み取りました');
eq('★ 一覧が読めなかった', sum('read_article_list', 'failed'), '駅ちかの新着情報の一覧を読み取れませんでした');
eq('★★★ 枠の名前が分かれば相手の言葉で書く', sum('read_article', 'ok', WHERE), '駅ちかの新人速報を読み取りました');
eq('★★★ 「送った」と読める文にしない（まだ送っていない）',
   sum('plan_article', 'ok', WHERE), '駅ちかの新人速報へ出す内容を組み立てました（まだ送っていません）');
eq('★★★ 送った段では「載りました」と言わない', sum('push_article', 'ok', WHERE), '駅ちかの新人速報へ送りました');
eq('★★★ 読み返して初めて「載った」と言う', sum('verify_article', 'ok', WHERE), '駅ちかの新人速報に載ったことを確認しました');
eq('★★★ 枠が非表示なら「公開ページには出ていない」と書く',
   sum('verify_article', 'ok', { where: '新人速報', hidden: true }),
   '駅ちかの新人速報に反映しましたが、この枠はいま非表示のため公開ページには出ていません');
eq('★★ hidden が false なら普通の文言', sum('verify_article', 'ok', { where: '新人速報', hidden: false }),
   '駅ちかの新人速報に載ったことを確認しました');
eq('★★★ hidden が分からないときに「非表示」と言わない（0と不明を混ぜない）',
   sum('verify_article', 'ok', WHERE), '駅ちかの新人速報に載ったことを確認しました');
eq('★ 確かめられなかった', sum('verify_article', 'failed', WHERE), '駅ちかの新人速報に載ったことを確認できませんでした');
// ★★ 枠の名前が分からないとき（一覧が読めなかった等）でも、内部の番号を出さない
{
  const t = sum('push_article', 'ok');
  eq('★★ 枠の名前が無くても「枠1」のような内部の言い方をしない', /枠\d/.test(t), false);
  eq('★ そのときは媒体の名前だけで書く', t.indexOf('駅ちか') >= 0, true);
}
{
  // ★★★ 「送った」を「載った」と読める文にしていないか（この2つは別物・第136便）
  const pushed = sum('push_article', 'ok', WHERE);
  eq('★★★ 送った文に「載り」「確認」を混ぜない', /載り|確認|反映しました/.test(pushed), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
