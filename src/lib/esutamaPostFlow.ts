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
  realtimePostResponse, isEsutamaPostImagePath, buildRealtimeImageUploadRequest, buildRealtimeImageCropRequest, parseCroppicResponse,
  type EsutamaPostKey, type RealtimeEditPage,
  buildMailPageRequest, parseMailPage, buildMailPostRequest,
} from './esutamaPost';
import { relayFileUrl } from './relayMultipart';
// ★ 第1812便: 画像があれば ① esutama_post_img_up（仮置き）→ ② esutama_post_img_crop（切り抜き）→ esutama_post_set（hidden を足して投稿）
//   ★ 画像の段でつまずいたら、画像なし（いまエステ魂に出ている画像のまま）で投稿する（投稿そのものは止めない）。次の画像へは進まない

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
  // ★ 画像を付けて投稿できたときだけ、何枚目を使ったかを返す（呼び出し側が次の画像へ進める）
  const imageIndex = r.posted && ctx.esutamaPostImageUrl && ctx.esutamaPost?.image ? ctx.esutamaPost.image.index : null;
  return { kind: 'done', audits, note, esutamaPost: { key: keyOf(ctx), readAt: r.readAt, posted: r.posted, outcome: r.outcome, lastAt: r.lastAt ?? null, imageIndex } };
}

/** 投稿の段（画像があればその hidden も足す） */
function postStep(ctx: RelayFlowContext, cookie: string, page: RealtimeEditPage, imageUrl: string | null, readAt: string, note: string, imageProblem?: string): FlowOutcome {
  const label = labelOf(ctx);
  const title = ctx.esutamaPost?.title ?? '';
  const body = ctx.esutamaPost?.body ?? '';
  let r;
  try { r = buildRealtimePostRequest(cookie, page, title, body, imageUrl, keyOf(ctx)); } catch (e) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: ' + (e as Error).message },
      [{ event: 'push_bump', outcome: 'stopped', summary: label + 'を送りませんでした（' + (e as Error).message + '）', detail: { post: keyOf(ctx), reason: 'bad_text', flowId: ctx.flowId } }], label + 'を送らなかった: ' + (e as Error).message);
  }
  return {
    kind: 'next', audits: [],
    next: { purpose: 'esutama_post_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: { ...ctx, cookie, esutamaPostSentAt: readAt, esutamaPostImageUrl: imageUrl ?? undefined, ...(imageProblem ? { esutamaPostImageProblem: imageProblem.slice(0, 120) } : {}) } },
    note: note + ' → 「' + title + '」を投稿する' + (imageUrl ? '（画像つき）' : ''),
  };
}

/** ログインできたあとの最初の段 */
export function buildEsutamaPostReadStep(cookie: string, ctx: RelayFlowContext) {
  // ★ 第1817便: メールマガジンは一覧の画面（ctk・brws_shop_id）を読む
  const r = keyOf(ctx) === 'mailmag' ? buildMailPageRequest(cookie) : buildRealtimePageRequest(cookie, 'edit', keyOf(ctx));
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
  if (key === 'mailmag') {
    const m = parseMailPage(input.body);
    if (m.problems.length > 0) {
      return finish(ctx, { readAt, posted: false, outcome: 'error: unparseable' },
        [{ event: 'push_bump', outcome: 'failed', summary: label + 'の画面を読めませんでした', detail: { post: key, reason: 'unparseable', problems: m.problems.slice(0, 4).join(' / '), manual, flowId } }], label + 'の画面を読めなかった: ' + m.problems.join(' / '));
    }
    const ck = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
    let r;
    try { r = buildMailPostRequest(ck, m, ctx.esutamaPost?.title ?? '', ctx.esutamaPost?.body ?? ''); } catch (e) {
      return finish(ctx, { readAt, posted: false, outcome: 'error: ' + (e as Error).message },
        [{ event: 'push_bump', outcome: 'stopped', summary: label + 'を送りませんでした（' + (e as Error).message + '）', detail: { post: key, reason: 'bad_text', manual, flowId } }], label + 'を送らなかった: ' + (e as Error).message);
    }
    return {
      kind: 'next', audits: [],
      next: { purpose: 'esutama_post_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '', context: { ...ctx, cookie: ck, esutamaPostSentAt: readAt } },
      note: label + 'の画面を読めた → 「' + (ctx.esutamaPost?.title ?? '') + '」を配信する',
    };
  }
  const p = parseRealtimeEditPage(input.body, keyOf(ctx));
  if (p.problems.length > 0) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: unparseable' },
      [{ event: 'push_bump', outcome: 'failed', summary: label + 'の画面を読めませんでした', detail: { post: key, reason: 'unparseable', problems: p.problems.slice(0, 4).join(' / '), manual, flowId } }], label + 'の画面を読めなかった: ' + p.problems.join(' / '));
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const page = { ctk: p.ctk, shopId: p.shopId, fields: p.fields, problems: [] as string[] };
  const img = ctx.esutamaPost?.image;
  if (img && isEsutamaPostImagePath(img.path)) {
    try {
      const fileName = (img.path.split('/').pop() ?? 'image.jpg');
      const up = buildRealtimeImageUploadRequest(cookie, p.ctk, relayFileUrl('salon-images', img.path), fileName, keyOf(ctx));
      return {
        kind: 'next', audits: [],
        next: { purpose: 'esutama_post_img_up', method: up.method, url: up.url, headers: up.headers, body: '', multipart: up.multipart, context: { ...ctx, cookie, esutamaPostPage: page } },
        note: label + 'の画面を読めた → 画像（' + (img.index + 1) + '枚目）をエステ魂の一時置き場へ上げる（★ まだ投稿していない）',
      };
    } catch (e) {
      return postStep(ctx, cookie, page, null, readAt, label + 'の画面を読めた（画像は付けられない: ' + (e as Error).message + '）');
    }
  }
  return postStep(ctx, cookie, page, null, readAt, label + 'の画面を読めた');
}

