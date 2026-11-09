// エステ魂【オプション】の「投稿」をコネックエフから送る（第1811便・2026-11-09・カッキーさんの決定 B）。★ 純粋関数だけ。
//
// ★ まずはリアルタイム集客（guest_realtime）。★ ベンリーで送っていた文章（タイトル・本文）を写して、決めた間隔で投稿する。
// ★ 運営が /admin で ON にした店だけ（conecf_esutama_posts.admin_enabled）。店舗様はコネックエフで文章・自動の ON/OFF・時間を決める。
// ★★★ 実測（2026-11-09 10:50ごろ・オイルクエスト様の管理画面・読んだだけ。投稿はしていない）
//   一覧   GET /admin/guest/realtime/        … 「表示中の新着メッセージ」「通知したメッセージの履歴(最大10件)」（投稿日時 YYYY/MM/DD HH:MM ＋ タイトル）
//          「本日の残り回数 使い放題」
//   新規   GET /admin/guest/realtime/edit/   … <form id="form-realtime_edit">
//            title（30文字以内・必須）/ body（300文字以内・必須）/ default_img（hidden・前回の画像の URL）/ image_delete_0=0
//            add_template（checkbox・テンプレートとして保存する。★ 付けない）/ page=shop / auto_set=0 / table=shop / real_type=shop
//          画像は別フォーム（croppic: /post/uptemp/ → /post/cropping/）。★ この便では画像を送らない（前回の画像 default_img のまま）
//   送る   「投稿する」= .send-post（data-form=realtime_edit, data-post=realtime_edit）
//            → my_post.js の sendPost: POST /admin_post/realtime_edit
//               data = { str: $('#form-realtime_edit').serializeArray(), brws_shop_id: $('#brws_shop_id').val(), ctk: CSRF_TOKEN_VALUE }
//            応答 JSON の [0] が 'OUT' なら入力エラー（[1] に中身）。それ以外（OK / REDIRECT / show / STAY）は受け付け
//          ★ reCAPTCHA はこの送信に入っていない（バッジは画面全体のもの）
// ★★ 投稿は【上書きではなく1件増える】。二度送ると2件載る → esutama_post_set は送り直さない（lib/relayRetry.ts）

import { encodePayload } from './ekichikaWorkParse';
import { RELAY_USER_AGENT } from './relayUserAgent';
import { readEsutamaCsrf } from './esutamaParse';
import { businessMinOf, lastResetAt } from './esutamaOption';
import { assertRelayFileUrl, type RelayMultipart } from './relayMultipart';

export type EsutamaPostKey = 'guest_realtime' | 'job_realtime' | 'mailmag';
export const ESUTAMA_POST_KEYS: EsutamaPostKey[] = ['guest_realtime', 'job_realtime', 'mailmag'];
export const ESUTAMA_POST_LABEL: Record<EsutamaPostKey, string> = { guest_realtime: 'リアルタイム集客', job_realtime: 'リアルタイム求人', mailmag: 'メールマガジン' };
/** ★ 第1817便: メールマガジンは「1日1回・決めた時刻」（ベンリーは毎日 11:47）。リアルタイムは「間隔ごと」 */
export const isDailyPostKey = (key?: string) => key === 'mailmag';
// ★ 第1813便: リアルタイム求人（/admin/job/realtime/）も同じ形（2026-11-09 実測・読んだだけ）。違うのは hidden の page=job / table=shop_job / real_type=job だけ
const REALTIME_BASE: Record<'guest_realtime' | 'job_realtime', { path: string; realType: string }> = {
  guest_realtime: { path: 'https://estama.jp/admin/guest/realtime/', realType: 'shop' },
  job_realtime: { path: 'https://estama.jp/admin/job/realtime/', realType: 'job' },
};
const baseOf = (key?: string) => REALTIME_BASE[(key ?? 'guest_realtime') as 'guest_realtime' | 'job_realtime'] ?? REALTIME_BASE.guest_realtime;
export const realtimeListUrl = (key?: string) => baseOf(key).path;
export const realtimeEditUrl = (key?: string) => baseOf(key).path + 'edit/';
export const ESUTAMA_POST_TITLE_MAX = 30;
export const ESUTAMA_POST_BODY_MAX = 300;
/** ★ メールマガジンの本文は1500文字まで（2026-11-09 実測） */
export const esutamaPostBodyMax = (key?: string) => (key === 'mailmag' ? 1500 : ESUTAMA_POST_BODY_MAX);
/** ★ 選べる間隔（分） */
export const ESUTAMA_POST_INTERVALS = [30, 60, 90, 120, 150, 180];
/** ★ 1日1回のもの（メールマガジン）の間隔の値 */
export const ESUTAMA_POST_DAILY = 1440;
/** ★ 既定: 一日中（朝6時〜翌6時）・60分おき（ベンリーと同じ） */
export const ESUTAMA_POST_DEFAULT = { startMin: 360, endMin: 1800, intervalMin: 60 };

