// 全国エステランキングの「ニュース」「おすすめセラピスト」の段（第1831便・2026-11-09）。★ 判断と要求は lib/zenkokuOption.ts（純粋関数）
//
//   zenkoku_login_page → zenkoku_login →（ctx.zenkokuOpt があると）
//     ニュース:   zenkoku_news_read（GET /shop/news/add/）→ zenkoku_news_set（POST・multipart）→ zenkoku_news_verify（GET /shop/news/ のいちばん上）
//     おすすめ:   zenkoku_rec_read（GET 一覧）→ zenkoku_rec_set（POST ads[]・sorts）→ zenkoku_rec_verify（GET 一覧でチェックを確かめる）
//   ★ 相手を書き換えるのは zenkoku_news_set / zenkoku_rec_set だけ（送り直さない・lib/relayRetry.ts）
//   ★ 結果は outcome.zenkokuOpt に入れて返す。表（conecf_zenkoku_options）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { looksLikeZenkokuLoginPage } from './zenkokuParse';
import { ZENKOKU_GIRLS_URL } from './zenkokuRequests';
import { relayFileUrl } from './relayMultipart';
import {
  ZENKOKU_NEWS_ADD_URL, ZENKOKU_NEWS_URL, ZENKOKU_OPT_LABEL, buildZenkokuGetRequest, buildZenkokuNewsPostRequest, buildZenkokuRecommendSaveRequest,
  isZenkokuNewsImagePath, looksLikeNewsLimit, parseZenkokuNewsForm, parseZenkokuNewsTop, parseZenkokuRecommendPage, pickRecommend, normName,
  type ZenkokuOptKey,
} from './zenkokuOption';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
const isRedirect = (input: Input) => input.status >= 300 && input.status < 400;
const keyOf = (ctx: RelayFlowContext): ZenkokuOptKey => (ctx.zenkokuOpt?.key === 'recommend' ? 'recommend' : 'news');

function loginLost(input: Input): boolean {
  return (isRedirect(input) && /\/login\//.test(locationOf(input))) || (input.status === 200 && looksLikeZenkokuLoginPage(input.body));
}
function loginStop(ctx: RelayFlowContext, input: Input, stage: string): FlowOutcome {
  return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '全国エステランキングにログインできませんでした。ログイン名・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage, flowId: ctx.flowId } }], note: stage + ' でログイン画面に戻された' };
}

function finish(ctx: RelayFlowContext, r: { done: boolean; outcome: string; nextIndex?: number | null; remaining?: number | null }, audits: FlowAudit[], note: string): FlowOutcome {
  const now = new Date().toISOString();
  return {
    kind: 'done', audits, note,
    zenkokuOpt: { key: keyOf(ctx), readAt: ctx.zenkokuOpt?.readAt ?? now, done: r.done, outcome: r.outcome, lastAt: r.done ? now : null, nextIndex: r.nextIndex ?? null, remaining: r.remaining ?? null },
  };
}

/** ログインできたら、種類ごとの最初の画面へ */
export function zenkokuOptFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  const key = keyOf(ctx);
  const readAt = new Date().toISOString();
  const r = key === 'news' ? buildZenkokuGetRequest(cookie, ZENKOKU_NEWS_ADD_URL, ZENKOKU_NEWS_URL) : buildZenkokuGetRequest(cookie, ZENKOKU_GIRLS_URL);
  return {
    kind: 'next',
    next: { purpose: key === 'news' ? 'zenkoku_news_read' : 'zenkoku_rec_read', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie, zenkokuOpt: { ...ctx.zenkokuOpt!, readAt } } },
    audits: [],
    note: '全国エステランキングにログインした → ' + ZENKOKU_OPT_LABEL[key] + 'の画面を読む',
  };
}

// ────────────── ニュース ──────────────