/** ①' 画像を仮置きした → 切り抜く */
export function afterEsutamaPostImgUp(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const readAt = (nowArg ?? new Date()).toISOString();
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const page = ctx.esutamaPostPage as RealtimeEditPage | undefined;
  if (!page) return finish(ctx, { readAt, posted: false, outcome: 'error: no_page' }, [], '投稿の画面の中身が文脈に無い');
  const r = input.status === 200 ? parseCroppicResponse(input.body) : { ok: false, url: null, width: null, height: null, message: 'http ' + input.status };
  if (!r.ok || !r.url) return postStep(ctx, cookie, page, null, readAt, '画像を一時置き場へ上げられなかった（' + r.message + '）。画像なしで', '仮置き: ' + r.message);
  try {
    const c = buildRealtimeImageCropRequest(cookie, page.ctk, { url: r.url, width: r.width, height: r.height }, keyOf(ctx));
    return {
      kind: 'next', audits: [],
      next: { purpose: 'esutama_post_img_crop', method: c.method, url: c.url, headers: c.headers, body: '', multipart: c.multipart, context: { ...ctx, cookie } },
      note: '画像を一時置き場へ上げた（' + r.width + '×' + r.height + '）→ 300×300 に切り抜く',
    };
  } catch (e) {
    return postStep(ctx, cookie, page, null, readAt, '画像を切り抜けない（' + (e as Error).message + '）。画像なしで', '切り抜き前: ' + (e as Error).message);
  }
}

/** ②' 切り抜いた → 投稿 */
export function afterEsutamaPostImgCrop(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const readAt = (nowArg ?? new Date()).toISOString();
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const page = ctx.esutamaPostPage as RealtimeEditPage | undefined;
  if (!page) return finish(ctx, { readAt, posted: false, outcome: 'error: no_page' }, [], '投稿の画面の中身が文脈に無い');
  const r = input.status === 200 ? parseCroppicResponse(input.body) : { ok: false, url: null, width: null, height: null, message: 'http ' + input.status };
  if (!r.ok || !r.url) return postStep(ctx, cookie, page, null, readAt, '画像を切り抜けなかった（' + r.message + '）。画像なしで', '切り抜き: ' + r.message);
  return postStep(ctx, cookie, page, r.url, readAt, '画像を切り抜いた');
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
  const r = key === 'mailmag' ? buildMailPageRequest(cookie) : buildRealtimePageRequest(cookie, 'list', keyOf(ctx));
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
  const top = input.status === 200 ? (key === 'mailmag' ? parseMailPage(input.body).top : parseRealtimeHistoryTop(input.body)) : null;
  // ★ 投稿日時は分まで。送る前に読んだ時刻の分より前でなければ今回のもの
  const fresh = !!top?.at && Date.parse(top.at) >= Math.floor(sentAt / 60000) * 60000 - 60000;
  const same = !!top && (top.title === title || top.title.startsWith(title) || title.startsWith(top.title));
  if (fresh && same) {
    return finish(ctx, { readAt, posted: true, outcome: ctx.esutamaPost?.image && !ctx.esutamaPostImageUrl ? 'ok: 画像は前のまま' + (ctx.esutamaPostImageProblem ? '（' + ctx.esutamaPostImageProblem + '）' : '') : 'ok', lastAt: readAt },
      [{ event: 'push_bump', outcome: 'ok', summary: label + 'を投稿しました（' + title + '）', detail: { post: key, manual, flowId } }], label + 'を投稿できた（' + title + '）');
  }
  return finish(ctx, { readAt, posted: false, outcome: top ? 'error: not_in_history' : 'error: verify_unreadable' },
    [{ event: 'push_bump', outcome: 'failed', summary: label + 'を送りましたが、エステ魂の履歴で確かめられませんでした', detail: { post: key, reason: top ? 'not_in_history' : 'verify_unreadable', topAt: top?.at ?? '', manual, flowId } }],
    label + 'を送ったが、履歴のいちばん上が今回のものではなかった（' + (top ? top.at + ' ' + top.title : '読めなかった') + '）');
}