export const ESUTAMA_REALTIME_LIST_URL = 'https://estama.jp/admin/guest/realtime/';
export const ESUTAMA_REALTIME_EDIT_URL = 'https://estama.jp/admin/guest/realtime/edit/';
export const ESUTAMA_REALTIME_POST_URL = 'https://estama.jp/admin_post/realtime_edit';

// ── 画像（第1812便・2026-11-09）──────────────────────────────────────────
// ★★★ 実測（2026-11-09・croppic.js / my_crop.js を読んだ。送ってはいない）
//   ① 仮置き  POST /post/uptemp/   multipart: img=<ファイル> ＋ ctk   → JSON { status:'success', url, width, height }（error なら message）
//   ② 切り抜き POST /post/cropping/ multipart: imgUrl, imgInitW, imgInitH, imgW, imgH, imgY1, imgX1, cropH, cropW, rotation（＋ ctk）
//              → JSON { status:'success', url }
//      ★ 枠（#photo_1-imgupload）は 300×300。画面では「枠を覆うように縮めた絵」を動かして切る
//   ③ 投稿フォームに hidden「photo_1-imgupload = ②の url」が足され、image_delete_0 = 0 のまま「投稿する」
// ★ こちらの画像は、コネックエフで上げたときに 600×600 の正方形（中央で切る）にしてある → ② は全体をそのまま 300×300 に
export const ESUTAMA_POST_IMAGE_MAX = 5;
export const ESUTAMA_UPTEMP_URL = 'https://estama.jp/post/uptemp/';
export const ESUTAMA_CROPPING_URL = 'https://estama.jp/post/cropping/';
export const ESUTAMA_REALTIME_CROP_BOX = 300;
/** 投稿フォームに足す欄の名前（実測） */
export const ESUTAMA_REALTIME_IMG_FIELD = 'photo_1-imgupload';
/** コネックエフに上げた投稿用の画像の置き場（salon-images/<店>/esutama_post_<時刻>.jpg）だけ */
export function isEsutamaPostImagePath(p: string): boolean {
  return /^\d{1,10}\/esutama_post_[A-Za-z0-9_\-]{1,80}\.jpg$/.test(String(p ?? '')) && !String(p).includes('..');
}

/** croppic の応答（仮置き・切り抜き）。★ JSON でなければ失敗 */
export function parseCroppicResponse(body: string): { ok: boolean; url: string | null; width: number | null; height: number | null; message: string | null } {
  try {
    const j = JSON.parse(String(body ?? '')) as Record<string, unknown>;
    const url = typeof j.url === 'string' && j.url.length > 0 && j.url.length < 500 ? j.url : null;
    const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
    if (j.status === 'success' && url) return { ok: true, url, width: num(j.width), height: num(j.height), message: null };
    return { ok: false, url: null, width: null, height: null, message: (stripTags(String(j.message ?? j.status ?? '')).slice(0, 80) || '失敗') + ' / ' + JSON.stringify(j).slice(0, 80) };
  } catch {
    // ★ 第1814便: 何が返ったかを残す（原因を見るため。Cookie などは入らない応答の頭だけ）
    return { ok: false, url: null, width: null, height: null, message: 'JSON ではない: ' + stripTags(String(body ?? '')).slice(0, 80) };
  }
}

