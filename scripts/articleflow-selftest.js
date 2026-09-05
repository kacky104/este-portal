// 駅ちかの新着情報の段（src/lib/articleFlow.ts）の自己点検（第155便・2026-09-05）。
//
// ★★★ ここで危ないのは:
//   ① 枠が入っていないのに進む → **どこを書き換えるか決まっていない**
//   ② 保存の応答で「載った」と言う → ★ 載ったかは読み返しだけが知っている（第136便）
//   ③ 読み返しでタイトルが違うのに「載った」と言う
//   ④ 試し打ちなのに次の段を積む → **1文字も書かない約束が破れる**
//
//   使い方:  npm run check:articleflow

const path = require('path');
const F = require(path.join(__dirname, '..', '_tmpcheck', 'articleFlow.js'));
const RF = require(path.join(__dirname, '..', '_tmpcheck', 'relayFlow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ★ 2026-09-05 に実物から写した形
const PAGE = (title, id) => '<html><body><form action="https://ranking-deli.jp/admin/articles/category5/" method="post" id="article_form">'
  + '<input type="text" name="title" value="' + title + '" class="news_title">'
  + '<textarea name="body">ほんぶん</textarea>'
  + '<select name="girl_id"><option value="5232208" selected>さら</option><option value="5232190">るい</option></select>'
  + '<input type="radio" name="img_flg" value="1"><input type="radio" name="img_flg" value="0" checked="">'
  + '<input type="radio" name="display_flg" value="1" checked=""><input type="radio" name="display_flg" value="0">'
  + '<input type="hidden" name="id" value="' + (id || '266318') + '">'
  + '<input type="hidden" name="g_image1" value="20260905101030">'
  + '<input type="hidden" name="g_image1s" value="20260905101031">'
  + '</form></body></html>';
const LOGIN_PAGE = '<html><body><form action="/admin/login"><input name="login_id"></form></body></html>';

const ctxOf = (o) => Object.assign(
  RF.newFlowContext({ flowId: 'f1', intent: 'article_dryrun', startedAt: '2026-09-05T12:00:00+09:00' }),
  { cookie: 'sid=abc', articleSlot: 5, articleTitle: 'テストのお知らせ', articleBody: '<p>ほんぶん</p>' },
  o || {}
);
const res200 = (body) => ({ status: 200, headers: {}, body });

console.log('── 0. 枠が無ければ進めない ──');
eq('★★★ 枠が無ければ読む段を積まない', F.buildArticleReadStep(ctxOf({ articleSlot: undefined })), null);
eq('★★★ 枠が6でも積まない', F.buildArticleReadStep(ctxOf({ articleSlot: 6 })), null);
{
  const step = F.buildArticleReadStep(ctxOf({}));
  eq('★ 枠5の編集ページを読む', [step.purpose, step.method, step.url],
     ['article_read', 'GET', 'https://ranking-deli.jp/admin/articles/category5/']);
  eq('★ Cookie を付ける', step.headers.cookie, 'sid=abc');
}
eq('★★ 読んだ段でも枠が無ければ止める', F.afterArticleRead(res200(PAGE('x')), ctxOf({ articleSlot: null })).kind, 'stop');

console.log('\n── 1. ★★★ 試し打ちは1文字も書かない ──');
{
  const r = F.afterArticleRead(res200(PAGE('いまのタイトル')), ctxOf({}));
  eq('★★★ 次の段を積まない（＝駅ちかへ何も飛ばない）', r.kind, 'done');
  eq('★★★ next が無い', r.next, undefined);
  // ★★ 第156便: 「ログインできた」は【一覧の段】で記録する。★ ここで二重に出さない
  eq('★★ 編集ページを読めた・組み立てた（login は一覧の段で記録済み）', r.audits.map((a) => a.event + ':' + a.outcome),
     ['read_article:ok', 'plan_article:ok']);
  eq('★★★ login:ok を二重に出さない', r.audits.filter((a) => a.event === 'login').length, 0);
  eq('★★ 記事IDを記録に残す', r.audits[0].detail.articleId, '266318');
  eq('★ 枠も残す', r.audits[1].detail.slot, 5);
  eq('★ 枠の名前も残す', r.audits[1].detail.where, '緊急出勤速報');
  eq('★★ 一覧から受け取った相手の言葉があればそちらを使う',
     F.afterArticleRead(res200(PAGE('x')), ctxOf({ articleWhere: '新人速報' })).audits[0].detail.where, '新人速報');
}

console.log('\n── 2. ★★★ 実弾は保存の段を積む ──');
{
  const r = F.afterArticleRead(res200(PAGE('いまのタイトル')), ctxOf({ intent: 'article_push' }));
  eq('★ 次は保存', [r.kind, r.next.purpose, r.next.method], ['next', 'article_save', 'POST']);
  eq('★ 宛先は同じ枠', r.next.url, 'https://ranking-deli.jp/admin/articles/category5/');
  const f = Object.fromEntries(r.next.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)));
  eq('★★★ 記事IDは読んだものをそのまま', f.id, '266318');
  eq('★★★ 画像の識別子を落とさない', [f.g_image1, f.g_image1s], ['20260905101030', '20260905101031']);
  eq('★★★ 表示を明示する', f.display_flg, '1');
  eq('★ 送るタイトル', f.title, 'テストのお知らせ');
  eq('★★★ 送ったタイトルを持ち回す（読み返しで使う）', r.next.context.articleSentTitle, 'テストのお知らせ');
  eq('★ 女の子は読んだ選択のまま', f.girl_id, '5232208');
}
{
  // ★ 誰の紹介かを指定した場合
  const r = F.afterArticleRead(res200(PAGE('x')), ctxOf({ intent: 'article_push', articleGirlId: '5232190', articleImage: 'girl' }));
  const f = Object.fromEntries(r.next.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)));
  eq('★★ 指定した女の子になる', f.girl_id, '5232190');
  eq('★★ 写真を使うなら img_flg=1', f.img_flg, '1');
}

