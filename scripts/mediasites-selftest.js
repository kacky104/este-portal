// 媒体サイトの表と見せ方（src/lib/mediaSites.ts）の自己点検（第63便・㉞ その5）。
//
// ★★★ ここで危ないのは【送れないものを送れると見せること】。
//   ★ 読めないサイトを「取り込んでいます」と見せる
//   ★ 読み込めていないだけなのに「未登録」と言い切る
//   この2つを、対になる主張で押さえる。
//
//   使い方:  npm run check:mediasites

const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaSites.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const site = (o) => Object.assign(
  { provider: 'x', name: 'テスト', can: ['work'], slots: 2, readable: false, accepting: false, notYet: '', idLabel: '', idHint: '' },
  o || {}
);


// ── ★★ stageNote（いまどこまでできるか・第80便）──
// ★ accepting が false のサイトは notYet を出すので、stageNote は空であること
//   （2つ同時に出すと、どちらを読めばよいか分からなくなる）
eq('★ 受け付けていないサイトに stageNote を書かない',
  v.MEDIA_SITES.filter(s => !s.accepting && s.stageNote !== '').length, 0);
// ★ 受け付けていないサイトには理由がある（§185）
eq('受け付けていないサイトには理由がある',
  v.MEDIA_SITES.filter(s => !s.accepting && !s.notYet).length, 0);
// ★ 受け付けているサイトに notYet を残さない（古い理由が出続けるため）
eq('★ 受け付けたら notYet を消す',
  v.MEDIA_SITES.filter(s => s.accepting && s.notYet !== '').length, 0);
// ★ 第82便でエステラブを閉じ直したので、stageNote は空・notYet に理由がある
eq('エステラブは受け付けていない', v.findMediaSite('esulove').accepting, false);
eq('★ 閉じたので stageNote は空', v.findMediaSite('esulove').stageNote, '');
eq('駅ちかは段の断りが要らない', v.findMediaSite('ekichika').stageNote, '');


// ── ★★ 店舗IDを預かるか（第81便）──
// ★ エステラブはログインに店舗IDを使わない（実測）。★ 出すとオーナーが「？」になる
eq('★ エステラブは店舗IDを預からない', v.findMediaSite('esulove').needsShopId, false);
// ★ 受け付けていないので画面には出ないが、決めたことは残す
eq('駅ちかは店舗IDを預かる', v.findMediaSite('ekichika').needsShopId, true);
// ★ 預からないサイトでは、欄の見出しも説明も持たない（出さないものに文言を残さない）
eq('★ 預からないサイトに欄の見出しを残さない', v.findMediaSite('esulove').idLabel, '');
eq('★ 預からないサイトに説明を残さない', v.findMediaSite('esulove').idHint, '');
// ★ 預かるサイトには必ず見出しと説明がある（空欄だけ出さない）
eq('預かるサイトには見出しがある',
  v.MEDIA_SITES.filter((s) => s.needsShopId && (!s.idLabel || !s.idHint)).length, 0);

console.log('── 1. 表そのもの ──');
eq('4サイトある', v.MEDIA_SITES.length, 4);
eq('★ 読めるのは1つだけ（駅ちか）', v.MEDIA_SITES.filter((s) => s.readable).length, 1);
eq('★ 読めるのは駅ちか', v.MEDIA_SITES.find((s) => s.readable).provider, 'ekichika');
// ★ 第80便でエステラブを開けたが、★ 第82便で閉じ直した（403・追記61 §333）。
//   ★ 増やす／減らすときは、ここも一緒に直す
eq('★ いま受け付けているのは駅ちかだけ',
   v.MEDIA_SITES.filter((s) => s.accepting).map((s) => s.provider), ['ekichika']);
// ★★ 受け付けていないサイトには、必ず理由の文がある（黙って押せない口を作らない）
eq('★★ 受け付けないサイトには理由が書いてある',
   v.MEDIA_SITES.filter((s) => !s.accepting).every((s) => s.notYet.length > 0), true);
eq('★ 受け付けているサイトに理由は要らない',
   v.MEDIA_SITES.filter((s) => s.accepting).every((s) => s.notYet === ''), true);
eq('provider が重複していない',
   new Set(v.MEDIA_SITES.map((s) => s.provider)).size, v.MEDIA_SITES.length);

console.log('\n── 2. 送れるもの（カッキーさんの要望・可視化）──');
eq('駅ちかは4つ送れる',
   v.siteCapabilityLabels(v.findMediaSite('ekichika')), ['出勤', 'セラピスト', '写メ日記', '即ヒメ']);
eq('★ エステラブは出勤と写メ日記',
   v.siteCapabilityLabels(v.findMediaSite('esulove')), ['出勤', '写メ日記']);
eq('★★ エステ魂に写メ日記は無い',
   v.siteCapabilityLabels(v.findMediaSite('esutama')), ['出勤']);
eq('★★ 全国エステランキングにも写メ日記は無い',
   v.siteCapabilityLabels(v.findMediaSite('zenkoku')), ['出勤']);
