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
  imageSlotsOf, buildBlogPageRequest, parseBlogEditPage, parseBlogList, buildBlogPostRequest,
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
  return /post\/login_shop/.test(String(body ?? '')) && !/form-realtime_edit|通知したメッセージの履歴|form-job_blog_edit|投稿した求人ブログ|メールマガジン/.test(String(body ?? ''));
}

/** ★ 第1822便: この投稿に付ける画像（リアルタイムは image 1枚・求人ブログは images 3枚まで） */
function imagesOf(ctx: RelayFlowContext): Array<{ path: string; index: number }> {
  const p = ctx.esutamaPost;
  const list = p?.images && p.images.length > 0 ? p.images : (p?.image ? [p.image] : []);
  return list.filter((x) => isEsutamaPostImagePath(x.path));
}

function finish(ctx: RelayFlowContext, r: { readAt: string; posted: boolean; outcome: string; lastAt?: string | null }, audits: FlowAudit[], note: string): FlowOutcome {
  // ★ 画像を付けて投稿できたときだけ、何枚目から使ったかを返す（呼び出し側が次の画像へ進める）
  const urls = ctx.esutamaPostImageUrls ?? (ctx.esutamaPostImageUrl ? [ctx.esutamaPostImageUrl] : []);
  const first = imagesOf(ctx)[0];
  const imageIndex = r.posted && urls.length > 0 && first ? first.index : null;
  return { kind: 'done', audits, note, esutamaPost: { key: keyOf(ctx), readAt: r.readAt, posted: r.posted, outcome: r.outcome, lastAt: r.lastAt ?? null, imageIndex } };
}

/** 投稿の段（切り抜けた画像があればその hidden も足す） */
function postStep(ctx: RelayFlowContext, cookie: string, page: RealtimeEditPage, imageUrls: string[], readAt: string, note: string, imageProblem?: string): FlowOutcome {
  const label = labelOf(ctx);
  const key = keyOf(ctx);
  const title = ctx.esutamaPost?.title ?? '';
  const body = ctx.esutamaPost?.body ?? '';
  const problem = imageProblem ?? ctx.esutamaPostImageProblem;
  let r;
  try {
    r = key === 'job_blog' ? buildBlogPostRequest(cookie, page, title, body, imageUrls) : buildRealtimePostRequest(cookie, page, title, body, imageUrls[0] ?? null, key);
  } catch (e) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: ' + (e as Error).message },
      [{ event: 'push_bump', outcome: 'stopped', summary: label + 'を送りませんでした（' + (e as Error).message + '）', detail: { post: key, reason: 'bad_text', flowId: ctx.flowId } }], label + 'を送らなかった: ' + (e as Error).message);
  }
  return {
    kind: 'next', audits: [],
    next: {
      purpose: 'esutama_post_set', method: r.method, url: r.url, headers: r.headers, body: r.body ?? '',
      context: { ...ctx, cookie, esutamaPostSentAt: readAt, esutamaPostImageUrls: imageUrls, esutamaPostImageUrl: imageUrls[0] ?? undefined, ...(problem ? { esutamaPostImageProblem: problem.slice(0, 120) } : {}) },
    },
    note: note + ' → 「' + title + '」を投稿する' + (imageUrls.length ? '（画像' + imageUrls.length + '枚つき）' : ''),
  };
}

/** ★ 第1822便: 次の画像を仮置きへ上げる。残りが無ければ投稿へ。★ 1枚つまずいても、ほかの画像と投稿は止めない */
function nextImageOrPost(ctx: RelayFlowContext, cookie: string, page: RealtimeEditPage, readAt: string, note: string, problem?: string): FlowOutcome {
  const all = imagesOf(ctx);
  const slots = imageSlotsOf(keyOf(ctx));
  const done = ctx.esutamaPostImgTried ?? 0;
  const urls = ctx.esutamaPostImageUrls ?? [];
  const ctx2: RelayFlowContext = problem ? { ...ctx, esutamaPostImageProblem: problem.slice(0, 120) } : ctx;
  if (done >= all.length || done >= slots.length) return postStep(ctx2, cookie, page, urls, readAt, note);
  const img = all[done];
  // ★ 枠は切り抜けた順に詰める（2枚目が失敗したら3枚目を2つ目の枠へ）
  const slot = slots[Math.min(urls.length, slots.length - 1)];
  try {
    const up = buildRealtimeImageUploadRequest(cookie, page.ctk, relayFileUrl('salon-images', img.path), img.path.split('/').pop() ?? 'image.jpg', keyOf(ctx), slot);
    return {
      kind: 'next', audits: [],
      next: { purpose: 'esutama_post_img_up', method: up.method, url: up.url, headers: up.headers, body: '', multipart: up.multipart, context: { ...ctx2, cookie, esutamaPostPage: page, esutamaPostImgTried: done + 1, esutamaPostImageUrls: urls } },
      note: note + ' → 画像（' + (img.index + 1) + '枚目）をエステ魂の一時置き場へ上げる（★ まだ投稿していない）',
    };
  } catch (e) {
    return nextImageOrPost({ ...ctx2, esutamaPostImgTried: done + 1, esutamaPostImageUrls: urls }, cookie, page, readAt, note, '仮置き前: ' + (e as Error).message);
  }
}