console.log('\n── 3. ★★★ 送る前に弾く ──');
{
  const long = F.afterArticleRead(res200(PAGE('x')), ctxOf({ intent: 'article_push', articleTitle: 'あ'.repeat(71) }));
  eq('★★★ タイトルが長ければ止める', long.kind, 'stop');
  eq('★ 組み立てられなかったと残す', long.audits[long.audits.length - 1].event + ':' + long.audits[long.audits.length - 1].outcome, 'plan_article:failed');
  eq('★★ それでも「読めた」までは残す', long.audits.map((a) => a.event), ['read_article', 'plan_article']);
  const img = F.afterArticleRead(res200(PAGE('x')), ctxOf({ intent: 'article_push', articleBody: '<p><img src=x></p>' }));
  eq('★★★ 本文に画像があれば止める', img.kind, 'stop');
  const link = F.afterArticleRead(res200(PAGE('x')), ctxOf({ intent: 'article_push', articleBody: '<a href="http://x">x</a>' }));
  eq('★★★ 本文にリンクがあれば止める', link.kind, 'stop');
}

console.log('\n── 4. 読めなかったとき ──');
eq('★★★ ログイン画面へ戻されたらログインの失敗',
   F.afterArticleRead(res200(LOGIN_PAGE), ctxOf({})).audits[0].event + ':' + F.afterArticleRead(res200(LOGIN_PAGE), ctxOf({})).audits[0].outcome, 'login:failed');
eq('★★ 302 でログインへ戻されても同じ',
   F.afterArticleRead({ status: 302, headers: { location: 'https://ranking-deli.jp/admin/login/' }, body: '' }, ctxOf({})).audits[0].event, 'login');
{
  const bad = F.afterArticleRead({ status: 500, headers: {}, body: '' }, ctxOf({}));
  eq('★ 5xx は読み取りの失敗', [bad.kind, bad.audits[0].event, bad.audits[0].detail.reason], ['stop', 'read_article', 'http_error']);
}
{
  const broken = F.afterArticleRead(res200('<html><form id="article_form"></form></html>'), ctxOf({}));
  eq('★★★ 記事IDが読めなければ止める', [broken.kind, broken.audits[0].detail.reason], ['stop', 'parse_failed']);
}

console.log('\n── 5. ★★★ 「送った」と「載った」を分ける ──');
{
  const saved = F.afterArticleSave({ status: 302, headers: { location: 'https://ranking-deli.jp/admin/articles/' }, body: '' },
    ctxOf({ intent: 'article_push', articleSentTitle: 'テストのお知らせ' }));
  eq('★ 次は読み返し', [saved.kind, saved.next.purpose, saved.next.method], ['next', 'article_verify', 'GET']);
  eq('★★★ 送った記録は「送りました」まで', saved.audits.map((a) => a.event + ':' + a.outcome), ['push_article:ok']);
  eq('★★★ 送った段で verify を出さない', saved.audits.some((a) => a.event === 'verify_article'), false);
}
eq('★★ 4xx は送信の失敗',
   F.afterArticleSave({ status: 403, headers: {}, body: '' }, ctxOf({ intent: 'article_push' })).audits[0].event + ':'
   + F.afterArticleSave({ status: 403, headers: {}, body: '' }, ctxOf({ intent: 'article_push' })).audits[0].outcome, 'push_article:failed');
eq('★★ 書き込み中にログインへ戻されたら失敗',
   F.afterArticleSave({ status: 302, headers: { location: '/admin/login/' }, body: '' }, ctxOf({ intent: 'article_push' })).audits[0].detail.reason, 'back_to_login');