type MultipartReq = { method: 'POST'; url: string; headers: Record<string, string>; multipart: RelayMultipart };
function multipartHeaders(cookie: string, key?: string) {
  // ★★ content-type は付けない。★ multipart の境界は中継役（curl）が決める
  return {
    'user-agent': RELAY_USER_AGENT, accept: 'application/json, text/javascript, */*; q=0.01', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    'x-requested-with': 'XMLHttpRequest', referer: realtimeEditUrl(key), origin: 'https://estama.jp', cookie,
  };
}
const okCtk = (ctk: string | null): ctk is string => !!ctk && /^[A-Za-z0-9]{16,64}$/.test(ctk);

/** ★ ① 仮置き（エステ魂の一時置き場に上がるだけ。投稿はまだ） */
export function buildRealtimeImageUploadRequest(cookie: string, ctk: string | null, fileUrl: string, filename: string, key?: string): MultipartReq {
  if (!cookie) throw new Error('Cookie が無いまま送らない');
  if (!okCtk(ctk)) throw new Error('ctk の形が違うまま送らない');
  assertRelayFileUrl(fileUrl);
  if (!/^[A-Za-z0-9_\-]{1,64}\.jpg$/.test(filename)) throw new Error('ファイル名の形が不正');
  return {
    method: 'POST', url: ESUTAMA_UPTEMP_URL, headers: multipartHeaders(cookie, key),
    multipart: { fields: { ctk }, files: [{ field: 'img', url: fileUrl, filename, contentType: 'image/jpeg' }] },
  };
}

/** ★ ② 切り抜き（枠 300×300 を覆うように縮めて中央で切る） */
export function buildRealtimeImageCropRequest(cookie: string, ctk: string | null, up: { url: string; width: number | null; height: number | null }, key?: string): MultipartReq {
  if (!cookie) throw new Error('Cookie が無いまま送らない');
  if (!okCtk(ctk)) throw new Error('ctk の形が違うまま送らない');
  const w = up.width ?? 600, h = up.height ?? 600;
  const box = ESUTAMA_REALTIME_CROP_BOX;
  const scale = box / Math.min(w, h);
  const imgW = Math.max(box, Math.round(w * scale)), imgH = Math.max(box, Math.round(h * scale));
  return {
    method: 'POST', url: ESUTAMA_CROPPING_URL, headers: multipartHeaders(cookie, key),
    multipart: {
      fields: {
        imgUrl: up.url, imgInitW: String(w), imgInitH: String(h), imgW: String(imgW), imgH: String(imgH),
        imgY1: String(Math.floor((imgH - box) / 2)), imgX1: String(Math.floor((imgW - box) / 2)),
        cropH: String(box), cropW: String(box), rotation: '0', ctk,
      },
      files: [],
    },
  };
}

const len = (s: string) => [...String(s ?? '')].length;

/** タイトル・本文が送れる形か（空でない・上限以内） */
export function esutamaPostTextProblem(title: string, body: string, key?: string): string | null {
  if (len(title.trim()) === 0) return 'タイトルを入れてください';
  if (len(title) > ESUTAMA_POST_TITLE_MAX) return `タイトルは${ESUTAMA_POST_TITLE_MAX}文字以内にしてください`;
  if (len(body.trim()) === 0) return '本文を入れてください';
  if (len(body) > esutamaPostBodyMax(key)) return `本文は${esutamaPostBodyMax(key)}文字以内にしてください`;
  return null;
}

export type EsutamaPostSetting = { startMin: number; endMin: number; intervalMin: number };
export function isValidEsutamaPostSetting(s: EsutamaPostSetting, key?: string): boolean {
  if (isDailyPostKey(key)) {
    // ★ startMin が送る時刻（朝6時はじまりの分）。endMin は使わない（1800 にしておく）
    return Number.isInteger(s.startMin) && s.startMin >= 360 && s.startMin < 1800 && s.intervalMin === ESUTAMA_POST_DAILY;
  }
  return [s.startMin, s.endMin, s.intervalMin].every((v) => Number.isInteger(v))
    && s.startMin >= 360 && s.endMin <= 1800 && s.startMin < s.endMin
    && ESUTAMA_POST_INTERVALS.includes(s.intervalMin);
}

