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
import { businessMinOf } from './esutamaOption';

export type EsutamaPostKey = 'guest_realtime';
export const ESUTAMA_POST_KEYS: EsutamaPostKey[] = ['guest_realtime'];
export const ESUTAMA_POST_LABEL: Record<EsutamaPostKey, string> = { guest_realtime: 'リアルタイム集客' };
export const ESUTAMA_POST_TITLE_MAX = 30;
export const ESUTAMA_POST_BODY_MAX = 300;
/** ★ 選べる間隔（分） */
export const ESUTAMA_POST_INTERVALS = [30, 60, 90, 120, 180];
/** ★ 既定: 一日中（朝6時〜翌6時）・60分おき（ベンリーと同じ） */
export const ESUTAMA_POST_DEFAULT = { startMin: 360, endMin: 1800, intervalMin: 60 };

export const ESUTAMA_REALTIME_LIST_URL = 'https://estama.jp/admin/guest/realtime/';
export const ESUTAMA_REALTIME_EDIT_URL = 'https://estama.jp/admin/guest/realtime/edit/';
export const ESUTAMA_REALTIME_POST_URL = 'https://estama.jp/admin_post/realtime_edit';

const len = (s: string) => [...String(s ?? '')].length;

/** タイトル・本文が送れる形か（空でない・上限以内） */
export function esutamaPostTextProblem(title: string, body: string): string | null {
  if (len(title.trim()) === 0) return 'タイトルを入れてください';
  if (len(title) > ESUTAMA_POST_TITLE_MAX) return `タイトルは${ESUTAMA_POST_TITLE_MAX}文字以内にしてください`;
  if (len(body.trim()) === 0) return '本文を入れてください';
  if (len(body) > ESUTAMA_POST_BODY_MAX) return `本文は${ESUTAMA_POST_BODY_MAX}文字以内にしてください`;
  return null;
}

export type EsutamaPostSetting = { startMin: number; endMin: number; intervalMin: number };
export function isValidEsutamaPostSetting(s: EsutamaPostSetting): boolean {
  return [s.startMin, s.endMin, s.intervalMin].every((v) => Number.isInteger(v))
    && s.startMin >= 360 && s.endMin <= 1800 && s.startMin < s.endMin
    && ESUTAMA_POST_INTERVALS.includes(s.intervalMin);
}

/** ★ 周（5分ごと）で投稿するか。readAt は「始めた時刻」（失敗した回も立て続けに始めない） */
export function shouldPostEsutama(args: {
  setting: EsutamaPostSetting; state: { lastAt: string | null; readAt: string | null }; now: Date; hasText: boolean;
}): { post: boolean; reason: string } {
  const { setting, state, now } = args;
  if (!args.hasText) return { post: false, reason: 'no_text' };
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
export function parseRealtimeEditPage(html: string): RealtimeEditPage {
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
    if (rt !== undefined && rt !== 'shop') problems.push('real_type が shop ではない（' + rt + '）');
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

export function buildRealtimePageRequest(cookie: string, which: 'edit' | 'list'): Req {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return {
    method: 'GET', url: which === 'edit' ? ESUTAMA_REALTIME_EDIT_URL : ESUTAMA_REALTIME_LIST_URL,
    headers: { ...baseHeaders(cookie), accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', referer: which === 'edit' ? ESUTAMA_REALTIME_LIST_URL : 'https://estama.jp/admin/' },
  };
}

/** ★★ リアルタイム集客を1件投稿する（画面の serializeArray と同じ str[n][name]/str[n][value] ＋ brws_shop_id ＋ ctk） */
export function buildRealtimePostRequest(cookie: string, page: RealtimeEditPage, title: string, body: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま送らない');
  if (!page.ctk || !/^[A-Za-z0-9]{16,64}$/.test(page.ctk)) throw new Error('ctk の形が違うまま送らない');
  if (page.shopId === null) throw new Error('brws_shop_id が無いまま送らない');
  const p = esutamaPostTextProblem(title, body);
  if (p) throw new Error(p);
  // ★ 画面の並びのまま、title・body だけ差し替える。★ テンプレート保存（add_template）は付けない
  const fields = page.fields.filter(([n]) => n !== 'add_template').map(([n, v]): [string, string] => [n, n === 'title' ? title : n === 'body' ? body : v]);
  if (!fields.some(([n]) => n === 'title') || !fields.some(([n]) => n === 'body')) throw new Error('title / body の欄が無いまま送らない');
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
      referer: ESUTAMA_REALTIME_EDIT_URL, origin: 'https://estama.jp',
    },
    body: encodePayload(payload),
  };
}