console.log('\n── 6. ★★★ 読み返して確かめる ──');
{
  const ok = F.afterArticleVerify(res200(PAGE('テストのお知らせ')), ctxOf({ intent: 'article_push', articleSentTitle: 'テストのお知らせ' }));
  eq('★★★ 送ったタイトルが載っていれば確認できた', [ok.kind, ok.audits[0].event + ':' + ok.audits[0].outcome], ['done', 'verify_article:ok']);
  eq('★ 枠の名前も残す', ok.audits[0].detail.where, '緊急出勤速報');
}
{
  const diff = F.afterArticleVerify(res200(PAGE('別のだれかが書いた')), ctxOf({ intent: 'article_push', articleSentTitle: 'テストのお知らせ' }));
  eq('★★★ タイトルが違えば「確認できた」と言わない', diff.audits[0].outcome, 'stopped');
  eq('★★ 「載っていない」とも言い切らない（別の更新の可能性）', diff.audits[0].detail.reason, 'title_mismatch');
  eq('★ それでも流れは終わる（止めない）', diff.kind, 'done');
}
eq('★★★ 送ったタイトルが文脈に無ければ確かめられない',
   F.afterArticleVerify(res200(PAGE('x')), ctxOf({ intent: 'article_push', articleSentTitle: '' })).audits[0].detail.reason, 'no_sent_title');
eq('★★ 読み返しが読めなければ失敗',
   F.afterArticleVerify({ status: 500, headers: {}, body: '' }, ctxOf({ intent: 'article_push', articleSentTitle: 'x' })).audits[0].detail.reason, 'read_failed');

console.log('\n── 7. ★★ 前後の空白は同じものとして扱う ──');
eq('★ 前後の空白違いは同じとみなす',
   F.afterArticleVerify(res200(PAGE('テストのお知らせ')), ctxOf({ intent: 'article_push', articleSentTitle: ' テストのお知らせ ' })).audits[0].outcome, 'ok');


// ────────────────────────────────────────────────────────────────────────────
console.log('\n── 8. ★★★ 送る前に一覧を読む（第156便） ──');
//
// ★★★ なぜこの段を足したか（2026-09-05・実弾のあと）
//   実弾は【管理画面には入った】。★ しかし公開ページには出なかった。
//   ★ 枠そのものが「非表示」だったから。★ それは編集ページには**書いていない**。
//   → 送る前に一覧を読み、
//       ① 記事が無い枠は先に弾く（上書きするものが無い）
//       ② 非表示の枠でも【勝手に表示へ切り替えない】。★ 記録に残して先へ進む
//     という形にした。

const ROW_HAS = (cat, label, title, btn) =>
  '<tr><td>' + cat + '</td><td>' + label + '</td><td>' + title + '</td>'
  + '<td>2026-09-05<br>13:40:43<br><span>(表示)</span></td>'
  + '<td><input type="submit" name="change_display" value="' + btn + '"></td>'
  + '<td><a href="https://ranking-deli.jp/admin/articles/category' + cat + '/">編集</a></td></tr>';
const ROW_EMPTY = (cat, label) =>
  '<tr><td>' + cat + '</td><td>' + label + '</td><td colspan="2">記事がありません。</td>'
  + '<td><input type="button" name="dammybtn" value="非表示"></td>'
  + '<td><a href="https://ranking-deli.jp/admin/articles/category' + cat + '/">新規</a></td></tr>';
const LIST = (btn5) => '<html><table>'
  + ROW_HAS(1, '速報NEWS', '本日も営業中', '表示')
  + ROW_EMPTY(2, '新人速報')
  + ROW_HAS(3, '激アツ割引情報', '割引中', '表示')
  + ROW_HAS(4, 'イベント速報', '昼割のお知らせ', '表示')
  + ROW_HAS(5, '緊急出勤速報', 'さら緊急出勤', btn5)
  + '</table></html>';

{
  const step = F.buildArticleListStep(ctxOf({}));
  eq('★★ まず一覧を読む', [step.purpose, step.method, step.url],
     ['article_list', 'GET', 'https://ranking-deli.jp/admin/articles/']);
  eq('★ Cookie を付ける', step.headers.cookie, 'sid=abc');
  eq('★★ 本文は空（読むだけ）', step.body, '');
}
eq('★★★ 枠が無ければ一覧の段も積まない', F.buildArticleListStep(ctxOf({ articleSlot: undefined })), null);
eq('★★★ 枠が6でも積まない', F.buildArticleListStep(ctxOf({ articleSlot: 6 })), null);
eq('★★ 一覧の段でも枠が無ければ止める',
   F.afterArticleList(res200(LIST('表示')), ctxOf({ articleSlot: null })).kind, 'stop');