/** ★ 周（5分ごと）で投稿するか。readAt は「始めた時刻」（失敗した回も立て続けに始めない） */
export function shouldPostEsutama(args: {
  setting: EsutamaPostSetting; state: { lastAt: string | null; readAt: string | null }; now: Date; hasText: boolean; key?: string;
}): { post: boolean; reason: string } {
  const { setting, state, now } = args;
  if (!args.hasText) return { post: false, reason: 'no_text' };
  if (isDailyPostKey(args.key)) {
    // ★ 1日1回: その日（朝6時はじまり）の送る時刻を過ぎていて、まだ送れていなければ送る
    const b0 = businessMinOf(now);
    if (b0 < setting.startMin) return { post: false, reason: 'before_time' };
    const dueAt = lastResetAt(now).getTime() + (setting.startMin - 360) * 60000;
    if (state.lastAt && Date.parse(state.lastAt) >= dueAt - 60000) return { post: false, reason: 'done_today' };
    // ★ 失敗した回は30分おいてから（その日のうちに何度も送りに行かない）
    if (state.readAt && now.getTime() - Date.parse(state.readAt) < 30 * 60000) return { post: false, reason: 'recent_try' };
    // ★ 送る時刻から3時間を過ぎたら、その日は送らない（夜中にいきなりメールを出さない）
    if (now.getTime() - dueAt > 3 * 3600 * 1000) return { post: false, reason: 'too_late' };
    return { post: true, reason: 'ok' };
  }
  const b = businessMinOf(now);
  if (b < setting.startMin || b >= setting.endMin) return { post: false, reason: 'outside_hours' };
  const gap = (iso: string | null) => (iso ? now.getTime() - Date.parse(iso) : Infinity);
  // ★ 周は5分ごと。間隔ちょうどに送れるよう3分の遊び
  if (gap(state.lastAt) < (setting.intervalMin - 3) * 60000) return { post: false, reason: 'interval' };
  if (gap(state.readAt) < (Math.min(setting.intervalMin, 60) - 3) * 60000) return { post: false, reason: 'recent_try' };
  return { post: true, reason: 'ok' };
}

// ── 画面を読む ──
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? '') : null;
}
const decodeEnt = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const stripTags = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export type RealtimeEditPage = { ctk: string | null; shopId: string | null; fields: Array<[string, string]>; problems: string[] };

/** 新規投稿の画面（#form-realtime_edit の中身を画面の並びのまま・ctk・brws_shop_id） */
export function parseRealtimeEditPage(html: string, key?: string): RealtimeEditPage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const fields: Array<[string, string]> = [];
  const fm = /<form\b[^>]*\bid=["']form-realtime_edit["'][^>]*>([\s\S]*?)<\/form>/i.exec(src);
  if (!fm) problems.push('投稿のフォームが見つからない');
  else {
    const re = /<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fm[1])) !== null) {
      const tag = m[0];
      const name = attr(tag, 'name');
      if (!name) continue;
      if (/\bdisabled\b/i.test(tag.split('>')[0])) continue;
      const kind = /^<(\w+)/.exec(tag)?.[1].toLowerCase() ?? '';
      if (kind === 'input') {
        const type = (attr(tag, 'type') ?? 'text').toLowerCase();
        if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(tag)) continue;
        if (type === 'submit' || type === 'button' || type === 'file') continue;
        fields.push([name, decodeEnt(attr(tag, 'value') ?? '')]);
      } else if (kind === 'select') {
        const opts = [...tag.matchAll(/<option\b[^>]*>/gi)].map((o) => o[0]);
        const sel = opts.find((o) => /\bselected\b/i.test(o)) ?? opts[0];
        fields.push([name, sel ? decodeEnt(attr(sel, 'value') ?? '') : '']);
      } else {
        fields.push([name, decodeEnt(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/i.exec(tag)?.[1] ?? '')]);
      }
    }
    for (const k of ['title', 'body', 'real_type']) if (!fields.some(([n]) => n === k)) problems.push(k + ' が無い');
    const rt = fields.find(([n]) => n === 'real_type')?.[1];
    const want = baseOf(key).realType;
    if (rt !== undefined && rt !== want) problems.push('real_type が ' + want + ' ではない（' + rt + '）');
  }
  const ctk = readEsutamaCsrf(src);
  if (!ctk) problems.push('ctk（#csrf_footer）が見つからない');
  let shopId: string | null = null;
  for (const t of src.match(/<input\b[^>]*>/gi) ?? []) {
    if (attr(t, 'id') === 'brws_shop_id' || attr(t, 'name') === 'brws_shop_id') { shopId = attr(t, 'value') ?? ''; break; }
  }
  if (shopId === null) problems.push('brws_shop_id が見つからない');
  return { ctk, shopId, fields, problems };
}

