// エステ魂の写メ日記の段（src/lib/esutamaDiaryFlow.ts）の自己点検（第130便・2026-09-04）。
//
// ★★★ ここで守りたいのは4つ。★ どれも「本人のアカウントを守る」ための守り。
//   ① 代理ログインに入ったら【何があっても end_proxy を通す】
//   ② 別の人に入っていたら書かずに戻る（名前を突き合わせる）
//   ③ 空の記事を本人のアカウントから出さない
//   ④ トークンを監査にも note にも残さない
//
//   使い方:  npm run check:esutamadiaryflow

const path = require('path');
const F = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaDiaryFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const ctx = (o) => ({ v: 1, flowId: 'f1', intent: 'diary_push', cookie: 'a=b', startedAt: '2026-09-04T00:00:00Z', ...o });
const res = (status, body) => ({ status, headers: {}, body: body || '' });
const BTN = (id, name, state) => `<button class="btn-proxy-login" data-cast-id="${id}" data-cast-name="${name}" data-cast-state="${state}">x</button>`;
const CTK = '<input type="hidden" name="ctk" value="0123456789abcdef0123456789abcdef">';
const TOKEN_OK = JSON.stringify({ success: true, login_token: 'a'.repeat(64), login_url: 'https://estama.jp/x', expires_at: '2026-09-04 12:49:31' });
const DRAFT = { title: 'こんにちは', content: '今日はありがとうございました。' };

console.log('── 1. 一覧を読む（★ ここでは何も書かない）──');
const r1 = F.afterEsutamaTherapistList(res(200, BTN('757481', 'さら', 'active') + BTN('9', 'x', 'pending') + CTK), ctx({}));
eq('★ 代理ログインできる人だけ返る', [r1.kind, r1.rows.map((x) => x.name)], ['esutama_therapists', ['さら']]);
eq('★ ctk も一緒に返る', r1.ctk, '0123456789abcdef0123456789abcdef');
// ★★★ ここで次を積まない＝エステ魂へ何も飛ばない
eq('★★★ 次を積まない（DBを見ないと相手を決められない）', r1.next, undefined);
// ★★ 0人でも止めない。★ 「まだ誰も始めていない」は故障ではない
eq('★★ 0人でも stop にしない', F.afterEsutamaTherapistList(res(200, CTK), ctx({})).kind, 'esutama_therapists');
eq('★ 読めなければ止める', F.afterEsutamaTherapistList(res(500), ctx({})).kind, 'stop');

console.log('\n── 2. ★★★ トークン（値を残さない）──');
const r2 = F.afterEsutamaDiaryToken(res(200, TOKEN_OK), ctx({ esutamaDiaryCastId: '757481', esutamaDiaryCastName: 'さら' }));
eq('★ 代理ログインへ進む', [r2.kind, r2.next.purpose], ['next', 'esutama_diary_proxy']);
// ★★★ ここから本人のセッション。★ 以降 end_proxy を必ず通す印
eq('★★★ esutamaProxyOpen が立つ', r2.next.context.esutamaProxyOpen, true);
// ★★★ トークンは監査にも note にも出さない
eq('★★★ 監査にトークンが入らない',
   JSON.stringify(r2.audits).includes('a'.repeat(20)), false);
eq('★★★ note にもトークンが入らない', r2.note.includes('a'.repeat(20)), false);
eq('★ 期限は監査に残す', r2.audits[0].detail.expiresAt, '2026-09-04 12:49:31');
// ★ 断られたら理由を返して止まる（★ まだ代理ログインしていないので end_proxy は要らない）
const r2ng = F.afterEsutamaDiaryToken(res(200, JSON.stringify({ success: false, message: '利用中ではありません' })), ctx({}));
eq('★★ 断られたら止まる', [r2ng.kind, r2ng.note.includes('利用中ではありません')], ['stop', true]);

console.log('\n── 3. ★★★ 代理ログインの応答では本人確認できない（第135便）──');
// ★★★ 2026-09-04 実測: 代理ログインの応答は **307**。★ 中継役は追わないので本文が空。
//   ★ ここで本人確認しようとして、名前が合っているのに2回止まった。
//   → **入り口では何も主張しない。** ★ 本人確認は【これから書き込む投稿ページ】で行う。
const r3 = F.afterEsutamaDiaryProxy(res(307, ''), ctx({ esutamaDiaryCastName: 'さら', esutamaProxyOpen: true }));
eq('★★★ 307 でも止まらず投稿ページへ進む', [r3.kind, r3.next.purpose], ['next', 'esutama_diary_page']);
// ★★★ 分からないことを記録に書かない（作法 3-5）。★ 「入りました」と言わない
eq('★★★ 入り口では監査を出さない（まだ何も分かっていない）', r3.audits.length, 0);
eq('★ note には応答だけ書く', r3.note.includes('307'), true);
// ★ 通信そのものが失敗したときは、今までどおり止める
const r3ng = F.afterEsutamaDiaryProxy(res(500), ctx({ esutamaDiaryCastName: 'さら', esutamaProxyOpen: true }));
eq('★★ 入れなかったときは end_proxy を通す', r3ng.next.purpose, 'esutama_diary_end');
eq('★ そのときは記録を残す', r3ng.audits[0].outcome, 'failed');