{
  // ★ 表示中の枠 → 次は編集ページ
  const r = F.afterArticleList(res200(LIST('表示')), ctxOf({}));
  // ★★ 第158便: 一覧の段は【読めた事実】を必ず持って返す（kind: 'article_slots'）。
  //   ★ 呼ぶ側が写しを1件だけ上書きで残す。★ next は持っていることも無いこともある
  eq('★★ 次は編集ページを読む', [r.kind, r.next.purpose, r.next.url],
     ['article_slots', 'article_read', 'https://ranking-deli.jp/admin/articles/category5/']);
  eq('★★★ 読めた5枠をそのまま返す（★ 写しに使う）', r.rows.map((x) => x.slot), [1, 2, 3, 4, 5]);
  eq('★★★ ここで初めて「ログインできた」と言える', r.audits.map((a) => a.event + ':' + a.outcome),
     ['login:ok', 'read_article_list:ok']);
  eq('★ 何枠あったかを残す', r.audits[1].detail.slots, 5);
  eq('★ 公開されている枠の数', r.audits[1].detail.shown, 4);
  eq('★ 記事が無い枠の数', r.audits[1].detail.empty, 1);
  eq('★★★ 相手の言葉のカテゴリー名を持ち回す', r.next.context.articleWhere, '緊急出勤速報');
  eq('★★ 表示中なら articleVisible は true', r.next.context.articleVisible, true);
  eq('★★★ この段では1文字も書かない（GET）', r.next.method, 'GET');
}
{
  // ★★★ 非表示の枠 → 止めない。★ でも「非表示」を持ち回して、あとで記録に残す
  const r = F.afterArticleList(res200(LIST('非表示')), ctxOf({}));
  eq('★★ 非表示でも進む（送るのは店舗様が選んだ枠だから）', [r.kind, r.next.purpose], ['article_slots', 'article_read']);
  eq('★★★ 非表示を持ち回す', r.next.context.articleVisible, false);
  eq('★★★ 勝手に「表示」へ切り替えるものを積まない', r.next.method, 'GET');
  eq('★ 添え書きに非表示と出る', /非表示/.test(r.note), true);
}
{
  // ★★★ 第163便: 記事が無い枠でも【新しく作れる】ようになった。
  //   ★ 駅ちかの「新規」は編集ページと同じで、id が空なだけ（2026-09-05 実測）。
  //   ★★ 以前はここで no_article として止めていた（第156便）。★ その必要が無くなった。
  const r = F.afterArticleList(res200(LIST('表示')), ctxOf({ articleSlot: 2 }));
  eq('★★★ 記事が無い枠でも編集ページを読みにいく', [r.kind, r.next.purpose], ['article_slots', 'article_read']);
  eq('★★ 宛先はその枠', r.next.url, 'https://ranking-deli.jp/admin/articles/category2/');
  eq('★★★ 「新しく作る」と添え書きに書く', /新しく作る/.test(r.note), true);
  eq('★★ 読めた事実は落とさない', r.rows.length, 5);
  eq('★★★ もう no_article では止めない', r.audits.some((a) => a.detail && a.detail.reason === 'no_article'), false);
  eq('★★ 一覧は読めているので login:ok は残す', r.audits[0].event + ':' + r.audits[0].outcome, 'login:ok');
}
{
  // ★★ 一覧に無い枠（相手が枠を減らした等）
  const one = '<html><table>' + ROW_HAS(1, '速報NEWS', 'あ', '表示') + '</table></html>';
  const r = F.afterArticleList(res200(one), ctxOf({}));
  eq('★★★ 指定した枠が一覧に無ければ次を積まない', [r.kind, r.next], ['article_slots', undefined]);
  eq('★★ それでも読めた枠は返す', r.rows.length, 1);
  eq('★ 理由を残す', r.audits[r.audits.length - 1].detail.reason, 'slot_not_listed');
}
{
  // ★★★ 0件は「無かった」ではなく【読めなかった】
  const r = F.afterArticleList(res200('<html><body>なにもない</body></html>'), ctxOf({}));
  eq('★★★ 1枠も読めなければ止める', r.kind, 'stop');
  eq('★★★ 「記事が無い」と言わない（読めなかった）', r.audits[0].event + ':' + r.audits[0].outcome, 'read_article_list:failed');
  eq('★★★ 理由は parse_failed', r.audits[0].detail.reason, 'parse_failed');
  eq('★★★ 読めていないので login:ok と言わない', r.audits.some((a) => a.event === 'login'), false);
}
eq('★★★ ログイン画面へ戻されたらログインの失敗',
   F.afterArticleList(res200(LOGIN_PAGE), ctxOf({})).audits[0].event + ':'
   + F.afterArticleList(res200(LOGIN_PAGE), ctxOf({})).audits[0].outcome, 'login:failed');