/** 一覧の「通知したメッセージの履歴」のいちばん上（投稿日時は JST の分まで） */
export function parseRealtimeHistoryTop(html: string): { at: string | null; title: string } | null {
  const t = stripTags(String(html ?? ''));
  const from = t.indexOf('通知したメッセージの履歴');
  const s = from >= 0 ? t.slice(from) : t;
  const m = /投稿日時\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(.*?)\s*確認する/.exec(s);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 9 * 3600 * 1000;
  return { at: new Date(ms).toISOString(), title: m[6].trim() };
}

/** 送った応答（JSON の [0] が 'OUT' なら入力エラー） */
export function realtimePostResponse(body: string): { accepted: boolean; error: string | null } {
  try {
    const j = JSON.parse(String(body ?? '')) as Record<string, unknown> | unknown[];
    const first = Array.isArray(j) ? j[0] : (j as Record<string, unknown>)['0'];
    const second = Array.isArray(j) ? j[1] : (j as Record<string, unknown>)['1'];
    if (first === 'OUT') return { accepted: false, error: stripTags(typeof second === 'string' ? second : JSON.stringify(second ?? '')).slice(0, 120) || '入力エラー' };
    return { accepted: true, error: null };
  } catch {
    return { accepted: false, error: '応答が JSON ではなかった' };
  }
}