export function afterZenkokuNewsRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loginLost(input)) return loginStop(ctx, input, 'news_read');
  const label = 'ニュース投稿';
  // ★ 5回使い切ると新規投稿の画面から一覧へ戻される
  if ((isRedirect(input) && /\/shop\/news\/?$/.test(locationOf(input).replace(/^https?:\/\/[^/]+/, ''))) || looksLikeNewsLimit(input.body)) {
    return finish(ctx, { done: false, outcome: 'limit' }, [{ event: 'push_bump', outcome: 'failed', summary: '全国エステランキングの' + label + 'は、今日の回数（5回）を使い切っていたため送れませんでした', detail: { opt: 'zenkoku_news', reason: 'limit', flowId: ctx.flowId } }], '今日の5回を使い切っていた');
  }
  if (input.status >= 400 || isRedirect(input)) {
    return finish(ctx, { done: false, outcome: 'error: 画面 ' + input.status }, [{ event: 'read_bump', outcome: 'failed', detail: { opt: 'zenkoku_news', httpStatus: input.status, flowId: ctx.flowId } }], '新規投稿の画面が ' + input.status);
  }
  const form = parseZenkokuNewsForm(input.body);
  if (!form) {
    return finish(ctx, { done: false, outcome: 'error: 投稿の画面の形が違う' }, [{ event: 'read_bump', outcome: 'failed', summary: '全国エステランキングのニュース投稿の画面を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { opt: 'zenkoku_news', reason: 'form_missing', flowId: ctx.flowId } }], '新規投稿のフォームが無い');
  }
  const item = ctx.zenkokuOpt?.item;
  if (!item) return finish(ctx, { done: false, outcome: 'no_items' }, [], '送る中身が無い');
  let imageUrl: string | null = null;
  if (item.image && isZenkokuNewsImagePath(item.image)) {
    try { imageUrl = relayFileUrl('salon-images', item.image); } catch { imageUrl = null; }
  }
  let r;
  try {
    r = buildZenkokuNewsPostRequest(cookie, form, item, imageUrl);
  } catch (e) {
    return finish(ctx, { done: false, outcome: 'error: ' + (e as Error).message }, [], '投稿を組めなかった: ' + (e as Error).message);
  }
  return {
    kind: 'next',
    next: { purpose: 'zenkoku_news_set', method: r.method, url: r.url, headers: r.headers, body: '', multipart: r.multipart, context: { ...ctx, cookie } },
    audits: [{ event: 'read_bump', outcome: 'ok', detail: { opt: 'zenkoku_news', image: imageUrl ? 1 : 0, hidden: Object.keys(form.hidden).length, flowId: ctx.flowId } }],
    note: 'ニュースの画面を読めた → 「' + item.title.slice(0, 20) + '」を投稿する' + (imageUrl ? '（画像つき）' : ''),
  };
}

export function afterZenkokuNewsSet(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loginLost(input)) return loginStop(ctx, input, 'news_set');
  if (input.status >= 400) {
    return finish(ctx, { done: false, outcome: 'error: 投稿の応答 ' + input.status }, [{ event: 'push_bump', outcome: 'failed', summary: '全国エステランキングへニュースを投稿できませんでした（応答 ' + input.status + '）', detail: { opt: 'zenkoku_news', httpStatus: input.status, flowId: ctx.flowId } }], '投稿の応答が ' + input.status);
  }
  // ★ 断られたときは同じ画面（入力エラー）が 200 で返る。題名の欄が残っていて、一覧の表が無ければ断られたとみる
  if (input.status === 200 && parseZenkokuNewsForm(input.body) && !/news-edit\/\d+/.test(input.body)) {
    const msg = (/<div[^>]*class=["'][^"']*(error|alert-danger)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/div>/i.exec(input.body)?.[2] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return finish(ctx, { done: false, outcome: 'error: 断られた' + (msg ? '（' + msg + '）' : '') }, [{ event: 'push_bump', outcome: 'failed', summary: '全国エステランキングがニュースを受け付けませんでした' + (msg ? '（' + msg + '）' : ''), detail: { opt: 'zenkoku_news', reason: 'rejected', flowId: ctx.flowId } }], '投稿が断られた');
  }
  const r = buildZenkokuGetRequest(cookie, ZENKOKU_NEWS_URL, ZENKOKU_NEWS_ADD_URL);
  return { kind: 'next', next: { purpose: 'zenkoku_news_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: '投稿した（' + input.status + '）→ 一覧で確かめる' };
}

/** 'YYYY/MM/DD HH:MM'（日本時間）が今から何分前か */
function minutesAgoJST(created: string): number {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/.exec(created);
  if (!m) return Infinity;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - 9 * 3600 * 1000;
  return (Date.now() - ms) / 60000;
}

export function afterZenkokuNewsVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const item = ctx.zenkokuOpt?.item;
  const top = parseZenkokuNewsTop(input.body);
  const ok = !!top && !!item && normName(top.title) === normName(item.title) && minutesAgoJST(top.created) < 15;
  const title = item?.title ?? '';
  // ★ 確かめられなくても「送れた」扱いにする（投稿の応答はエラーではなかった。もう一度送ると2件載るため）
  return finish(ctx, { done: true, outcome: ok ? 'ok: ' + title.slice(0, 40) : 'ok_unverified: ' + title.slice(0, 40) },
    [{ event: 'push_bump', outcome: 'ok', summary: '全国エステランキングにニュース「' + title.slice(0, 30) + '」を投稿しました' + (ok ? '' : '（一覧ではまだ確かめられていません）'), detail: { opt: 'zenkoku_news', verified: ok, flowId: ctx.flowId } }],
    ok ? 'ニュースを投稿できた（一覧のいちばん上で確かめた）' : 'ニュースを投稿した（一覧では確かめられなかった）');
}

// ────────────── おすすめセラピスト ──────────────

export function afterZenkokuRecRead(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loginLost(input)) return loginStop(ctx, input, 'rec_read');
  if (input.status >= 300) {
    return finish(ctx, { done: false, outcome: 'error: 一覧 ' + input.status }, [{ event: 'read_bump', outcome: 'failed', detail: { opt: 'zenkoku_recommend', httpStatus: input.status, flowId: ctx.flowId } }], 'セラピスト一覧が ' + input.status);
  }
  const page = parseZenkokuRecommendPage(input.body);
  if (!page.formSeen || page.rows.length === 0) {
    return finish(ctx, { done: false, outcome: 'error: 一覧の形が違う' }, [{ event: 'read_bump', outcome: 'failed', summary: '全国エステランキングのセラピスト一覧を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { opt: 'zenkoku_recommend', reason: 'form_missing', flowId: ctx.flowId } }], '一覧の形が違う');
  }
  const items = ctx.zenkokuOpt?.items ?? [];
  const pick = pickRecommend(items, ctx.zenkokuOpt?.nextIndex ?? 0, page);
  if (pick.kind === 'none') {
    return finish(ctx, { done: false, outcome: items.length === 0 ? 'no_items' : 'no_match', remaining: page.remaining },
      [{ event: 'push_bump', outcome: 'failed', summary: '全国エステランキングのおすすめセラピスト: リストの方が全国エステランキングに（公開で）いませんでした（' + pick.skipped.join('・').slice(0, 60) + '）', detail: { opt: 'zenkoku_recommend', reason: 'no_match', flowId: ctx.flowId } }], 'リストの方が向こうにいない');
  }
  if (pick.kind === 'already') {
    // ★ もう入っている＝回数を使わない。今日の分は済んだことにして、次の方へ進める
    return finish(ctx, { done: true, outcome: 'already: ' + pick.row.name, nextIndex: pick.index + 1, remaining: page.remaining }, [], pick.row.name + 'さんはもうおすすめに入っていた');
  }
  if (page.remaining === 0) {
    return finish(ctx, { done: false, outcome: 'no_remaining', remaining: 0 }, [{ event: 'push_bump', outcome: 'failed', summary: '全国エステランキングのおすすめセラピストは、今月の変更回数が残っていませんでした', detail: { opt: 'zenkoku_recommend', reason: 'no_remaining', flowId: ctx.flowId } }], '今月の変更回数が0');
  }
  let r;
  try { r = buildZenkokuRecommendSaveRequest(cookie, page, pick.row.gid); } catch (e) {
    return finish(ctx, { done: false, outcome: 'error: ' + (e as Error).message }, [], '保存を組めなかった');
  }
  return {
    kind: 'next',
    next: { purpose: 'zenkoku_rec_set', method: r.method, url: r.url, headers: r.headers, body: r.body, context: { ...ctx, cookie, zenkokuOpt: { ...ctx.zenkokuOpt!, target: { gid: pick.row.gid, name: pick.row.name, index: pick.index } } } },
    audits: [{ event: 'read_bump', outcome: 'ok', detail: { opt: 'zenkoku_recommend', remaining: page.remaining, skipped: pick.skipped.length, flowId: ctx.flowId } }],
    note: '一覧を読めた（残り ' + (page.remaining ?? '?') + ' 回）→ ' + pick.row.name + 'さんをおすすめにする',
  };
}

export function afterZenkokuRecSet(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loginLost(input)) return loginStop(ctx, input, 'rec_set');
  if (input.status >= 400) {
    return finish(ctx, { done: false, outcome: 'error: 保存の応答 ' + input.status }, [{ event: 'push_bump', outcome: 'failed', summary: '全国エステランキングのおすすめセラピストを保存できませんでした（応答 ' + input.status + '）', detail: { opt: 'zenkoku_recommend', httpStatus: input.status, flowId: ctx.flowId } }], '保存の応答が ' + input.status);
  }
  const r = buildZenkokuGetRequest(cookie, ZENKOKU_GIRLS_URL, ZENKOKU_GIRLS_URL);
  return { kind: 'next', next: { purpose: 'zenkoku_rec_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: '保存した（' + input.status + '）→ 一覧で確かめる' };
}

export function afterZenkokuRecVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const t = ctx.zenkokuOpt?.target;
  const page = parseZenkokuRecommendPage(input.body);
  const row = t ? page.rows.find((r) => r.gid === t.gid) : undefined;
  const ok = !!row && row.checked;
  if (!t) return finish(ctx, { done: false, outcome: 'error: 相手が分からない' }, [], '入れる方が文脈に無い');
  if (!ok) {
    // ★ 保存は届いた（応答はエラーではない）が、チェックが付いていない。回数を使ったかは分からないので、同じ方へもう一度は行かない（次の時刻に任せる）
    return finish(ctx, { done: false, outcome: 'error: ' + t.name + 'さんにチェックが付かなかった', remaining: page.remaining },
      [{ event: 'push_bump', outcome: 'failed', summary: '全国エステランキングのおすすめセラピストを ' + t.name + ' さんにできませんでした（一覧で確かめたらチェックが付いていませんでした）', detail: { opt: 'zenkoku_recommend', reason: 'unverified', flowId: ctx.flowId } }], 'チェックが付いていない');
  }
  return finish(ctx, { done: true, outcome: 'ok: ' + t.name, nextIndex: t.index + 1, remaining: page.remaining },
    [{ event: 'push_bump', outcome: 'ok', summary: '全国エステランキングのおすすめセラピストを ' + t.name + ' さんにしました（今月の残り ' + (page.remaining ?? '?') + ' 回）', detail: { opt: 'zenkoku_recommend', flowId: ctx.flowId } }],
    t.name + 'さんをおすすめにできた');
}
