// 駅ちかのプラチナムマガジンの段（第1844便・2026-11-09）。★ 判断と要求は lib/ekichikaMagazine.ts（純粋関数）
//
//   login →（ctx.ekichikaMagazine があると）
//     ekimag_form   GET  /admin/platinummagazine/create/ … フォームがある＝ログインできた（隠し項目も拾う）
//     ekimag_post   POST /admin/platinummagazine/store   … ★ 相手を書き換える唯一の要求（送り直さない・lib/relayRetry.ts）
//     ekimag_verify GET  /admin/platinummagazine/        … 同じタイトル・同じ日時の行が出たか
//   ★ 結果は outcome.ekichikaMagazine に入れて返す。表（conecf_ekichika_magazines）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import {
  EKICHIKA_MAGAZINE_CREATE_URL, EKICHIKA_MAGAZINE_LIST_URL, buildMagazineGet, buildMagazineStore,
  looksLikeMagazineForm, parseMagazineHidden, parseMagazineList, magazinePublishAt,
} from './ekichikaMagazine';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };
const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
/** ★ relayFlow.ts の looksLikeEkichikaLoginPage と同じ判定（循環 import を避けて写した） */
function looksLikeEkichikaLoginPage(html: string): boolean {
  const h = String(html ?? '');
  if (/<form[^>]+action=["']?(?:https?:\/\/ranking-deli\.jp)?\/admin\/login\/?["'\s>]/i.test(h)) return true;
  return /<title>[^<]*\|\s*ログイン\s*<\/title>/i.test(h);
}
const loggedOut = (input: Input) => (input.status >= 300 && input.status < 400 && /\/admin\/login/.test(locationOf(input))) || (input.status === 200 && looksLikeEkichikaLoginPage(input.body));

function loginStop(ctx: RelayFlowContext, input: Input, stage: string): FlowOutcome {
  return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '駅ちかにログインできませんでした。ログインID・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage, flowId: ctx.flowId } }], note: stage + ' でログイン画面に戻された' };
}
function finish(ctx: RelayFlowContext, r: { done: boolean; outcome: string }, audits: FlowAudit[], note: string): FlowOutcome {
  const m = ctx.ekichikaMagazine;
  return {
    kind: 'done', audits, note,
    ekichikaMagazine: { index: m?.index ?? 0, done: r.done, outcome: r.outcome, lastAt: r.done ? new Date().toISOString() : null },
  };
}

/** ログインできたら、新規作成の画面を読む */
export function ekichikaMagazineFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  const r = buildMagazineGet(cookie, EKICHIKA_MAGAZINE_CREATE_URL);
  return { kind: 'next', next: { purpose: 'ekimag_form', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: 'ログインの応答を受け取った → マガジンの新規作成の画面を読む（読めた＝ログインできた）' };
}

export function afterEkimagForm(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'magazine_form');
  const m = ctx.ekichikaMagazine;
  if (!m) return finish(ctx, { done: false, outcome: 'error: 中身が無い' }, [], '文脈にマガジンが無い');
  if (input.status >= 300 || !looksLikeMagazineForm(input.body)) {
    return finish(ctx, { done: false, outcome: 'error: 新規作成の画面を読めなかった' }, [{ event: 'read_bump', outcome: 'failed', summary: '駅ちかのプラチナムマガジンの画面を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { opt: 'ekichika_magazine', httpStatus: input.status, flowId: ctx.flowId } }], 'マガジンのフォームが無い');
  }
  const at = magazinePublishAt(new Date());
  let r;
  try { r = buildMagazineStore(cookie, at, { title: m.title, body: m.body }, parseMagazineHidden(input.body)); }
  catch (e) { return finish(ctx, { done: false, outcome: 'error: ' + (e as Error).message }, [], '投稿を組めなかった: ' + (e as Error).message); }
  return {
    kind: 'next',
    next: { purpose: 'ekimag_post', method: r.method, url: r.url, headers: r.headers, body: r.body, context: { ...ctx, cookie, ekichikaMagazine: { ...m, at: at.label } } },
    audits: [], note: '新規作成の画面を読めた → ' + at.label + ' 配信でマガジン「' + m.title.slice(0, 20) + '」を投稿する',
  };
}

export function afterEkimagPost(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'magazine_post');
  if (input.status >= 400) {
    return finish(ctx, { done: false, outcome: 'error: 投稿の応答 ' + input.status }, [{ event: 'push_bump', outcome: 'failed', summary: '駅ちかへプラチナムマガジンを投稿できませんでした（応答 ' + input.status + '）', detail: { opt: 'ekichika_magazine', httpStatus: input.status, flowId: ctx.flowId } }], '投稿の応答が ' + input.status);
  }
  // ★ 200 で同じフォームが返ってきた＝入力のエラーで載っていない（リダイレクトなら受け付けられた）
  if (input.status === 200 && looksLikeMagazineForm(input.body)) {
    const msg = (/<(?:p|div|span|li)[^>]*class=["'][^"']*(?:error|alert|danger|invalid)[^"']*["'][^>]*>([\s\S]{1,200}?)<\//i.exec(input.body)?.[1] ?? '').replace(/<[^>]*>/g, '').trim();
    return finish(ctx, { done: false, outcome: 'error: 入力を受け付けなかった' + (msg ? '（' + msg.slice(0, 60) + '）' : '') }, [{ event: 'push_bump', outcome: 'failed', summary: '駅ちかがプラチナムマガジンの入力を受け付けませんでした' + (msg ? '：' + msg.slice(0, 60) : ''), detail: { opt: 'ekichika_magazine', httpStatus: input.status, flowId: ctx.flowId } }], '入力エラーで同じ画面が返った');
  }
  const r = buildMagazineGet(cookie, EKICHIKA_MAGAZINE_LIST_URL, EKICHIKA_MAGAZINE_CREATE_URL);
  return { kind: 'next', next: { purpose: 'ekimag_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: 'マガジンを投稿した（' + input.status + '）→ 一覧で確かめる' };
}

export function afterEkimagVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const m = ctx.ekichikaMagazine!;
  const rows = parseMagazineList(input.body);
  const found = rows.some((x) => x.title === m.title && (!m.at || x.at === m.at));
  // ★ 確かめられなくても「送れた」扱い（投稿の応答はエラーではなかった。もう一度送ると会員に2通届く）
  return finish(ctx, { done: true, outcome: (found ? 'ok: ' : 'ok_unverified: ') + (m.at ?? '') },
    [{ event: 'push_bump', outcome: 'ok', summary: '駅ちかにプラチナムマガジン「' + m.title.slice(0, 20) + '」を投稿しました（' + (m.at ?? '') + ' 配信）' + (found ? '' : '（一覧ではまだ確かめられていません）'), detail: { opt: 'ekichika_magazine', verified: found, flowId: ctx.flowId } }],
    found ? 'マガジンを投稿できた（一覧で確かめた）' : 'マガジンを投稿した（一覧では確かめられなかった）');
}
