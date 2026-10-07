// 同意文と版の判定（src/lib/mediaConsent.ts）の自己点検（第89便）。
//
// ★★★ ここで守りたいこと
//   版を上げると【何も知らせないまま】送信と接続テストが止まる。
//   ★ 2026-08-31 に実際にそれをやってしまった（カッキーさんの指摘）。
//   ★★ 「まだ同意していない」と「古い版に同意している」を1つにしない
//     （引き継ぎメモ 3-5「0件と分からないを混ぜない」の、同意版の版）。
//
//   使い方:  npm run check:mediaconsent

const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaConsent.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 同意が要るか ──');
eq('★ 一度も同意していない（null）は要る', v.needsConsent(null), true);
eq('★ undefined も要る', v.needsConsent(undefined), true);
eq('★ 空文字も要る', v.needsConsent(''), true);
eq('★ 文字列でなければ要る', v.needsConsent(123), true);
eq('いまの版に同意済みなら要らない', v.needsConsent(v.MEDIA_CONSENT_VERSION), false);
// ★★★ 知らない版は【要る側】に倒す
eq('★★ 知らない版は要る', v.needsConsent('v9-2099-01-01'), true);

console.log('\n── 2. ★★★ 言い方を直しただけの版は、取り直させない ──');
// ★ 第397便（v4）: 預ける先・対象・使い道が変わったので一覧は空（全員取り直し）。★ 空でもよい、に変えた
eq('★ 一覧は配列', Array.isArray(v.MEDIA_CONSENT_WORDING_ONLY), true);
eq('★★ v4: 古い版（v3）に同意していても取り直す', v.needsConsent('v3-2026-09-01'), true);
eq('★★ v5: v4 に同意していても取り直す（使い道が増えた）', v.needsConsent('v4-2026-09-17'), true);
eq('★★ 一覧の版はすべて取り直し不要',
   v.MEDIA_CONSENT_WORDING_ONLY.every((x) => v.needsConsent(x) === false), true);
// ★★★ いまの版を一覧に入れない（入れると意味が壊れる・自己参照になる）
eq('★★★ いまの版は一覧に入れない',
   v.MEDIA_CONSENT_WORDING_ONLY.indexOf(v.MEDIA_CONSENT_VERSION) >= 0, false);
// ★ 一覧に空や非文字列を混ぜない（混ぜると「同意していない」が通ってしまう）
eq('★★★ 一覧に空文字を入れない',
   v.MEDIA_CONSENT_WORDING_ONLY.some((x) => typeof x !== 'string' || x.length === 0), false);

console.log('\n── 3. 版の形 ──');
eq('★ 版は空でない', typeof v.MEDIA_CONSENT_VERSION === 'string' && v.MEDIA_CONSENT_VERSION.length > 0, true);

console.log('\n── 4. ★★★ 第4項（権限の範囲）を消さない ──');
// ★ 駅ちかの管理画面から求人サイトへ入れる（第38便 §6）。★ 先に言えば注意書き、後なら隠していた
const bodies = v.MEDIA_CONSENT_SECTIONS.map((s) => s.heading + ' ' + s.body).join('\n');
eq('★★★ 求人サイトの話が残っている', bodies.indexOf('求人サイト') >= 0, true);
eq('★★ 「駅ちかだけに収まりません」が残っている', bodies.indexOf('駅ちかだけに収まりません') >= 0, true);
eq('★ 記録が残ることを書いている', bodies.indexOf('記録') >= 0, true);
eq('★ 止められることを書いている', bodies.indexOf('止め') >= 0 || bodies.indexOf('停止') >= 0, true);

console.log('\n── 5. ★★ 消した言い方が戻っていないか（第89便）──');
// ★★ 「連携を停止」は第87便で消した言い方。★ 倒れる旗が違うので、取り込みまで止まったと読める
eq('★★★ 同意文に「連携を停止」を書かない', bodies.indexOf('連携を停止') >= 0, false);
// ★★★ 同意文にボタンの名前を書かない（第90便）。★ 名前は変わる。
//   ★ 書くと、名前を直すたびに同意文が嘘になり、そのたびに版を上げることになる。
eq('★★★ ボタン名「フクエスだけで使う」を書かない', bodies.indexOf('フクエスだけで使う') >= 0, false);
eq('★★★ ボタン名「ログインを一時停止」を書かない', bodies.indexOf('ログインを一時停止') >= 0, false);
eq('★★★ ボタン名「反映しない」を書かない', bodies.indexOf('反映しない') >= 0, false);

console.log('\n── 6. ★★★ 取り直しが要ることを、開かなくても分かる形にする ──');
const n1 = v.consentRecheckNotice(['駅ちか']);
const n2 = v.consentRecheckNotice(['駅ちか', 'エステラブ']);
const n0 = v.consentRecheckNotice([]);