// ── 送る ──
type Req = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string };
const baseHeaders = (cookie: string) => ({ 'user-agent': RELAY_USER_AGENT, 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', cookie });

export function buildRealtimePageRequest(cookie: string, which: 'edit' | 'list', key?: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return {
    method: 'GET', url: which === 'edit' ? realtimeEditUrl(key) : realtimeListUrl(key),
    headers: { ...baseHeaders(cookie), accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', referer: which === 'edit' ? realtimeListUrl(key) : 'https://estama.jp/admin/' },
  };
}

/** ★★ リアルタイム集客を1件投稿する（画面の serializeArray と同じ str[n][name]/str[n][value] ＋ brws_shop_id ＋ ctk） */
export function buildRealtimePostRequest(cookie: string, page: RealtimeEditPage, title: string, body: string, imageUrl?: string | null, key?: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま送らない');
  if (!page.ctk || !/^[A-Za-z0-9]{16,64}$/.test(page.ctk)) throw new Error('ctk の形が違うまま送らない');
  if (page.shopId === null) throw new Error('brws_shop_id が無いまま送らない');
  const p = esutamaPostTextProblem(title, body);
  if (p) throw new Error(p);
  // ★ 画面の並びのまま、title・body だけ差し替える。★ テンプレート保存（add_template）は付けない
  const fields = page.fields.filter(([n]) => n !== 'add_template').map(([n, v]): [string, string] => [n, n === 'title' ? title : n === 'body' ? body : v]);
  if (!fields.some(([n]) => n === 'title') || !fields.some(([n]) => n === 'body')) throw new Error('title / body の欄が無いまま送らない');
  // ★ 第1812便: 切り抜いた画像があれば、画面と同じく hidden「photo_1-imgupload」を足す（image_delete_0 は 0）
  if (imageUrl) {
    if (imageUrl.length > 500 || /[\s"'<>]/.test(imageUrl)) throw new Error('画像の場所の形が不正');
    const at = fields.findIndex(([n]) => n === 'image_delete_0');
    const del = fields.findIndex(([n]) => n === 'image_delete_0');
    if (del >= 0) fields[del] = ['image_delete_0', '0'];
    fields.splice(at >= 0 ? at : fields.length, 0, [ESUTAMA_REALTIME_IMG_FIELD, imageUrl]);
  }
  const payload: Array<[string, string]> = [];
  fields.forEach(([n, v], i) => { payload.push([`str[${i}][name]`, n]); payload.push([`str[${i}][value]`, v]); });
  payload.push(['brws_shop_id', page.shopId]);
  payload.push(['ctk', page.ctk]);
  return {
    method: 'POST', url: ESUTAMA_REALTIME_POST_URL,
    headers: {
      ...baseHeaders(cookie),
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: realtimeEditUrl(key), origin: 'https://estama.jp',
    },
    body: encodePayload(payload),
  };
}

/** ★ 次に使う画像（順番に回す）。★ 置き場の形が違うものは使わない。無ければ undefined（画像はいまのまま） */
export function pickEsutamaPostImage(images: unknown, nextImage: unknown): { path: string; index: number } | undefined {
  const list = (Array.isArray(images) ? images : []).map(String).filter(isEsutamaPostImagePath);
  if (list.length === 0) return undefined;
  const n = Number.isInteger(Number(nextImage)) && Number(nextImage) >= 0 ? Number(nextImage) : 0;
  const index = n % list.length;
  return { path: list[index], index };
}

// ── メールマガジン（第1817便・2026-11-09 実測・読んだだけ。送ってはいない）───────────────
//   一覧  GET /admin/mail/ … 「配信日時：2026年11月09日 11時47分」＋タイトル＋配信数（4件）。brws_shop_id・#csrf_footer がある
//   作成  「メールマガジンを配信する」= .send-get_modal（data-row=mailmag,0）→ POST /admin_post/modal/ でフォームの HTML が来る
//          <form id="form-mail_edit"> title（30文字以内）/ body（1500文字以内）だけ
//   送る  「メルマガを送信」= .send-modal_post（data-post=mail_edit）→ sendPost: POST /admin_post/mail_edit
//          data = { str: serializeArray（title, body）, brws_shop_id, ctk }。応答 [0]=='OUT' なら入力エラー
// ★★ 登録している方（オイルクエスト様は4件）へ本当にメールが届く。二度送ると2通届く → 送り直さない
export const ESUTAMA_MAIL_LIST_URL = 'https://estama.jp/admin/mail/';
export const ESUTAMA_MAIL_POST_URL = 'https://estama.jp/admin_post/mail_edit';

export function buildMailPageRequest(cookie: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return { method: 'GET', url: ESUTAMA_MAIL_LIST_URL, headers: { ...baseHeaders(cookie), accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', referer: 'https://estama.jp/admin/' } };
}

/** 一覧（ctk・brws_shop_id・いちばん上の配信） */
export function parseMailPage(html: string): { ctk: string | null; shopId: string | null; top: { at: string; title: string } | null; problems: string[] } {
  const src = String(html ?? '');
  const problems: string[] = [];
  const ctk = readEsutamaCsrf(src);
  if (!ctk) problems.push('ctk（#csrf_footer）が見つからない');
  let shopId: string | null = null;
  for (const t of src.match(/<input\b[^>]*>/gi) ?? []) {
    if (attr(t, 'id') === 'brws_shop_id' || attr(t, 'name') === 'brws_shop_id') { shopId = attr(t, 'value') ?? ''; break; }
  }
  if (shopId === null) problems.push('brws_shop_id が見つからない');
  if (!/メールマガジン/.test(src)) problems.push('メールマガジンの画面ではない');
  const txt = stripTags(src);
  const m = /配信日時\s*[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時(\d{1,2})分\s*(.*?)\s+\d+\s*件/.exec(txt);
  const top = m ? { at: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 9 * 3600 * 1000).toISOString(), title: m[6].trim() } : null;
  return { ctk, shopId, top, problems };
}

/** ★★ メールマガジンを1通配信する（本当に届く） */
export function buildMailPostRequest(cookie: string, page: { ctk: string | null; shopId: string | null }, title: string, body: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま送らない');
  if (!page.ctk || !/^[A-Za-z0-9]{16,64}$/.test(page.ctk)) throw new Error('ctk の形が違うまま送らない');
  if (page.shopId === null) throw new Error('brws_shop_id が無いまま送らない');
  const p = esutamaPostTextProblem(title, body, 'mailmag');
  if (p) throw new Error(p);
  return {
    method: 'POST', url: ESUTAMA_MAIL_POST_URL,
    headers: {
      ...baseHeaders(cookie), accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest',
      referer: ESUTAMA_MAIL_LIST_URL, origin: 'https://estama.jp',
    },
    body: encodePayload([
      ['str[0][name]', 'title'], ['str[0][value]', title],
      ['str[1][name]', 'body'], ['str[1][value]', body],
      ['brws_shop_id', page.shopId], ['ctk', page.ctk],
    ]),
  };
}