/** ログインできたあとの最初の段 */
export function buildEsutamaPostReadStep(cookie: string, ctx: RelayFlowContext) {
  // ★ 第1817便: メールマガジンは一覧の画面（ctk・brws_shop_id）を読む
  const r = keyOf(ctx) === 'mailmag' ? buildMailPageRequest(cookie) : keyOf(ctx) === 'job_blog' ? buildBlogPageRequest(cookie, 'edit') : buildRealtimePageRequest(cookie, 'edit', keyOf(ctx));
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
  const p = key === 'job_blog' ? parseBlogEditPage(input.body) : parseRealtimeEditPage(input.body, keyOf(ctx));
  if (p.problems.length > 0) {
    return finish(ctx, { readAt, posted: false, outcome: 'error: unparseable' },
      [{ event: 'push_bump', outcome: 'failed', summary: label + 'の画面を読めませんでした', detail: { post: key, reason: 'unparseable', problems: p.problems.slice(0, 4).join(' / '), manual, flowId } }], label + 'の画面を読めなかった: ' + p.problems.join(' / '));
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const page = { ctk: p.ctk, shopId: p.shopId, fields: p.fields, problems: [] as string[] };
  return nextImageOrPost({ ...ctx, esutamaPostImgTried: 0, esutamaPostImageUrls: [] }, cookie, page, readAt, label + 'の画面を読めた');
}

/** ①' 画像を仮置きした → 切り抜く */
export function afterEsutamaPostImgUp(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const readAt = (nowArg ?? new Date()).toISOString();
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const page = ctx.esutamaPostPage as RealtimeEditPage | undefined;
  if (!page) return finish(ctx, { readAt, posted: false, outcome: 'error: no_page' }, [], '投稿の画面の中身が文脈に無い');
  const r = input.status === 200 ? parseCroppicResponse(input.body) : { ok: false, url: null, width: null, height: null, message: 'http ' + input.status };
  if (!r.ok || !r.url) return nextImageOrPost(ctx, cookie, page, readAt, '画像を一時置き場へ上げられなかった（' + r.message + '）', '仮置き: ' + r.message);
  const slots = imageSlotsOf(keyOf(ctx));
  const slot = slots[Math.min((ctx.esutamaPostImageUrls ?? []).length, slots.length - 1)];
  try {
    const c = buildRealtimeImageCropRequest(cookie, page.ctk, { url: r.url, width: r.width, height: r.height }, keyOf(ctx), slot);
    return {
      kind: 'next', audits: [],
      next: { purpose: 'esutama_post_img_crop', method: c.method, url: c.url, headers: c.headers, body: '', multipart: c.multipart, context: { ...ctx, cookie } },
      note: '画像を一時置き場へ上げた（' + r.width + '×' + r.height + '）→ ' + slot.box + '×' + slot.box + ' に切り抜く',
    };
  } catch (e) {
    return nextImageOrPost(ctx, cookie, page, readAt, '画像を切り抜けない（' + (e as Error).message + '）', '切り抜き前: ' + (e as Error).message);
  }
}

/** ②' 切り抜いた → 次の画像か投稿 */
export function afterEsutamaPostImgCrop(input: Input, ctx: RelayFlowContext, nowArg?: Date): FlowOutcome {
  const readAt = (nowArg ?? new Date()).toISOString();
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const page = ctx.esutamaPostPage as RealtimeEditPage | undefined;
  if (!page) return finish(ctx, { readAt, posted: false, outcome: 'error: no_page' }, [], '投稿の画面の中身が文脈に無い');
  const r = input.status === 200 ? parseCroppicResponse(input.body) : { ok: false, url: null, width: null, height: null, message: 'http ' + input.status };
  if (!r.ok || !r.url) return nextImageOrPost(ctx, cookie, page, readAt, '画像を切り抜けなかった（' + r.message + '）', '切り抜き: ' + r.message);
  return nextImageOrPost({ ...ctx, esutamaPostImageUrls: [...(ctx.esutamaPostImageUrls ?? []), r.url] }, cookie, page, readAt, '画像を切り抜いた');
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
  const r = key === 'mailmag' ? buildMailPageRequest(cookie) : key === 'job_blog' ? buildBlogPageRequest(cookie, 'list') : buildRealtimePageRequest(cookie, 'list', keyOf(ctx));
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
  const top = input.status === 200 ? (key === 'mailmag' ? parseMailPage(input.body).top : key === 'job_blog' ? parseBlogList(input.body).top : parseRealtimeHistoryTop(input.body)) : null;
  // ★ 投稿日時は分まで。送る前に読んだ時刻の分より前でなければ今回のもの
  const fresh = !!top?.at && Date.parse(top.at) >= Math.floor(sentAt / 60000) * 60000 - 60000;
  const same = !!top && (top.title === title || top.title.startsWith(title) || title.startsWith(top.title));
  if (fresh && same) {
    return finish(ctx, { readAt, posted: true, outcome: imagesOf(ctx).length > 0 && (ctx.esutamaPostImageUrls ?? []).length === 0 ? (key === 'job_blog' ? 'ok: 画像なし' : 'ok: 画像は前のまま') + (ctx.esutamaPostImageProblem ? '（' + ctx.esutamaPostImageProblem + '）' : '') : 'ok', lastAt: readAt },
      [{ event: 'push_bump', outcome: 'ok', summary: label + 'を投稿しました（' + title + '）', detail: { post: key, manual, flowId } }], label + 'を投稿できた（' + title + '）');
  }
  return finish(ctx, { readAt, posted: false, outcome: top ? 'error: not_in_history' : 'error: verify_unreadable' },
    [{ event: 'push_bump', outcome: 'failed', summary: label + 'を送りましたが、エステ魂の履歴で確かめられませんでした', detail: { post: key, reason: top ? 'not_in_history' : 'verify_unreadable', topAt: top?.at ?? '', manual, flowId } }],
    label + 'を送ったが、履歴のいちばん上が今回のものではなかった（' + (top ? top.at + ' ' + top.title : '読めなかった') + '）');
}
