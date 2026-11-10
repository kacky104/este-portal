// バニラ（qzin.jp）の段（第1903便・2026-11-10）。relayFlow.ts の advanceFlow から呼ばれる。★ 判断と要求は lib/vanillaBlog.ts（純粋関数）
//
//   vanilla_login（POST /entry/・認証情報は DB 側が入れる）→ 応答の Location からログインの印（entry_sid・entry_time）を拾う
//     接続テストなど:   vanilla_top（GET 管理画面トップ）→ 終わり（読めた＝ログインできた）
//     店長ブログ:       vanilla_blog_form（GET 新規投稿）→ vanilla_blog_confirm（POST・確認画面へ・まだ載らない）
//                       → vanilla_blog_post（POST・ここで載る）→ vanilla_blog_list（GET 一覧で確かめる）
//                       →（前にコネックエフが出した記事があれば）vanilla_blog_delete（POST・1本消す）→ 終わり
//   ★ 相手を書き換えるのは vanilla_blog_post・vanilla_blog_delete だけ（送り直さない・lib/relayRetry.ts）
//   ★ 結果は outcome.vanillaBlog に入れて返す。表（conecf_vanilla_blog）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { relayFileUrl } from './relayMultipart';
import {
  buildVanillaBlogConfirmRequest, buildVanillaBlogDeleteRequest, buildVanillaBlogPostRequest, buildVanillaGetRequest,
  findPostedVanillaBlog, isVanillaBlogImagePath, looksLikeVanillaBlogForm, looksLikeVanillaLoginPage, looksLikeVanillaTop,
  parseVanillaBlogConfirm, parseVanillaBlogList, readVanillaSession, vanillaErrorText, vanillaUrl,
  type VanillaSession,
} from './vanillaBlog';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
const isRedirect = (input: Input) => input.status >= 300 && input.status < 400;

/** ログインが切れている（ログイン画面が返った／ログイン画面へ戻された） */
function loginLost(input: Input): boolean {
  if (isRedirect(input)) {
    const loc = locationOf(input).replace(/^https?:\/\/[^/]+/, '');
    if (/^\/entry\/?(\?|$)/.test(loc) || /login/i.test(loc) && !/entry_sid=/.test(loc)) return true;
  }
  return input.status === 200 && looksLikeVanillaLoginPage(input.body);
}
function loginStop(ctx: RelayFlowContext, input: Input, stage: string): FlowOutcome {
  return {
    kind: 'stop',
    audits: [{ event: 'login', outcome: 'failed', summary: 'バニラにログインできませんでした。ログインID・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage, flowId: ctx.flowId } }],
    note: stage + ' でログイン画面に戻された',
  };
}

function sessionOf(ctx: RelayFlowContext): VanillaSession | null {
  return ctx.vanilla && ctx.vanilla.sid && ctx.vanilla.time ? { sid: ctx.vanilla.sid, time: ctx.vanilla.time } : null;
}

function finish(ctx: RelayFlowContext, r: { done: boolean; outcome: string; blogId?: string | null; deleted?: boolean }, audits: FlowAudit[], note: string): FlowOutcome {
  const now = new Date().toISOString();
  const vb = ctx.vanillaBlog;
  return {
    kind: 'done', audits, note,
    vanillaBlog: {
      readAt: vb?.readAt ?? now,
      done: r.done,
      outcome: r.outcome,
      lastAt: r.done ? now : null,
      nextIndex: r.done && vb ? vb.index + 1 : null,
      blogId: r.blogId ?? null,
      deleted: r.deleted === true,
    },
  };
}

// ────────────── ① ログイン ──────────────

export function afterVanillaLogin(input: Input, ctx: RelayFlowContext): FlowOutcome {
  if (input.status >= 400) {
    return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: 'バニラにログインできませんでした（応答 ' + input.status + '）', detail: { httpStatus: input.status, reason: 'http_error', flowId: ctx.flowId } }], note: 'バニラのログインの応答が ' + input.status };
  }
  const session = readVanillaSession(locationOf(input), input.body);
  if (!session) {
    const rejected = looksLikeVanillaLoginPage(input.body) || (isRedirect(input) && !/entry_sid=/.test(locationOf(input)));
    return {
      kind: 'stop',
      audits: [{
        event: 'login', outcome: 'failed',
        summary: rejected ? 'バニラにログインできませんでした。ログインID・パスワードをご確認ください' : 'バニラにログインできませんでした（ログインのあとの画面の形が違いました）',
        detail: { httpStatus: input.status, reason: rejected ? 'rejected' : 'no_session', flowId: ctx.flowId },
      }],
      note: rejected ? 'バニラのログインが断られた' : 'ログインの印（entry_sid）が見つからない',
    };
  }
  const cookie = cookieOf(input, ctx);
  const next: RelayFlowContext = { ...ctx, cookie, vanilla: session };
  if (ctx.vanillaBlog) {
    const r = buildVanillaGetRequest('blog', session, cookie);
    const readAt = new Date().toISOString();
    return {
      kind: 'next',
      next: { purpose: 'vanilla_blog_form', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...next, vanillaBlog: { ...ctx.vanillaBlog, readAt } } },
      audits: [], note: 'バニラにログインした → 店長ブログの新規投稿の画面を読む',
    };
  }
  const r = buildVanillaGetRequest('top', session, cookie, 'https://qzin.jp/entry/');
  return { kind: 'next', next: { purpose: 'vanilla_top', method: r.method, url: r.url, headers: r.headers, body: '', context: next }, audits: [], note: 'バニラのログインの応答を受けた（' + input.status + '）→ 管理画面のトップを読む' };
}