eq('★ 見出しは短く言い切る', n1.title, '同意の取り直しが必要です');
// ★★★ 【何が止まっているか】を先に書く。★ 「同意してください」だけでは理由が読めない
eq('★★★ 止まっていることを書く', n1.body.indexOf('送っていません') >= 0, true);
eq('★★ 接続テストも押せないことを書く', n1.body.indexOf('接続テスト') >= 0, true);
eq('★★ 同意すれば戻ることを書く', n1.body.indexOf('元どおり') >= 0, true);
eq('★ サイト名が入る', n1.body.indexOf('駅ちか') >= 0, true);
eq('★ 2つなら両方入る',
   n2.body.indexOf('駅ちか') >= 0 && n2.body.indexOf('エステラブ') >= 0, true);
// ★★ 名前が読めないときは、嘘の名前を出さない
eq('★★ 名前が無ければ、名前のない言い方に倒す', n0.body.indexOf('いくつかのサイト') >= 0, true);
eq('★★ 名前が無いのに「駅ちか」と書かない', n0.body.indexOf('駅ちか') >= 0, false);
eq('★ 空文字の名前は捨てる', v.consentRecheckNotice(['', '駅ちか']).body.indexOf('・') >= 0, false);
// ★ 印は短く。★ 見出しの横に並ぶ
eq('★ 印の文字', v.CONSENT_RECHECK_BADGE, '同意の取り直し');

console.log('\n── 7. ★★★ 第1287便: 書き込みは、コネックエフの文に同意した枠だけ ──');
const V5 = v.MEDIA_CONSENT_VERSION, LINK = v.FUKUES_LINK_CONSENT_VERSION;
eq('読むだけの同意か: link-v1 は true', v.isReadOnlyConsent(LINK), true);
eq('読むだけの同意か: v5 は false', v.isReadOnlyConsent(V5), false);
eq('読むだけの同意か: 無し・空は false', [v.isReadOnlyConsent(null), v.isReadOnlyConsent('')], [false, false]);
// ★★★ 実際に起きうる形: フクエスリンク（link-v1）のままコネックエフに切り替えた店
eq('★★★ 共通の判定は link-v1 を通す（＝これだけで書き込みを守れない）', v.needsConsent(LINK), false);
eq('★★★ link-v1 の枠へ出勤（自動）は始めない', typeof v.writeConsentBlockNote(LINK, 'work_auto', '駅ちか'), 'string');
eq('★★★ link-v1 の枠へ出勤（手動）も始めない', typeof v.writeConsentBlockNote(LINK, 'work_push', '駅ちか'), 'string');
eq('★★★ link-v1 の枠から写メ日記を読むのは止めない', v.writeConsentBlockNote(LINK, 'diary_read', '駅ちか'), null);
eq('★★ link-v1 の枠の接続テストは止めない', v.writeConsentBlockNote(LINK, 'connect_test', '駅ちか'), null);
eq('★★ link-v1 の枠の投稿用アドレスの読み込みは止めない', v.writeConsentBlockNote(LINK, 'mail_apply', '駅ちか'), null);
eq('★★★ v5 の枠は、書き込みも読むだけも止めない',
   [v.writeConsentBlockNote(V5, 'work_auto', '駅ちか'), v.writeConsentBlockNote(V5, 'girl_delete', '駅ちか'), v.writeConsentBlockNote(V5, 'diary_read', '駅ちか')],
   [null, null, null]);
eq('★★ 古い版（v4）の枠へは書かない', typeof v.writeConsentBlockNote('v4-2026-09-17', 'sokusera_auto', 'エステ魂'), 'string');
eq('★★ 同意が無い枠へは書かない', typeof v.writeConsentBlockNote(null, 'diary_auto', 'エステ魂'), 'string');
eq('★★★ 知らない流れは【要る側】', v.relayIntentNeedsWriteConsent('something_new'), true);
// ★ 案内の文: 直す場所まで書く。読むだけの同意は「取り直し」と言わない
const noteLink = v.conecfConsentMissingNote(LINK, '駅ちか');
const noteOld = v.conecfConsentMissingNote('v4-2026-09-17', '駅ちか');
eq('★ 案内に直す場所（ID・パスワード登録）が入る', noteLink.indexOf('ID・パスワード登録') >= 0 && noteOld.indexOf('ID・パスワード登録') >= 0, true);
eq('★ 読むだけの同意は「読み取りのみ」と言う', noteLink.indexOf('読み取りのみ') >= 0, true);
eq('★★ 読むだけの同意に「取り直し」と言わない', noteLink.indexOf('取り直し') >= 0, false);
eq('★ 古い版は「取り直し」と言う', noteOld.indexOf('取り直し') >= 0, true);
eq('★ サイト名が入る', noteLink.indexOf('駅ちか') >= 0, true);
eq('★ 名前が無ければ名前のない言い方', v.conecfConsentMissingNote(LINK, '').indexOf('このサイト') >= 0, true);
eq('同意済みなら案内は無い', v.conecfConsentMissingNote(V5, '駅ちか'), null);

