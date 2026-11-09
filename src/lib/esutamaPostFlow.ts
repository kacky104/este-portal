// エステ魂【オプション】の投稿（リアルタイム集客）を送る流れ（第1811便・2026-11-09）。★ 組み立て・判断は lib/esutamaPost.ts
//
// ★★ 段: esutama_login_page → esutama_login → esutama_post_read（新規投稿の画面を読む）
//          → esutama_post_set（POST /admin_post/realtime_edit）→ esutama_post_verify（一覧を読み直す）→ 終わり
//   ★ intent は bump_push（店舗様が押した）/ bump_auto（周）。文脈の esutamaPost があるとこちらへ来る（esutamaFlow.afterEsutamaLogin）
//   ★ esutama_post_set だけが相手に1件増やす（送り直さない・lib/relayRetry.ts）
//   ★ 結果は outcome.esutamaPost に入れて返す。表（conecf_esutama_posts）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import {
  ESUTAMA_POST_LABEL, buildRealtimePageRequest, buildRealtimePostRequest, parseRealtimeEditPage, parseRealtimeHistoryTop,
  realtimePostResponse, type EsutamaPostKey,
} from './esutamaPost';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

const keyOf = (ctx: RelayFlowContext) => (ctx.esutamaPost?.key ?? 'guest_realtime') as EsutamaPostKey;
const labelOf = (ctx: RelayFlowContext) => ESUTAMA_POST_LABEL[keyOf(ctx)] ?? 'エステ魂の投稿';

function backToLogin(input: Input): boolean {
  return input.status >= 300 && input.status < 400 && String(input.headers['location'] ?? '').includes('/login');
}
function looksLikeLoginPage(body: string): boolean {
  return /post\/login_shop/.test(String(body ?? '')) && !/form-realtime_edit|通知したメッセージの履歴/.test(String(body ?? ''));
}

function finish(ctx: RelayFlowContext, r: { readAt: string; posted: boolean; outcome: string; lastAt?: string | null }, audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'done', audits, note, esutamaPost: { key: keyOf(ctx), readAt: r.readAt, posted: r.posted, outcome: r.outcome, lastAt: r.lastAt ?? null } };
}

/** ログインできたあとの最初の段 */
export function buildEsutamaPostReadStep(cookie: string, ctx: RelayFlowContext) {
  const r = buildRealtimePageRequest(cookie, 'edit');
  return { purpose: 'esutama_post_read' as const, method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } };
}

/** ① 新規投稿の画面を読んだ → 送る */
export function afterEsutamaPostRead(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const key = keyOf(ctx);
  const label = labelOf(ctx);
  const readAt = (nowArg ?? new Date()).toISOString();
  const manual = ctx.esutamaPost?.force === true;
  if (backToLogin(input) || (input.status === 200 && looksLikeLoginPage(input.body))) {
    return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: 'エステ魂にログインできませんでした。メールアドレス・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'login_page', flowId } }], note: label + 'の画面の代わりにログイン画面が返った' };
  }
  if (input.status !== 200) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: http ' + input.status },
      [{ event: 'push_bump', outcome: 'failed', summary: label + 'の画面を読めませんでした', detail: { post: key, httpStatus: input.status, reason: 'http_error', manual, flowId } }], label + 'の画面の応答が ' + input.status);
  }
  const p = parseRealtimeEditPage(input.body);
  if (p.problems.length > 0) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: unparseable' },
      [{ event: 'push_bump', outcome: 'failed', summary: label + 'の画面を読めませんでした', detail: { post: key, reason: 'unparseable', problems: p.problems.slice(0, 4).join(' / '), manual, flowId } }], label + 'の画面を読めなかった: ' + p.problems.join(' / '));
  }
  const title = ctx.esutamaPost?.title ?? '';
  const body = ctx.esutamaPost?.body ?? '';
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  let r;
  try { r = buildRealtimePostRequest(cookie, p, title, body); } catch (e) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: ' + (e as Error).message },
      [{ event: 'push_bump', outcome: 'stopped', summary: label + 'を送りませんでした（' + (e as Error).message + '）', detail: { post: key, reason: 'bad_text', manual, flowId } }], label + 'を送らなかった: ' + (e as Error).message);
  }
  return {
    kind: 'next', audits: [],
    next: { purpose: 'esutama_post_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: { ...ctx, cookie, esutamaPostSentAt: readAt } },
    note: label + 'の画面を読めた → 「' + title + '」を投稿する',
  };
}