console.log('\n── 3-b. ★★★ 最後の砦は【投稿ページ】に移した ──');
const PAGE_OK = '<div>【さら】さんにログイン中です</div>' + CTK;
const r3b = F.afterEsutamaDiaryPage(res(200, PAGE_OK), ctx({ esutamaProxyOpen: true, esutamaDiaryCastName: 'さら', esutamaDiaryDraft: DRAFT }));
eq('★ 本人なら投稿へ進む', [r3b.kind, r3b.next.purpose], ['next', 'esutama_diary_post']);
eq('★★ 本人だと確かめてから記録する', r3b.audits[0].outcome, 'ok');
// ★★★ 別人なら書かない。★ 2026-09-04 に道具が「さら」を探して「さくら」を返した
const PAGE_NG = '<div>【さくら】さんにログイン中です</div>' + CTK;
const r3c = F.afterEsutamaDiaryPage(res(200, PAGE_NG), ctx({ esutamaProxyOpen: true, esutamaDiaryCastName: 'さら', esutamaDiaryDraft: DRAFT }));
eq('★★★ 別人なら投稿へ進まない', r3c.next.purpose, 'esutama_diary_end');
eq('★★★ 入った相手の名前を書く', r3c.next.context.esutamaDiaryStopNote.includes('【さくら】'), true);
eq('★★ 記録にも残す', r3c.audits[0].detail.loggedInAs, 'さくら');
// ★★ 表示が無い＝入れていない。★ 人違いとは別の話
const r3d = F.afterEsutamaDiaryPage(res(200, CTK), ctx({ esutamaProxyOpen: true, esutamaDiaryCastName: 'さら', esutamaDiaryDraft: DRAFT }));
eq('★★★ 表示が無ければ書かない', r3d.next.purpose, 'esutama_diary_end');
eq('★★ そのときは「入れていません」と書く', r3d.next.context.esutamaDiaryStopNote.includes('入れていません'), true);
eq('★ 記録は null（別人ではない）', r3d.audits[0].detail.loggedInAs, null);
// ★★★ 本人確認は ctk より先。★ 書く相手が違えば ctk は要らない
const r3e = F.afterEsutamaDiaryPage(res(200, '<div>【さくら】さんにログイン中です</div>'), ctx({ esutamaProxyOpen: true, esutamaDiaryCastName: 'さら', esutamaDiaryDraft: DRAFT }));
eq('★★ 別人なら ctk が無くても人違いとして止める',
   r3e.next.context.esutamaDiaryStopNote.includes('【さくら】'), true);

console.log('\n── 4. ★★★ 空の記事を出さない・ctk が無ければ送らない ──');
const IN = '<div>【さら】さんにログイン中です</div>';
const NAMED = { esutamaProxyOpen: true, esutamaDiaryCastName: 'さら', esutamaDiaryDraft: DRAFT };
const r4 = F.afterEsutamaDiaryPage(res(200, IN + CTK), ctx(NAMED));
eq('★ 中身があれば投稿へ', [r4.kind, r4.next.purpose], ['next', 'esutama_diary_post']);
eq('★★★ 本文が空なら送らず戻る',
   F.afterEsutamaDiaryPage(res(200, IN + CTK), ctx({ ...NAMED, esutamaDiaryDraft: { title: 'a', content: '  ' } })).next.purpose,
   'esutama_diary_end');
eq('★★★ ctk が無ければ送らず戻る',
   F.afterEsutamaDiaryPage(res(200, IN), ctx(NAMED)).next.purpose,
   'esutama_diary_end');
eq('★★ 下書きが無ければ送らず戻る',
   F.afterEsutamaDiaryPage(res(200, IN + CTK), ctx({ esutamaProxyOpen: true, esutamaDiaryCastName: 'さら' })).next.purpose, 'esutama_diary_end');
// ★★ 切ったことを黙らせない
const long = F.afterEsutamaDiaryPage(res(200, IN + CTK), ctx({ ...NAMED, esutamaDiaryDraft: { title: 'あ'.repeat(40), content: 'い'.repeat(2100) } }));
eq('★★ 切ったら監査に残る', long.audits.some((a) => a.event === 'diary_post_clamped'), true);
eq('★★ 切ったら note にも出る', long.note.includes('切りました'), true);

console.log('\n── 5. ★★★ 送ったあとは必ず代理ログインを終える ──');
const r5 = F.afterEsutamaDiaryPost(res(200), ctx({ esutamaProxyOpen: true, esutamaDiaryCastName: 'さら' }));
eq('★★★ 成功でも end_proxy を通す', r5.next.purpose, 'esutama_diary_end');
eq('★★★ 失敗でも end_proxy を通す',
   F.afterEsutamaDiaryPost(res(500), ctx({ esutamaProxyOpen: true })).next.purpose, 'esutama_diary_end');
eq('★ 送れたかは文脈に残す', r5.next.context.esutamaDiaryPosted, true);
// ★★ 成否を決めつけない（読み返しで確かめる）
eq('★★ note で「載った」と言い切らない', r5.note.includes('読み返しで確かめます'), true);

console.log('\n── 6. 終わり方 ──');
eq('★ 送れていれば done',
   F.afterEsutamaDiaryEnd(res(200), ctx({ esutamaDiaryPosted: true, esutamaDiaryCastName: 'さら' })).kind, 'done');
// ★★ 止めた理由があれば done にしない（黙って成功にしない）
eq('★★★ 止めた理由があれば stop で終わる',
   F.afterEsutamaDiaryEnd(res(200), ctx({ esutamaDiaryStopNote: '別の方のアカウント' })).kind, 'stop');
// ★★★ 終われなかったことを黙らせない
const r6 = F.afterEsutamaDiaryEnd(res(500), ctx({ esutamaDiaryPosted: true }));
eq('★★★ 終われなければ止めて知らせる', [r6.kind, r6.note.includes('代理ログイン終了')], ['stop', true]);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