// ★★ 写メ日記が送れるのは2サイトだけ（2026-08-30 カッキーさん確認）
eq('★★ 写メ日記が送れるのは2サイト',
   v.MEDIA_SITES.filter((s) => s.can.includes('diary')).map((s) => s.provider), ['ekichika', 'esulove']);
eq('★ 知らない種別は空文字', v.capabilityLabel('nanika'), '');
eq('★★ 知らない種別は一覧から落とす（「その他」と書かない）',
   v.siteCapabilityLabels({ can: ['work', 'nanika'] }), ['出勤']);

console.log('\n── 3. サイトの引き当て ──');
eq('駅ちかが引ける', v.findMediaSite('ekichika').name, '駅ちか');
eq('★ 知らない provider は null（既定に読み替えない）', v.findMediaSite('unknown'), null);
eq('★ 空文字も null', v.findMediaSite(''), null);
eq('★ 数字を渡しても null', v.findMediaSite(1), null);

console.log('\n── 4. 枠 ──');
eq('駅ちかは3枠', v.mediaSiteSlots(v.findMediaSite('ekichika')), [1, 2, 3]);
eq('エステラブは2枠', v.mediaSiteSlots(v.findMediaSite('esulove')), [1, 2]);
eq('★ 0枠でも1枠は出す（登録の口を消さない）', v.mediaSiteSlots({ slots: 0 }), [1]);
eq('★ 壊れていても1枠', v.mediaSiteSlots({ slots: NaN }), [1]);
eq('★ 多すぎるときは20で止める', v.mediaSiteSlots({ slots: 999 }).length, 20);

console.log('\n── 5. ★★★ 「未登録」と「まだ分からない」を混ぜない ──');
const st = (o) => v.siteLoginStatus(Object.assign({ known: true, rows: [] }, o || {}));
// ★★★ 対になる主張。同じ「行が無い」で、読めたかどうかで答えが割れる
eq('★★ 読めていて行が無い → 未登録', st({ known: true, rows: [] }), 'unregistered');
eq('★★ 読めていなくて行が無い → まだ分からない', st({ known: false, rows: [] }), 'unknown');
// ★★★ もう一組。同じ「止めてある1行」でも割れる
eq('★★ 読めていて全部停止 → 停止中', st({ known: true, rows: [{ isEnabled: false }] }), 'disabled');
eq('★★ 読めていなければ、行があっても分からない',
   st({ known: false, rows: [{ isEnabled: false }] }), 'unknown');
eq('1つでも動いていれば連携中',
   st({ rows: [{ isEnabled: false }, { isEnabled: true }] }), 'enabled');
eq("★ known が 'true' という文字列なら unknown", st({ known: 'true' }), 'unknown');
eq('★ isEnabled が 1 では連携中にしない', st({ rows: [{ isEnabled: 1 }] }), 'disabled');
eq('★ rows が壊れていても落ちない', st({ rows: null }), 'unregistered');

console.log('\n── 5-2. 言い方 ──');
eq('enabled の言い方', v.loginStatusLabel('enabled'), '連携中');
eq('disabled の言い方', v.loginStatusLabel('disabled'), '停止中');
eq('unregistered の言い方', v.loginStatusLabel('unregistered'), '未登録');
eq('unknown の言い方', v.loginStatusLabel('unknown'), 'まだ分かりません');
eq('★ 知らない値は断定しない側へ', v.loginStatusLabel('なにか'), 'まだ分かりません');
// ★★ 「未登録」と書いてよいのは unregistered だけ
eq('★★ unregistered 以外に「未登録」と書かない',
   ['enabled', 'disabled', 'unknown'].some((s) => v.loginStatusLabel(s) === '未登録'), false);

console.log('\n── 6. ★★★ 数えられないものを 0 と書かない ──');
eq('読めていれば数える',
   v.loginTally({ known: true, statuses: ['enabled', 'unregistered', 'unregistered', 'unregistered'] }),
   { enabled: 1, disabled: 0, unregistered: 3, closed: 0 });
// ★★★ 対になる主張。同じ「enabled が無い」でも、読めたかどうかで 0 と null に割れる
eq('★★ 読めていて1つも無ければ 0',
   v.loginTally({ known: true, statuses: ['unregistered'] }), { enabled: 0, disabled: 0, unregistered: 1, closed: 0 });
eq('★★ 読めていなければ null（★ 0 と書かない）',
   v.loginTally({ known: false, statuses: ['enabled'] }), null);
eq("★ known が 'true' という文字列なら null", v.loginTally({ known: 'true', statuses: [] }), null);

console.log('\n── 7. ★★★ 読めないサイトを「取り込んでいます」と見せない ──');
// ★★★ 対になる主張。同じ link_mode 'read' が、サイトによって割れる
eq('★★ 駅ちか＋read → read', v.loginDirection({ readable: true, linkMode: 'read' }), 'read');
eq('★★ エステラブ＋read → send_only（読む口が無い）',
   v.loginDirection({ readable: false, linkMode: 'read' }), 'send_only');
