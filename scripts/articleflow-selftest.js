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
  eq('★ ログインできたと読める・編集ページを読めた・組み立てた', r.audits.map((a) => a.event + ':' + a.outcome),
     ['login:ok', 'read_article:ok', 'plan_article:ok']);
  eq('★★ 記事IDを記録に残す', r.audits[1].detail.articleId, '266318');
  eq('★ 枠も残す', r.audits[2].detail.slot, 5);
  eq('★ 枠の名前も残す', r.audits[2].detail.where, '緊急出勤速報');
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
  eq('★★ それでも「読めた」までは残す', long.audits.map((a) => a.event).slice(0, 2), ['login', 'read_article']);
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

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