eq('★★ 302 でログインへ飛ばされても同じ',
   F.afterArticleList({ status: 302, headers: { location: 'https://ranking-deli.jp/admin/login/' }, body: '' }, ctxOf({})).audits[0].detail.reason,
   'back_to_login');
{
  const bad = F.afterArticleList({ status: 500, headers: {}, body: '' }, ctxOf({}));
  eq('★★ 5xx は一覧の読み取りの失敗', [bad.kind, bad.audits[0].event, bad.audits[0].detail.reason],
     ['stop', 'read_article_list', 'http_error']);
}

console.log('\n── 9. ★★★ 非表示の枠に送ったら、そう書く ──');
//
// ★★★ ここが第155便の抜け。★ 管理画面に載っても、枠が非表示なら公開ページには出ない。
//   ★ 「載りました」で終わらせない。★ 店舗様が公開ページを見て「出ていない」と気づく前に、こちらが言う。
{
  const hid = F.afterArticleVerify(res200(PAGE('テストのお知らせ')),
    ctxOf({ intent: 'article_push', articleSentTitle: 'テストのお知らせ', articleVisible: false, articleWhere: '新人速報' }));
  eq('★★ 反映そのものは確認できている', hid.audits[0].outcome, 'ok');
  eq('★★★ 非表示だったことを記録に残す', hid.audits[0].detail.hidden, true);
  eq('★ 相手の言葉で残す', hid.audits[0].detail.where, '新人速報');
}
{
  const shown = F.afterArticleVerify(res200(PAGE('テストのお知らせ')),
    ctxOf({ intent: 'article_push', articleSentTitle: 'テストのお知らせ', articleVisible: true }));
  eq('★★ 表示中なら hidden を立てない', shown.audits[0].detail.hidden, false);
}
{
  // ★★★ 公開状態が【分からない】ときに「非表示です」と言わない
  const unk = F.afterArticleVerify(res200(PAGE('テストのお知らせ')),
    ctxOf({ intent: 'article_push', articleSentTitle: 'テストのお知らせ' }));
  eq('★★★ 分からないときは hidden を立てない（0と不明を混ぜない）', unk.audits[0].detail.hidden, false);
}


console.log('\n── 10. ★★★ 枠の状態を読むだけ（第158便） ──');
//
// ★★★ なぜこの intent を足したか
//   店舗様が文章を登録する【前】に「この枠は非表示です」「この枠はカラです」と言いたい。
//   ★ 2026-09-05 の実弾では、送ってから公開ページに出ていないと分かった。★ 順番を逆にする。
//   ★★ だから **枠を指定しない**（5枠ぜんぶ見る）し、**編集ページも読まない**。
const slotsCtx = (o) => ctxOf(Object.assign({ intent: 'article_slots', articleSlot: undefined }, o || {}));
{
  const step = F.buildArticleListStep(slotsCtx());
  eq('★★★ 枠が無くても一覧の段は積む（★ 5枠ぜんぶ見るため）',
     [step.purpose, step.method, step.url], ['article_list', 'GET', 'https://ranking-deli.jp/admin/articles/']);
}
eq('★★★ 書き換える intent では、枠が無ければ積まない（★ ここは変えていない）',
   F.buildArticleListStep(ctxOf({ articleSlot: undefined })), null);
{
  const r = F.afterArticleList(res200(LIST('非表示')), slotsCtx());
  // ★★ 第160便: 一覧のあとに【編集ページを1枚だけ GET で】開く。★ 選べる人は一覧に無いから。
  //   ★★★ 開くだけ。★ POST は積まない＝1文字も書かない。
  eq('★★★ 次は編集ページの GET（★ 書き込みではない）', [r.next.purpose, r.next.method], ['article_read', 'GET']);
  eq('★★★ 記事のある枠を開く（★ カラの枠を開いても選べる人は読めない）', r.next.context.articleSlot, 1);
  eq('★★ 読めた5枠を返す', r.rows.map((x) => x.slot), [1, 2, 3, 4, 5]);
  eq('★★★ 公開状態もそのまま返す（★ null を false に倒さない）',
     r.rows.map((x) => x.visible), [true, null, true, true, false]);
  eq('★ 記事があるかも返す', r.rows.map((x) => x.hasArticle), [true, false, true, true, true]);
  eq('★ 記録は2行だけ', r.audits.map((a) => a.event + ':' + a.outcome), ['login:ok', 'read_article_list:ok']);
  eq('★★★ 枠を選んでいないので「記事がありません」とは言わない',
     r.audits.some((a) => a.event === 'plan_article'), false);
}
{
  // ★ カラの枠しかなくても、読むだけなら止まらない（★ 上書きしにいかないから）
  const onlyEmpty = '<html><table>' + ROW_EMPTY(2, '新人速報') + ROW_EMPTY(3, '激アツ割引情報') + '</table></html>';
  const r = F.afterArticleList(res200(onlyEmpty), slotsCtx());
  eq('★★★ カラばかりでも読むだけなら止まらない', r.kind, 'article_slots');
  eq('★ 2枠ぶん返る', r.rows.length, 2);
  eq('★★★ 記事のある枠が無ければ編集ページを開かない', r.next, undefined);
}