export function afterVanillaTop(input: Input, ctx: RelayFlowContext): FlowOutcome {
  if (loginLost(input) || !looksLikeVanillaTop(input.body)) {
    if (input.status === 200 && !looksLikeVanillaLoginPage(input.body) && /店長ブログ|店舗管理/.test(input.body)) {
      // ★ ログアウトの道が見つからなくても、管理画面の言葉があれば入れている
    } else {
      return loginStop(ctx, input, 'top');
    }
  }
  return { kind: 'done', audits: [{ event: 'login', outcome: 'ok', summary: 'バニラにログインできました', detail: { flowId: ctx.flowId } }], note: 'バニラの管理画面のトップを読めた' };
}

// ────────────── ② 店長ブログ ──────────────

export function afterVanillaBlogForm(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  const s = sessionOf(ctx);
  if (loginLost(input) || !s) return loginStop(ctx, input, 'blog_form');
  const vb = ctx.vanillaBlog;
  if (!vb) return finish(ctx, { done: false, outcome: 'no_items' }, [], '送る記事が無い');
  if (input.status >= 300 || !looksLikeVanillaBlogForm(input.body)) {
    return finish(ctx, { done: false, outcome: 'error: 投稿の画面の形が違う（' + input.status + '）' },
      [{ event: 'read_bump', outcome: 'failed', summary: 'バニラの店長ブログの投稿画面を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { opt: 'vanilla_blog', httpStatus: input.status, reason: 'form_missing', flowId: ctx.flowId } }],
      '新規投稿のフォームが無い');
  }
  let imageUrl: string | null = null;
  if (vb.item.image && isVanillaBlogImagePath(vb.item.image)) {
    // ★ バニラの画像は 300×300・500KB まで。取りに来た口で 300×300 に切って JPEG にする（元の画像は触らない）
    try { imageUrl = relayFileUrl('salon-images', vb.item.image, { fit: 'cover', w: 300, h: 300, pos: 'center', as: 'jpeg' }); } catch { imageUrl = null; }
  }
  let r;
  try { r = buildVanillaBlogConfirmRequest(s, cookie, vb.item, imageUrl); } catch (e) {
    return finish(ctx, { done: false, outcome: 'error: ' + (e as Error).message }, [], '確認画面へ送る形を組めなかった: ' + (e as Error).message);
  }
  return {
    kind: 'next',
    next: { purpose: 'vanilla_blog_confirm', method: r.method, url: r.url, headers: r.headers, body: '', multipart: r.multipart, context: { ...ctx, cookie } },
    audits: [{ event: 'login', outcome: 'ok', summary: 'バニラにログインできました', detail: { flowId: ctx.flowId } }],
    note: '投稿の画面を読めた → 「' + vb.item.title.slice(0, 20) + '」を確認画面へ' + (imageUrl ? '（画像つき）' : ''),
  };
}

export function afterVanillaBlogConfirm(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  const s = sessionOf(ctx);
  if (loginLost(input) || !s) return loginStop(ctx, input, 'blog_confirm');
  const hidden = input.status === 200 ? parseVanillaBlogConfirm(input.body) : null;
  if (!hidden) {
    const msg = vanillaErrorText(input.body);
    return finish(ctx, { done: false, outcome: 'error: 確認画面に進めなかった' + (msg ? '（' + msg + '）' : '') },
      [{ event: 'push_bump', outcome: 'failed', summary: 'バニラが店長ブログを受け付けませんでした' + (msg ? '（' + msg + '）' : '（確認画面に進めませんでした）'), detail: { opt: 'vanilla_blog', httpStatus: input.status, reason: 'confirm_rejected', flowId: ctx.flowId } }],
      '確認画面が出なかった');
  }
  let r;
  try { r = buildVanillaBlogPostRequest(s, cookie, hidden); } catch (e) {
    return finish(ctx, { done: false, outcome: 'error: ' + (e as Error).message }, [], '投稿を組めなかった: ' + (e as Error).message);
  }
  return {
    kind: 'next',
    next: { purpose: 'vanilla_blog_post', method: r.method, url: r.url, headers: r.headers, body: '', multipart: r.multipart, context: { ...ctx, cookie } },
    audits: [], note: '確認画面を読めた' + (hidden.tmp_img ? '（画像つき）' : '') + ' → 投稿する',
  };
}

export function afterVanillaBlogPost(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  const s = sessionOf(ctx);
  if (loginLost(input) || !s) return loginStop(ctx, input, 'blog_post');
  if (input.status >= 400) {
    return finish(ctx, { done: false, outcome: 'error: 投稿の応答 ' + input.status },
      [{ event: 'push_bump', outcome: 'failed', summary: 'バニラへ店長ブログを投稿できませんでした（応答 ' + input.status + '）', detail: { opt: 'vanilla_blog', httpStatus: input.status, flowId: ctx.flowId } }],
      '投稿の応答が ' + input.status);
  }
  const r = buildVanillaGetRequest('list', s, cookie, vanillaUrl('blog', s));
  return { kind: 'next', next: { purpose: 'vanilla_blog_list', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: '投稿した（' + input.status + '）→ 一覧で確かめる' };
}

export function afterVanillaBlogList(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  const s = sessionOf(ctx);
  const vb = ctx.vanillaBlog;
  const title = vb?.item.title ?? '';
  const list = parseVanillaBlogList(input.body);
  const posted = list.seen ? findPostedVanillaBlog(list.rows, title, vb?.prevId ? [vb.prevId] : []) : null;
  if (!posted) {
    // ★ 確かめられなくても「出せた」扱いにする（投稿の応答はエラーではなかった。もう一度出すと2本載るため）。★ 前の記事は消さない
    return finish(ctx, { done: true, outcome: 'ok_unverified: ' + title.slice(0, 40) },
      [{ event: 'push_bump', outcome: 'ok', summary: 'バニラに店長ブログ「' + title.slice(0, 30) + '」を投稿しました（一覧ではまだ確かめられていません）', detail: { opt: 'vanilla_blog', verified: false, flowId: ctx.flowId } }],
      '投稿した（一覧では確かめられなかった・前の記事は消していない）');
  }
  const prev = vb?.deleteOld && vb.prevId && vb.prevId !== posted.id ? list.rows.find((r) => r.id === vb.prevId) : undefined;
  if (prev && s && list.token) {
    let r;
    try { r = buildVanillaBlogDeleteRequest(s, cookie, list.token, prev.id); } catch { r = null; }
    if (r) {
      return {
        kind: 'next',
        next: { purpose: 'vanilla_blog_delete', method: r.method, url: r.url, headers: r.headers, body: '', multipart: r.multipart, context: { ...ctx, cookie, vanillaBlog: { ...vb!, newId: posted.id } } },
        audits: [{ event: 'push_bump', outcome: 'ok', summary: 'バニラに店長ブログ「' + title.slice(0, 30) + '」を投稿しました', detail: { opt: 'vanilla_blog', verified: true, blogId: posted.id, flowId: ctx.flowId } }],
        note: '一覧で確かめた（' + posted.id + '）→ 前の記事（' + prev.id + '）を消す',
      };
    }
  }
  return finish(ctx, { done: true, outcome: 'ok: ' + title.slice(0, 40), blogId: posted.id },
    [{ event: 'push_bump', outcome: 'ok', summary: 'バニラに店長ブログ「' + title.slice(0, 30) + '」を投稿しました', detail: { opt: 'vanilla_blog', verified: true, blogId: posted.id, flowId: ctx.flowId } }],
    '投稿できた（一覧で確かめた・' + posted.id + '）');
}

export function afterVanillaBlogDelete(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const vb = ctx.vanillaBlog;
  const title = vb?.item.title ?? '';
  const newId = vb?.newId ?? null;
  const list = parseVanillaBlogList(input.body);
  const gone = input.status < 400 && list.seen && !list.rows.some((r) => r.id === vb?.prevId);
  // ★ 新しい記事は出せている。消せなかったときも「出せた」で終わる（記録には残す）
  return finish(ctx, { done: true, outcome: (gone ? 'ok: ' : 'ok_not_deleted: ') + title.slice(0, 40), blogId: newId, deleted: gone },
    gone ? [] : [{ event: 'push_bump', outcome: 'failed', summary: 'バニラの店長ブログで、前の記事を消せたか確かめられませんでした（新しい記事は投稿できています）', detail: { opt: 'vanilla_blog', reason: 'delete_unverified', httpStatus: input.status, flowId: ctx.flowId } }],
    gone ? '前の記事を消した' : '前の記事を消せたか確かめられなかった');
}