eq('★★ 書くだけのサイトは link_mode が null でも send_only',
   v.loginDirection({ readable: false, linkMode: null }), 'send_only');
eq('write は write', v.loginDirection({ readable: true, linkMode: 'write' }), 'write');
eq('★ write_auto も画面上は write', v.loginDirection({ readable: true, linkMode: 'write_auto' }), 'write');
eq('★ 駅ちかで link_mode が null なら unset', v.loginDirection({ readable: true, linkMode: null }), 'unset');
eq("★ 'none' も unset", v.loginDirection({ readable: true, linkMode: 'none' }), 'unset');
eq('★ readable が 1 では読める側にしない',
   v.loginDirection({ readable: 1, linkMode: 'read' }), 'send_only');

console.log('\n── 7-2. 向きの文 ──');
eq('★★ send_only は「読み取りません」と書く',
   v.loginDirectionText('send_only', 'エステ魂').desc.includes('読み取ることはありません'), true);
eq('★★ send_only では「取り込んでいます」と書かない',
   v.loginDirectionText('send_only', 'エステ魂').title.includes('取り込'), false);
eq('read はサイト名が入る', v.loginDirectionText('read', '駅ちか').title, '駅ちかから取り込んでいます');
eq('★★ unset で「連携しません」と言い切らない',
   v.loginDirectionText('unset', '駅ちか').title, '連携の向きが、まだ決まっていません');
eq('★ 知らない値は unset の文', v.loginDirectionText('なにか', '駅ちか').title,
   v.loginDirectionText('unset', '駅ちか').title);

console.log('\n── 8. 受け付けているか ──');
eq('駅ちかは受け付ける', v.canRegisterSite(v.findMediaSite('ekichika')), true);
// ★★ 第82便で閉じ直した。★ 送り先が無いのに鍵だけ預からない（§185）
eq('★ エステラブは受け付けない（第82便で閉じ直した）',
   v.canRegisterSite(v.findMediaSite('esulove')), false);
// ★ 閉じたなら、理由が書いてあること
eq('★ 閉じた理由が書いてある', v.findMediaSite('esulove').notYet.length > 0, true);
eq('★ 写メ日記は使えることも書く（全部止まったと読ませない）',
   /写メ日記/.test(v.findMediaSite('esulove').notYet), true);
eq('★ エステ魂はまだ受け付けない', v.canRegisterSite(v.findMediaSite('esutama')), false);
eq('★ 全国もまだ受け付けない', v.canRegisterSite(v.findMediaSite('zenkoku')), false);
eq('★ accepting が 1 では受け付けない側に倒す', v.canRegisterSite(site({ accepting: 1 })), false);


// ── ★★★ 7-b. サイト側の都合で使えない（第83便）──
// ★ 第82便でエステラブを閉じ直したあと、画面に【連携中】と【準備中】が同時に出た。
//   ★ 「連携中」が accepting を見ていなかった。★ 送れないのに「連携中」＝§185 の逆
eq('★★ 受け付けていないのに登録が残っていれば site_closed',
   st({ rows: [{ isEnabled: true }], accepting: false }), 'site_closed');
// ★ 受け付けていなくて登録が無ければ、今までどおり「未登録」（エステ魂・全国）
eq('受け付けていなくて登録が無ければ unregistered',
   st({ rows: [], accepting: false }), 'unregistered');
// ★ 受け付けていれば今までどおり
eq('受け付けていれば enabled', st({ rows: [{ isEnabled: true }], accepting: true }), 'enabled');
eq('accepting を渡さなければ今までどおり', st({ rows: [{ isEnabled: true }] }), 'enabled');
// ★★ 「停止中」と混ぜない（あちらは店舗が止めたもの）
eq('★ 停止中とは別の言い方', v.loginStatusLabel('site_closed'), '使えません');
eq('★ 停止中と同じ言葉にしない',
   v.loginStatusLabel('site_closed') === v.loginStatusLabel('disabled'), false);
// ★★ 数え落とさない（合計がサイト数に足りなくなるのは §210 の逆）
eq('★ 使えないものも数える',
   v.loginTally({ known: true, statuses: ['enabled', 'site_closed', 'unregistered', 'unregistered'] }),
   { enabled: 1, disabled: 0, unregistered: 2, closed: 1 });
eq('★★ 4つの合計がサイト数と一致する', (() => {
     const t = v.loginTally({ known: true, statuses: ['enabled', 'site_closed', 'unregistered', 'unregistered'] });
     return t.enabled + t.disabled + t.unregistered + t.closed;
   })(), 4);
// ★ site_closed を enabled に数えない（「連携中 2」になっていた不具合そのもの）
eq('★★ 使えないものを連携中に数えない',
   v.loginTally({ known: true, statuses: ['enabled', 'site_closed'] }).enabled, 1);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
