// ココアの店長ブログ「動画の記事」の段（第1917便・2026-11-10）。★ 判断と要求は lib/cocoaMovie.ts（純粋関数）
//
//   駅ちかに login →（ctx.cocoaMovie があると）
//     cocomov_admin  GET  ranking-deli.jp/admin           … ココアへ入るフォーム（email・password）を読む（読めた＝駅ちかにログインできた）
//     cocomov_login  POST cocoa-job.jp/entry/login/       … ココアの管理画面へ（lid と Cookie をもらう）
//     cocomov_list   GET  /entry/blog/?lid               … いちばん新しい動画の記事を探す
//     cocomov_copy   POST /entry/blog/copy/?lid          … 複製の画面を開く（★ まだ増えない）
//     cocomov_post   POST /entry/blog/copy/?lid          … ★ 投稿（1件増える・送り直さない）
//     cocomov_verify GET  /entry/blog/?lid               … 新しい記事を確かめ、同じタイトルの古い動画の記事を探す
//     cocomov_delete POST /entry/blog/?lid               … ★ 古い記事を1件ずつ消す（送り直さない）
//   ★ ココアの Cookie は ctx.cocoaMovie.ck（駅ちかの Cookie とは分ける）。★ ココアの ID・パスワードは文脈に入れない
//   ★ 結果は outcome.cocoaMovie。表（conecf_cocoa_accounts の movie_*）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { RELAY_USER_AGENT } from './relayUserAgent';
import {
  buildCocoaLogin, buildCocoaList, buildCocoaFollow, buildCocoaCopyOpen, buildCocoaCopySubmit, buildCocoaDelete,
  parseCocoaEntryForm, extractCocoaLid, looksLikeCocoaLoggedOut, parseCocoaBlogList, parseCocoaCopyForm, cocoaPosted, parseCocoaRemaining,
  cocoaMovieDeleteTargets, type CocoaBlogRow,
} from './cocoaMovie';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };
const setCookieOf = (input: Input) => input.headers['set-cookie'] as string | string[] | undefined;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
function looksLikeEkichikaLoginPage(html: string): boolean {
  const h = String(html ?? '');
  if (/<form[^>]+action=["']?(?:https?:\/\/ranking-deli\.jp)?\/admin\/login\/?["'\s>]/i.test(h) && !/cocoa-job\.jp\/entry\/login/.test(h)) return true;
  return /<title>[^<]*\|\s*ログイン\s*<\/title>/i.test(h);
}
type Cm = NonNullable<RelayFlowContext['cocoaMovie']>;
const label = (slot: number) => 'ココア（' + (['', 'A', 'B', 'C'][slot] ?? String(slot)) + '）';

function finish(ctx: RelayFlowContext, r: { done: boolean; outcome: string }, audits: FlowAudit[], note: string): FlowOutcome {
  const m = ctx.cocoaMovie;
  return { kind: 'done', audits, note, cocoaMovie: { done: r.done, outcome: r.outcome, lastAt: r.done ? new Date().toISOString() : null, deleted: m?.deleted ?? 0 } };
}
function fail(ctx: RelayFlowContext, outcome: string, summary: string, httpStatus: number, note: string, event: 'read_bump' | 'push_bump' = 'push_bump'): FlowOutcome {
  return finish(ctx, { done: false, outcome }, [{ event, outcome: 'failed', summary: label(ctx.cocoaMovie?.slot ?? 1) + 'の動画の記事: ' + summary, detail: { opt: 'cocoa_movie', httpStatus, flowId: ctx.flowId } }], note);
}
function next(ctx: RelayFlowContext, purpose: 'cocomov_admin' | 'cocomov_login' | 'cocomov_list' | 'cocomov_copy' | 'cocomov_post' | 'cocomov_verify' | 'cocomov_delete', r: { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: string }, cm: Cm, note: string): FlowOutcome {
  return { kind: 'next', next: { purpose, method: r.method, url: r.url, headers: r.headers, body: r.body, context: { ...ctx, cocoaMovie: cm } }, audits: [], note };
}

/** 駅ちかにログインできたら、管理画面トップを読む */
export function cocoaMovieFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  return {
    kind: 'next',
    next: { purpose: 'cocomov_admin', method: 'GET', url: 'https://ranking-deli.jp/admin', headers: { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer: 'https://ranking-deli.jp/admin', cookie }, body: '', context: { ...ctx, cookie } },
    audits: [], note: 'ログインの応答を受け取った → 駅ちかの管理画面トップを読む（ココアへ入るフォーム）',
  };
}

export function afterCocomovAdmin(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cm = ctx.cocoaMovie!;
  if ((input.status >= 300 && input.status < 400 && /\/admin\/login/.test(locationOf(input))) || (input.status === 200 && looksLikeEkichikaLoginPage(input.body) && !parseCocoaEntryForm(input.body))) {
    return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '駅ちかにログインできませんでした。ログインID・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage: 'cocoa_admin', flowId: ctx.flowId } }], note: '駅ちかのログイン画面に戻された' };
  }
  const form = parseCocoaEntryForm(input.body);
  if (!form) return fail(ctx, 'error: ココアへ入るフォームが無い', '駅ちかの管理画面に、ココアへ入るボタンが見つかりませんでした', input.status, 'ココアへのフォームが無い', 'read_bump');
  // ★ ID・パスワードは要求の本文にだけ入れる（文脈には入れない）
  return next(ctx, 'cocomov_login', buildCocoaLogin(form), { ...cm, ck: '' }, '駅ちかの管理画面を読めた → ココアの管理画面に入る');
}

export function afterCocomovLogin(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cm = ctx.cocoaMovie!;
  const ck = mergeCookies(cm.ck ?? '', setCookieOf(input));
  const lid = extractCocoaLid(locationOf(input), input.body);
  if (!lid) return fail(ctx, 'error: ココアに入れなかった', 'ココアの管理画面に入れませんでした（応答 ' + input.status + '）', input.status, 'lid が取れなかった', 'read_bump');
  return next(ctx, 'cocomov_list', buildCocoaList(ck, lid), { ...cm, ck, lid }, 'ココアの管理画面に入れた → 店長ブログの一覧を読む');
}

export function afterCocomovList(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cm = ctx.cocoaMovie!;
  const ck = mergeCookies(cm.ck ?? '', setCookieOf(input));
  if (input.status !== 200 || looksLikeCocoaLoggedOut(input.body)) return fail(ctx, 'error: 一覧を読めなかった', '店長ブログの一覧を読めませんでした（応答 ' + input.status + '）', input.status, '一覧が読めない', 'read_bump');
  const rows = parseCocoaBlogList(input.body);
  const src = rows.find((r) => r.isMovie);
  if (!src) return fail(ctx, 'no_movie', 'ココアに動画の記事がありません。ココアの管理画面の「動画投稿」で1本投稿してください（あとはその記事を複製して出します）', input.status, '動画の記事が無い');
  return next(ctx, 'cocomov_copy', buildCocoaCopyOpen(ck, cm.lid!, src), { ...cm, ck, sourceId: src.id }, 'いちばん新しい動画の記事（' + src.at + '）を複製する画面を開く');
}

export function afterCocomovCopy(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cm = ctx.cocoaMovie!;
  const ck = mergeCookies(cm.ck ?? '', setCookieOf(input));
  // ★ 複製の応答が行き先（302）だったら、1回だけその画面を読む
  if (input.status >= 300 && input.status < 400 && locationOf(input) && !cm.followed) {
    try {
      return next(ctx, 'cocomov_copy', buildCocoaFollow(ck, cm.lid!, locationOf(input), 'https://cocoa-job.jp/entry/blog/copy/'), { ...cm, ck, followed: true }, '複製の応答が行き先だった → その画面を読む');
    } catch { /* 下で失敗にする */ }
  }
  const form = input.status === 200 ? parseCocoaCopyForm(input.body) : null;
  if (!form) return fail(ctx, 'error: 複製の画面を読めなかった（応答 ' + input.status + (input.status === 200 ? '・フォーム無し' + (/店長ブログ一覧/.test(input.body) ? '・一覧が返った' : '') + (/ログイン/.test(input.body.slice(0, 3000)) ? '・ログイン' : '') : '') + '）', '複製の画面を読み取れませんでした（画面の作りが変わった可能性があります）', input.status, '複製のフォームが無い', 'read_bump');
  const remaining = parseCocoaRemaining(input.body);
  if (remaining !== null && remaining <= 0) return fail(ctx, 'no_count', '今日の残り回数がありません（店長ブログと共通）', input.status, '残り0回');
  return next(ctx, 'cocomov_post', buildCocoaCopySubmit(ck, cm.lid!, form), { ...cm, ck, title: form.title, remaining: remaining ?? undefined }, '複製の画面を読めた（残り ' + (remaining ?? '?') + '回）→ 「' + form.title.slice(0, 20) + '」を投稿する');
}

export function afterCocomovPost(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cm = ctx.cocoaMovie!;
  const ck = mergeCookies(cm.ck ?? '', setCookieOf(input));
  if (input.status >= 400) return fail(ctx, 'error: 投稿の応答 ' + input.status, 'ココアへ投稿できませんでした（応答 ' + input.status + '）', input.status, '投稿の応答が ' + input.status);
  const ok = cocoaPosted(input.body) || (input.status >= 300 && input.status < 400);
  return next(ctx, 'cocomov_verify', buildCocoaList(ck, cm.lid!), { ...cm, ck, postedMsg: ok }, '投稿した（' + (ok ? '「投稿しました」' : '応答 ' + input.status) + '）→ 一覧で確かめる');
}

function deleteStep(ctx: RelayFlowContext, cm: Cm, note: string): FlowOutcome {
  const queue = cm.deleteQueue ?? [];
  if (queue.length === 0) {
    return finish(ctx, { done: true, outcome: (cm.newId ? 'ok: ' : 'ok_unverified: ') + (cm.title ?? '').slice(0, 40) },
      [{ event: 'push_bump', outcome: 'ok', summary: label(cm.slot) + 'に動画の記事「' + (cm.title ?? '').slice(0, 20) + '」を出しました' + (cm.deleted ? '（前の同じ記事 ' + cm.deleted + '件を消しました）' : '') + (cm.newId ? '' : '（一覧ではまだ確かめられていません）') + (cm.remaining !== undefined ? '・残り ' + Math.max(0, cm.remaining - 1) + '回' : ''), detail: { opt: 'cocoa_movie', verified: !!cm.newId, deleted: cm.deleted ?? 0, flowId: ctx.flowId } }],
      note);
  }
  const [row, ...rest] = queue;
  let r;
  try { r = buildCocoaDelete(cm.ck ?? '', cm.lid!, row); } catch { return deleteStep(ctx, { ...cm, deleteQueue: [] }, note + '（消す要求を組めなかったので消さない）'); }
  return next(ctx, 'cocomov_delete', r, { ...cm, deleteQueue: rest }, note + ' → 前の同じ記事（' + row.at + '）を消す');
}

export function afterCocomovVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cm = ctx.cocoaMovie!;
  const ck = mergeCookies(cm.ck ?? '', setCookieOf(input));
  const rows = input.status === 200 ? parseCocoaBlogList(input.body) : [];
  const t = (cm.title ?? '').trim();
  const fresh = rows.find((r) => r.isMovie && Number(r.id) > Number(cm.sourceId ?? 0) && (r.title === t || r.title.startsWith(t + ' ')));
  // ★ 確かめられなくても「出した」扱い（もう一度出すと2件載る）。★ 消すのは新しい記事を確かめられたときだけ
  const targets: CocoaBlogRow[] = fresh ? cocoaMovieDeleteTargets(rows, fresh.id, t) : [];
  return deleteStep(ctx, { ...cm, ck, newId: fresh?.id, deleteQueue: targets, deleted: 0 }, fresh ? '新しい記事を一覧で確かめた' : '一覧では新しい記事を確かめられなかった（消さない）');
}

export function afterCocomovDelete(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cm = ctx.cocoaMovie!;
  const ck = mergeCookies(cm.ck ?? '', setCookieOf(input));
  const ok = input.status < 400;
  return deleteStep(ctx, { ...cm, ck, deleted: (cm.deleted ?? 0) + (ok ? 1 : 0) }, ok ? '前の記事を消した' : '前の記事を消せなかった（応答 ' + input.status + '）');
}