console.log('\n── 11. ★★★ 選べる人を拾う（第160便） ──');
//
// ★★★ カッキーさんのご質問「投稿と一緒に画像も送れるのか」から。
//   ★ 駅ちかは img_flg=1 + girl_id で【登録済みの人の写真】に切り替わる。
//   ★★ その名前は **相手の編集ページの <select> が出している**。★ 突き合わせは要らない。
{
  const r = F.afterArticleRead(res200(PAGE('いまのタイトル')), slotsCtx({ articleSlot: 5 }));
  eq('★★★ 読むだけなので次を積まない（★ ここまで GET が3回だけ）', r.next, undefined);
  eq('★★ 選べる人を持って返す', r.girls, [{ id: '5232208', name: 'さら' }, { id: '5232190', name: 'るい' }]);
  eq('★★★ 枠の写しは触らない（★ 空配列で上書きすると5枠が消える）', r.rows, undefined);
  eq('★ 記録は読み取り1行だけ', r.audits.map((a) => a.event + ':' + a.outcome), ['read_article:ok']);
  eq('★★ 送る内容は組み立てない（★ そもそも文脈に無い）', r.audits.some((a) => a.event === 'plan_article'), false);
}
eq('★★ 読むだけでも、編集ページが読めなければ止める',
   F.afterArticleRead(res200('<html><body>なにもない</body></html>'), slotsCtx({ articleSlot: 5 })).kind, 'stop');
eq('★★ 1枠も読めなければ、読むだけでも失敗として止める',
   F.afterArticleList(res200('<html></html>'), slotsCtx()).audits[0].event + ':'
   + F.afterArticleList(res200('<html></html>'), slotsCtx()).audits[0].outcome, 'read_article_list:failed');
eq('★★ ログイン画面へ戻されたら、読むだけでもログインの失敗',
   F.afterArticleList(res200(LOGIN_PAGE), slotsCtx()).audits[0].outcome, 'failed');


console.log('\n── 12. ★★★ 画像を先に上げる（第162便） ──');
//
// ★★★ 順番が要（2026-09-05 実測）
//   編集ページ →（画像がある）→ ①上げる → ②切る → 編集ページを読み直す → 保存 → 読み返し
//   ★ 保存に入れる g_image1 / g_image1s は【①②が返した識別子】。★ 読んだページの値は古い。
//
// ★★ 止まらなくなる罠: ②のあと編集ページを読み直すので、
//   ★ 「もう上げた」印（articleImgS）が無いと**永久に上げ続ける**。

const TOKEN = 'a'.repeat(128);
// ★ 実測どおり csrf と shopid は普通の input
const PAGE_WITH_IDS = (title) => PAGE(title).replace('</form>',
  '<input type="hidden" name="fuel_csrf_token" value="' + TOKEN + '">'
  + '<input type="hidden" name="shopid" value="37168"></form>');
const FILE = { bucket: 'therapist-photos', path: 'a/b.jpg', filename: 'x.jpg', contentType: 'image/jpeg', width: 600, height: 800 };
const upCtx = (o) => ctxOf(Object.assign({ intent: 'article_push', articleImage: 'upload', articleFile: FILE }, o || {}));

{
  const r = F.afterArticleRead(res200(PAGE_WITH_IDS('いまのタイトル')), upCtx());
  eq('★★★ 保存より先に画像を上げにいく', [r.kind, r.next.purpose, r.next.method], ['next', 'article_image', 'POST']);
  eq('★ 宛先は実測どおり', r.next.url, 'https://ranking-deli.jp/ajax/admin/article_image.json');
  eq('★★★ 画像そのものは通さない。場所だけ載せる', r.next.multipart.files[0].field, 'upfile');
  eq('★★★ fuel_csrf_token を必ず入れる', r.next.multipart.fields.fuel_csrf_token.length, 128);
  eq('★ shopid も入れる', r.next.multipart.fields.shopid, '37168');
  eq('★★ ajax として送る', r.next.headers['x-requested-with'], 'XMLHttpRequest');
  eq('★★ 読んだ値を持ち回す', [r.next.context.articleCsrf.length, r.next.context.articleShopId], [128, '37168']);
  eq('★★★ この段ではまだ記事を変えていないので push_article を出さない',
     r.audits.some((a) => a.event === 'push_article'), false);
}
eq('★★★ 試し打ちでは画像も上げない（★ 1文字も書かない）',
   F.afterArticleRead(res200(PAGE_WITH_IDS('x')), upCtx({ intent: 'article_dryrun' })).kind, 'done');