console.log('\n── 8. ★★★ 第1287便: 流れの一覧（src/lib/relayFlow.ts）を、読むだけ／書く に分けきっている ──');
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'lib', 'relayFlow.ts'), 'utf8');
  const a = src.indexOf('export type RelayFlowIntent =');
  const b = src.indexOf('export type RelayFlowContext');
  const intents = [];
  const re = /^\s*\|\s*'([a-z_]+)'/gm;
  let m;
  const block = src.slice(a, b);
  while ((m = re.exec(block)) !== null) intents.push(m[1]);
  eq('★ 流れの一覧が読めている（20 以上）', a >= 0 && b > a && intents.length >= 20, true);
  const known = new Set([...v.RELAY_READ_ONLY_INTENTS, ...v.RELAY_WRITE_INTENTS]);
  eq('★★★ どちらにも入っていない流れは無い（★ 流れを足したら mediaConsent.ts の一覧にも足す）', intents.filter((x) => !known.has(x)), []);
  eq('★★ 一覧にあるのに、流れの型に無いものは無い', [...known].filter((x) => intents.indexOf(x) < 0), []);
  eq('★★★ 両方に入っている流れは無い', v.RELAY_READ_ONLY_INTENTS.filter((x) => v.RELAY_WRITE_INTENTS.indexOf(x) >= 0), []);
  // ★ 相手サイトを書き換える流れを、読むだけの側に入れない
  for (const w of ['work_push', 'work_auto', 'sokuhime_auto', 'photo_push', 'diary_auto', 'sokusera_auto', 'article_auto', 'girl_delete', 'girl_create', 'cast_create', 'girl_edit', 'cast_edit']) {
    eq('★★★ ' + w + ' は書き込みの同意が要る', v.relayIntentNeedsWriteConsent(w), true);
  }
}

console.log('\n── 9. ★★★ 第1287便: 保存のときの同意（どの画面から来たかで見る） ──');
// ★★★ 直す前: link-v1 の行にコネックエフの画面（v5）から同意すると、版だけ変わって日時・記録が残らなかった
eq('★★★ link-v1 → コネックエフの画面で同意: v5 にして【新しい同意】として残す',
   v.consentSaveDecision({ existing: LINK, agreed: true, incoming: V5 }),
   { ok: true, version: V5, newlyAgreed: true, previous: LINK });
eq('★★★ link-v1 → コネックエフの画面でチェック無し: 保存しない',
   v.consentSaveDecision({ existing: LINK, agreed: false, incoming: V5 }), { ok: false, why: 'not_agreed' });
eq('v5 → コネックエフの画面（パスワードの入れ直し）: 版も日時もそのまま',
   v.consentSaveDecision({ existing: V5, agreed: false, incoming: V5 }), { ok: true, version: V5, newlyAgreed: false, previous: null });
eq('★★ v5 → フクエスリンクの画面: 同意済み。版を link-v1 へ下げない',
   v.consentSaveDecision({ existing: V5, agreed: true, incoming: LINK }), { ok: true, version: V5, newlyAgreed: false, previous: null });
eq('link-v1 → フクエスリンクの画面: 同意済み',
   v.consentSaveDecision({ existing: LINK, agreed: false, incoming: LINK }), { ok: true, version: LINK, newlyAgreed: false, previous: null });
eq('はじめて（コネックエフ）', v.consentSaveDecision({ existing: null, agreed: true, incoming: V5 }), { ok: true, version: V5, newlyAgreed: true, previous: null });
eq('はじめて（フクエスリンク）', v.consentSaveDecision({ existing: null, agreed: true, incoming: LINK }), { ok: true, version: LINK, newlyAgreed: true, previous: null });
eq('★ はじめてでチェック無し', v.consentSaveDecision({ existing: null, agreed: false, incoming: V5 }), { ok: false, why: 'not_agreed' });
eq('★★ 古い画面（知らない版）からチェックあり: 画面の読み直しを求める',
   v.consentSaveDecision({ existing: null, agreed: true, incoming: 'v4-2026-09-17' }), { ok: false, why: 'stale_screen' });
eq('★ 古い版（v4）の行 → コネックエフの画面で同意: 取り直しとして残す',
   v.consentSaveDecision({ existing: 'v4-2026-09-17', agreed: true, incoming: V5 }), { ok: true, version: V5, newlyAgreed: true, previous: 'v4-2026-09-17' });
eq('古い画面（知らない版）・同意済みの行: 今までどおり通す（版はそのまま）',
   v.consentSaveDecision({ existing: V5, agreed: false, incoming: 'v4-2026-09-17' }), { ok: true, version: V5, newlyAgreed: false, previous: null });

console.log('\n── 10. 第1287便: コネックエフのホームの帯（読むだけの同意のまま切り替えた店） ──');
const cn = v.conecfConsentNeededNotice(['駅ちか']);
eq('★ 「取り直し」「元どおり」と言わない（まだ1度も送っていない）', cn.title.indexOf('取り直し') >= 0 || cn.body.indexOf('元どおり') >= 0, false);
eq('★ いまの同意の範囲と、直す場所を書く', cn.body.indexOf('読み取りのみ') >= 0 && cn.body.indexOf('ID・パスワード登録') >= 0, true);
eq('★ 名前が無ければ名前のない言い方', v.conecfConsentNeededNotice([]).body.indexOf('いくつかのサイト') >= 0, true);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