/** ② 送った → 一覧を読み直す */
export function afterEsutamaPostSet(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const key = keyOf(ctx);
  const label = labelOf(ctx);
  const readAt = (nowArg ?? new Date()).toISOString();
  const manual = ctx.esutamaPost?.force === true;
  if (backToLogin(input) || input.status >= 400) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: http ' + input.status },
      [{ event: 'push_bump', outcome: 'failed', summary: label + 'を投稿できませんでした', detail: { post: key, httpStatus: input.status, reason: backToLogin(input) ? 'back_to_login' : 'http_error', manual, flowId } }], label + 'を投稿できなかった（' + input.status + '）');
  }
  const res = realtimePostResponse(input.body);
  if (!res.accepted && res.error !== '応答が JSON ではなかった') {
    return finish(ctx, { readAt, posted: false, outcome: 'error: ' + (res.error ?? 'not_accepted') },
      [{ event: 'push_bump', outcome: 'failed', summary: label + 'がエステ魂で受け付けられませんでした（' + (res.error ?? '') + '）', detail: { post: key, reason: 'not_accepted', manual, flowId } }], label + 'が受け付けられなかった: ' + res.error);
  }
  // ★ 受け付けた（または応答の形が分からない）→ 一覧の履歴で確かめる
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const r = buildRealtimePageRequest(cookie, 'list');
  return {
    kind: 'next', audits: [],
    next: { purpose: 'esutama_post_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } },
    note: label + 'を送った（応答: ' + String(input.body ?? '').slice(0, 40).replace(/\s+/g, ' ') + '）。★ 成否は一覧で確かめる',
  };
}

/** ③ 一覧を読み直した → 履歴のいちばん上が今送ったものか */
export function afterEsutamaPostVerify(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const flowId = ctx.flowId;
  const key = keyOf(ctx);
  const label = labelOf(ctx);
  const now = nowArg ?? new Date();
  const readAt = now.toISOString();
  const manual = ctx.esutamaPost?.force === true;
  const title = (ctx.esutamaPost?.title ?? '').trim();
  const sentAt = Date.parse(ctx.esutamaPostSentAt ?? readAt);
  const top = input.status === 200 ? parseRealtimeHistoryTop(input.body) : null;
  // ★ 投稿日時は分まで。送る前に読んだ時刻の分より前でなければ今回のもの
  const fresh = !!top?.at && Date.parse(top.at) >= Math.floor(sentAt / 60000) * 60000 - 60000;
  const same = !!top && (top.title === title || top.title.startsWith(title) || title.startsWith(top.title));
  if (fresh && same) {
    return finish(ctx, { readAt, posted: true, outcome: 'ok', lastAt: readAt },
      [{ event: 'push_bump', outcome: 'ok', summary: label + 'を投稿しました（' + title + '）', detail: { post: key, manual, flowId } }], label + 'を投稿できた（' + title + '）');
  }
  return finish(ctx, { readAt, posted: false, outcome: top ? 'error: not_in_history' : 'error: verify_unreadable' },
    [{ event: 'push_bump', outcome: 'failed', summary: label + 'を送りましたが、エステ魂の履歴で確かめられませんでした', detail: { post: key, reason: top ? 'not_in_history' : 'verify_unreadable', topAt: top?.at ?? '', manual, flowId } }],
    label + 'を送ったが、履歴のいちばん上が今回のものではなかった（' + (top ? top.at + ' ' + top.title : '読めなかった') + '）');
}