eq('★★ 画像を使わない設定なら、いままでどおり保存へ',
   F.afterArticleRead(res200(PAGE_WITH_IDS('x')), ctxOf({ intent: 'article_push' })).next.purpose, 'article_save');
{
  // ★★★ 画像を送る設定なのに在処が無い → **止める**。
  //   ★ このまま保存へ進むと img_flg=0 で識別子が空になり、**いまの画像が消える**。
  const r = F.afterArticleRead(res200(PAGE_WITH_IDS('x')), upCtx({ articleFile: undefined }));
  eq('★★★ 画像の在処が無ければ止める（★ 黙って保存へ進まない）', r.kind, 'stop');
  eq('★ 理由を残す', r.audits[r.audits.length - 1].detail.reason, 'no_file');
  eq('★★★ 「いまの画像が消える」ことを添え書きに書く', /画像が消えます/.test(r.note), true);
}
{
  // ★★★ 二度上げない印
  const r = F.afterArticleRead(res200(PAGE_WITH_IDS('x')), upCtx({ articleImgB: '20260905172422', articleImgS: '20260905172523' }));
  eq('★★★ もう上げ終わっていれば保存へ進む（★ 永久に上げ続けない）', r.next.purpose, 'article_save');
  const f = Object.fromEntries(r.next.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)));
  eq('★★★ 上げた識別子を保存に入れる（★ 読んだページの古い値ではない）',
     [f.g_image1, f.g_image1s], ['20260905172422', '20260905172523']);
  eq('★★★ 独自の画像なので img_flg は 0', f.img_flg, '0');
}
{
  // ★★★ 読めていないページからは送らない（第145便の反省）
  const r = F.afterArticleRead(res200(PAGE('x')), upCtx());   // ★ csrf も shopid も無いページ
  eq('★★★ csrf/shopid が読めなければ止める', r.kind, 'stop');
  eq('★ 理由を残す', r.audits[r.audits.length - 1].detail.reason, 'ids_unreadable');
  eq('★ 画像の記録として残す', r.audits[r.audits.length - 1].event, 'push_article_image');
}

console.log('\n── 13. ★★★ ①上げた応答 ──');
const okImage = JSON.stringify({ src: 'https://cf.example/files/37168/news/img1_20260905172422.jpg', img_b: '20260905172422', img_s: '', err: '' });
const imgCtx = (o) => upCtx(Object.assign({ articleCsrf: TOKEN, articleShopId: '37168', articleWhere: '緊急出勤速報' }, o || {}));
{
  const r = F.afterArticleImage(res200(okImage), imgCtx());
  eq('★★ 次は切り抜き', [r.kind, r.next.purpose, r.next.url],
     ['next', 'article_crop', 'https://ranking-deli.jp/ajax/admin/article_crop.json']);
  eq('★★ 上げられたことを記録に残す', r.audits.map((a) => a.event + ':' + a.outcome), ['push_article_image:ok']);
  eq('★★ うまくいったときも、何を送ったかを残す', r.audits[0].detail.imageType, 'image/jpeg');
  const f = Object.fromEntries(r.next.body.split('&').map((kv) => kv.split('=').map(decodeURIComponent)));
  eq('★★★ 切り抜きは画像ぜんぶ（★ こちらで先に整えている）', [f.x, f.y, f.w, f.h], ['0', '0', '600', '800']);
  eq('★★★ 物差しは実寸（★ 写真の②と同じ理屈・記事では未確認）', [f.sh_w, f.sh_h], ['600', '800']);
  eq('★★ ①が返した識別子をそのまま', f.img_b, '20260905172422');
  eq('★★★ edt_type は実測どおり 2', f.edt_type, '2');
  eq('★ 持ち回す', r.next.context.articleImgB, '20260905172422');
}
{
  // ★★★ 相手が断った ／ 読めなかった を分ける
  const refused = F.afterArticleImage(res200(JSON.stringify({ src: '', img_b: '', img_s: '', err: 'ファイルサイズが大きすぎます' })), imgCtx());
  eq('★★★ 相手が断ったら止める', [refused.kind, refused.audits[0].detail.reason], ['stop', 'refused']);
  eq('★★ 断られた理由は note に残す', /大きすぎます/.test(refused.note), true);
  // ★★★ 第164便: **相手が何と言ったかを記録に残す**。
  //   ★ 2026-09-05 の実弾で refused になったが、理由を残していなかったため何も分からなかった。
  //   ★★ 「静かに失敗させない」は、理由を残して初めて守れる。
  eq('★★★ 相手の言葉を【記録】に残す（★ note だけでは追えない）',
     refused.audits[0].detail.providerError, 'ファイルサイズが大きすぎます');
  // ★★★ 第164便: 「そもそも何を送ったのか」も残す。
  //   ★ カッキーさん「そもそもJPGなのかもわからなくなってきました」——★ 記録が無ければ確かに分からない。
  //   ★★ 種類は【中身から判定したもの】（拡張子ではない）。★ 寸法も実寸
  eq('★★★ 何を送ったかを残す（種類）', refused.audits[0].detail.imageType, 'image/jpeg');
  eq('★★ 何を送ったかを残す（実寸）', [refused.audits[0].detail.imageW, refused.audits[0].detail.imageH], [600, 800]);
  eq('★★ 在処（URL）は入れない（★ 追うのに要らない・秘密落としにも引っかかる）',
     refused.audits[0].detail.url, undefined);
  eq('★★ 長すぎる文は切る', F.afterArticleImage(res200(JSON.stringify({ err: 'あ'.repeat(500) })), imgCtx()).audits[0].detail.providerError.length, 200);
}
{
  // ★★ 読めなかったときも、何が足りなかったかを残す
  const bad = F.afterArticleImage(res200('<html>error</html>'), imgCtx());
  eq('★★ 何が読めなかったかを残す', /JSON/.test(bad.audits[0].detail.missing), true);
  eq('★★ 応答そのものは入れない（★ 何が入っているか分からない）', bad.audits[0].detail.body, undefined);
  eq('★ 長さだけ残す', bad.audits[0].detail.bodyLength, '<html>error</html>'.length);
}
{
  const cropRefused = F.afterArticleCrop(res200(JSON.stringify({ src: '', img_b: '', img_s: '', err: '切り抜けません' })), imgCtx());
  eq('★★★ 切り抜きで断られたときも相手の言葉を残す', cropRefused.audits[0].detail.providerError, '切り抜けません');
}
eq('★★ 読めなかったときは reason が違う',
   F.afterArticleImage(res200('<html>error</html>'), imgCtx()).audits[0].detail.reason, 'parse_failed');
eq('★★ 5xx は失敗',
   F.afterArticleImage({ status: 500, headers: {}, body: '' }, imgCtx()).audits[0].detail.reason, 'http_error');
eq('★★★ 実寸が無ければ切り抜けない（★ 決め打ちしない）',
   F.afterArticleImage(res200(okImage), imgCtx({ articleFile: Object.assign({}, FILE, { width: 0 }) })).audits[0].detail.reason, 'no_size');

console.log('\n── 14. ★★★ ②切った応答 ──');
const okCrop = JSON.stringify({ src: 'https://cf.example/img1s_20260905172523.jpg', src_b: 'https://cf.example/img1_20260905172422.jpg', img_b: '20260905172422', img_s: '20260905172523', err: '' });
{
  const r = F.afterArticleCrop(res200(okCrop), imgCtx({ articleImgB: '20260905172422' }));
  eq('★★★ 編集ページを読み直す（★ そこから保存へ進む）', [r.kind, r.next.purpose, r.next.method],
     ['next', 'article_read', 'GET']);
  eq('★★★ 「もう上げた」印を立てる（★ これが無いと永久に上げ続ける）', r.next.context.articleImgS, '20260905172523');
  eq('★★ ①の識別子も持ち回す', r.next.context.articleImgB, '20260905172422');
  eq('★★★ ここでもまだ「記事に載った」と言わない', r.audits, []);
}
eq('★★★ img_s が返らなければ止める（★ 記事に付けられない）',
   F.afterArticleCrop(res200(JSON.stringify({ src: 'x', img_b: '20260905172422', img_s: '', err: '' })), imgCtx()).audits[0].detail.reason,
   'no_img_s');
eq('★★ 相手が断ったら止める',
   F.afterArticleCrop(res200(JSON.stringify({ src: '', img_b: '', img_s: '', err: 'だめ' })), imgCtx()).audits[0].detail.reason, 'crop_refused');
eq('★★ 5xx は失敗',
   F.afterArticleCrop({ status: 500, headers: {}, body: '' }, imgCtx()).audits[0].detail.reason, 'crop_http_error');
{
  // ★★ ①と②で img_b が食い違ったら①を信じる（★ 上げたのは①）
  const r = F.afterArticleCrop(res200(JSON.stringify({ src: 'x', img_b: '99999999999999', img_s: '20260905172523', err: '' })),
    imgCtx({ articleImgB: '20260905172422' }));
  eq('★★ 食い違ったら①の識別子を採る', r.next.context.articleImgB, '20260905172422');
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
