// 全国エステランキングの「ニュース」「おすすめセラピスト」（第1831便・2026-11-09・カッキーさん）。★ 純粋関数だけ。
//
// ★★ ベンリーから移す。ベンリーの設定（2026-11-09 に画面で確かめた）:
//   ニュース          … 毎朝 6:11・6:41・7:11・7:41・8:11 に1本ずつ（1日5回まで・朝6時に戻る）。中身は「初めての女の子限定☆」×4・「☆オフィシャルメルマガ登録割☆」×1（7:11）
//   おすすめセラピスト … 24時間1分おき（毎朝 6:09）に、みあ → うる → みみ → りな の順で1人ずつ入れ替え。★ 変更回数は月ごとに上限（11/9 時点で残り1回）
//
// ★★★ 相手の作り（2026-11-09 に読むだけで確かめた・保存や送信はしていない）:
//   ニュース一覧  GET /shop/news/  「本日のニュース投稿は終了しました。1日最大5回まで投稿できます。投稿回数は午前6時にリセットされます。」
//   新規投稿      GET /shop/news/add/（★ 5回使い切ると /shop/news/ へ戻される＝11/9 は中を見られていない）
//                 → 編集画面（/shop/news-edit/<id>/・multipart）と同じ欄のはず: type（1=割引情報）・indefinite（0=終了なし）・end_published・title・content・image（ファイル）
//                 ★ だから送る前に【毎回フォームを読み】、そこにある隠し値と欄の名前で送る（決め打ちしない）
//   おすすめ      GET /shop/image/girl/upload/all/ の一覧。行 <tr class="girl-tr …" data-girl-id="…">・チェック <input name="ads[]" value="<girl id>">
//                 「おすすめセラピストは1名設定できます。今月のおすすめセラピスト変更可能回数は残り N 回です。」・非公開（gi-hide）の方は設定できない
//                 保存 POST /shop/image/girl/upload/all/（urlencoded）: ads[]=<girl id> ＆ sorts=<今の並びの girl id をカンマで>（★ 保存ボタンが今の並びを sorts に入れて送る＝並びは変わらない）

import { RELAY_USER_AGENT } from './relayUserAgent';
import { ZENKOKU_ORIGIN, ZENKOKU_GIRLS_URL, ZENKOKU_SHOP_URL, type RelayRequest } from './zenkokuRequests';
import type { RelayMultipart } from './relayMultipart';

export type ZenkokuOptKey = 'news' | 'recommend';
export const ZENKOKU_OPT_KEYS: ZenkokuOptKey[] = ['news', 'recommend'];
export const ZENKOKU_OPT_LABEL: Record<ZenkokuOptKey, string> = { news: 'ニュース投稿', recommend: 'おすすめセラピスト' };
/** ★ ベンリーと同じ（朝6時はじまりの分） */
export const ZENKOKU_OPT_DEFAULT_TIMES: Record<ZenkokuOptKey, number[]> = { news: [371, 401, 431, 461, 491], recommend: [369] };
export const ZENKOKU_NEWS_MAX = 5;
export const ZENKOKU_NEWS_TITLE_MAX = 50;
export const ZENKOKU_NEWS_BODY_MAX = 2000;
export const ZENKOKU_RECOMMEND_MAX = 20;

export const ZENKOKU_NEWS_URL = ZENKOKU_ORIGIN + '/shop/news/';
export const ZENKOKU_NEWS_ADD_URL = ZENKOKU_ORIGIN + '/shop/news/add/';

export type ZenkokuNewsItem = { title: string; body: string; image: string | null };
export type ZenkokuRecItem = { name: string };

/** 画像の置き場（salon-images の <店>/zenkoku_news_<時刻>.jpg だけ。★ /api/relay/file はこの形だけ読める） */
export function isZenkokuNewsImagePath(p: string): boolean {
  return /^\d{1,10}\/zenkoku_news_[A-Za-z0-9_\-]{1,80}\.jpg$/.test(String(p ?? '')) && !String(p).includes('..');
}

export function normalizeNewsItems(v: unknown): ZenkokuNewsItem[] {
  return (Array.isArray(v) ? v : []).slice(0, ZENKOKU_NEWS_MAX).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const image = typeof o.image === 'string' && isZenkokuNewsImagePath(o.image) ? o.image : null;
    return { title: String(o.title ?? '').slice(0, ZENKOKU_NEWS_TITLE_MAX), body: String(o.body ?? '').slice(0, ZENKOKU_NEWS_BODY_MAX), image };
  });
}
export function normalizeRecItems(v: unknown): ZenkokuRecItem[] {
  return (Array.isArray(v) ? v : []).slice(0, ZENKOKU_RECOMMEND_MAX)
    .map((x) => ({ name: String((x && typeof x === 'object' ? (x as Record<string, unknown>).name : x) ?? '').trim().slice(0, 40) }))
    .filter((x) => x.name !== '');
}
export function newsItemProblem(it: ZenkokuNewsItem): string | null {
  if (!it.title.trim()) return '題名が空です';
  if (!it.body.trim()) return '本文が空です';
  return null;
}

// ── 時刻（全国エステランキングの回数も朝6時に戻る）──
const JST = 9 * 3600 * 1000;
export function zenkokuBusinessMin(now: Date): number {
  const j = new Date(now.getTime() + JST);
  const m = j.getUTCHours() * 60 + j.getUTCMinutes();
  return m < 360 ? m + 1440 : m;
}
export function zenkokuLastReset(now: Date): Date {
  const j = new Date(now.getTime() + JST);
  let ms = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), 6, 0, 0) - JST;
  if (ms > now.getTime()) ms -= 24 * 3600 * 1000;
  return new Date(ms);
}
/** 「6:11」「翌1:00」 */
export function zenkokuMinLabel(m: number): string {
  return m >= 1440 ? `翌${Math.floor((m - 1440) / 60)}:${String(m % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
export function sanitizeTimes(v: unknown, key: ZenkokuOptKey): number[] {
  const list = (Array.isArray(v) ? v : []).map(Number).filter((t) => Number.isInteger(t) && t >= 360 && t < 1800);
  const uniq = [...new Set(list)].sort((a, b) => a - b);
  return uniq.slice(0, key === 'news' ? ZENKOKU_NEWS_MAX : 1);
}

/**
 * ★ 送るか。時刻で動く（求人ワンクリックアピールと同じ考え方）:
 *   いちばん近い過去の予定時刻（今日の）を出し、その時刻より後にまだ送れていなければ送る。
 *   ★ 始めた時刻（readAt）がその予定時刻より後なら、30分は始め直さない（二重に送らない）
 *   返す slot … times の何番目の時刻か（ニュースはその番号の中身を送る）
 */
export function shouldRunZenkokuOpt(args: {
  key: ZenkokuOptKey; timesMin: number[]; now: Date;
  state: { lastAt: string | null; readAt: string | null; remaining: number | null; lastOutcome: string | null };
}): { run: boolean; reason: string; slot: number } {
  const { key, now, state } = args;
  const times = sanitizeTimes(args.timesMin.length > 0 ? args.timesMin : ZENKOKU_OPT_DEFAULT_TIMES[key], key);
  const b = zenkokuBusinessMin(now);
  let slot = -1;
  times.forEach((t, i) => { if (t <= b) slot = i; });
  if (slot < 0) return { run: false, reason: 'before_first_time', slot: -1 };
  const dueAt = zenkokuLastReset(now).getTime() + (times[slot] - 360) * 60000;
  if (state.lastAt && Date.parse(state.lastAt) >= dueAt - 60000) return { run: false, reason: 'done_for_time', slot };
  if (state.readAt && Date.parse(state.readAt) >= dueAt - 60000 && now.getTime() - Date.parse(state.readAt) < 30 * 60000) return { run: false, reason: 'recent_read', slot };
  // ★ 遅れすぎた時刻はあきらめる（例: 6:11 の分を 9 時に送らない。次の時刻を待つ）
  if (now.getTime() - dueAt > 90 * 60000) return { run: false, reason: 'too_late', slot };
  const readToday = !!state.readAt && Date.parse(state.readAt) >= zenkokuLastReset(now).getTime();
  if (key === 'news' && state.lastOutcome === 'limit' && readToday) return { run: false, reason: 'no_quota', slot };
  if (key === 'recommend' && state.remaining === 0 && state.readAt && sameMonthJST(state.readAt, now)) return { run: false, reason: 'no_quota', slot };
  return { run: true, reason: 'ok', slot };
}
function sameMonthJST(iso: string, now: Date): boolean {
  const a = new Date(Date.parse(iso) + JST), b = new Date(now.getTime() + JST);
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

// ── 画面を読む ──
const decodeEnt = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEnt(m[2] ?? m[3] ?? '') : null;
}
const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function looksLikeNewsLimit(html: string): boolean {
  return /本日のニュース投稿は終了/.test(stripTags(String(html ?? '')));
}

export type ZenkokuNewsForm = {
  action: string;
  /** 隠し値（_method・_csrfToken・_Token[…] など）。★ そのまま送り返す */
  hidden: Record<string, string>;
  /** 種別（type）の選択肢 [値, 表示] */
  typeOptions: Array<[string, string]>;
  titleName: string; bodyName: string; imageName: string | null;
  hasIndefinite: boolean; hasEndPublished: boolean;
};

/** 新規投稿のフォーム（題名と本文の欄があるフォーム） */
export function parseZenkokuNewsForm(html: string): ZenkokuNewsForm | null {
  const src = String(html ?? '');
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tag = m[1];
    const body = m[2];
    const action = attr(' ' + tag, 'action') ?? '';
    if (!/\/shop\/news/.test(action) || /news-delete/.test(action)) continue;
    if (!/name=["']title["']/i.test(body) || !/name=["']content["']/i.test(body)) continue;
    const hidden: Record<string, string> = {};
    for (const im of body.matchAll(/<input\b[^>]*>/gi)) {
      const t = im[0];
      if ((attr(t, 'type') ?? '').toLowerCase() !== 'hidden') continue;
      const name = attr(t, 'name');
      if (!name || name === 'indefinite') continue;
      hidden[name] = attr(t, 'value') ?? '';
    }
    const typeOptions: Array<[string, string]> = [];
    const sel = /<select\b[^>]*name=["']type["'][^>]*>([\s\S]*?)<\/select>/i.exec(body);
    if (sel) for (const om of sel[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) typeOptions.push([attr(' ' + om[1], 'value') ?? '', stripTags(om[2])]);
    const file = /<input\b[^>]*type=["']file["'][^>]*>/i.exec(body);
    const fileName = file ? attr(file[0], 'name') : null;
    return {
      action: action.startsWith('http') ? action : ZENKOKU_ORIGIN + (action.startsWith('/') ? action : '/' + action),
      hidden, typeOptions, titleName: 'title', bodyName: 'content', imageName: fileName,
      hasIndefinite: /name=["']indefinite["']/i.test(body), hasEndPublished: /name=["']end_published["']/i.test(body),
    };
  }
  return null;
}

/** 一覧のいちばん上の投稿（題名と作成日時 'YYYY/MM/DD HH:MM'） */
export function parseZenkokuNewsTop(html: string): { title: string; created: string } | null {
  const src = String(html ?? '');
  const row = /<a\b[^>]*href=["'][^"']*news-edit\/\d+\/?["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/i.exec(src);
  return row ? { title: stripTags(decodeEnt(row[1])), created: row[2].replace(/\s+/g, ' ') } : null;
}

function headers(extra: Record<string, string>): Record<string, string> {
  return { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', ...extra };
}
export function buildZenkokuGetRequest(cookie: string, url: string, referer = ZENKOKU_SHOP_URL): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return { method: 'GET', url, headers: headers({ referer, cookie }), body: '' };
}

/** ★★ ニュースの新規投稿（multipart）。★ 画像が無ければファイル無しで送る */
export function buildZenkokuNewsPostRequest(cookie: string, form: ZenkokuNewsForm, item: ZenkokuNewsItem, imageUrl: string | null, typeLabel = '割引情報'): { method: 'POST'; url: string; headers: Record<string, string>; multipart: RelayMultipart } {
  if (!cookie) throw new Error('Cookie が無いまま投稿しない');
  const p = newsItemProblem(item);
  if (p) throw new Error(p);
  const fields: Record<string, string> = { ...form.hidden };
  if (!('_method' in fields)) fields._method = 'POST';
  if (form.typeOptions.length > 0) {
    const t = form.typeOptions.find(([, l]) => l === typeLabel) ?? form.typeOptions.find(([v]) => v !== '') ?? form.typeOptions[0];
    fields.type = t[0];
  }
  if (form.hasIndefinite) fields.indefinite = '0';
  if (form.hasEndPublished) fields.end_published = '';
  fields[form.titleName] = item.title;
  fields[form.bodyName] = item.body;
  const files = imageUrl && form.imageName ? [{ field: form.imageName, url: imageUrl, filename: 'news.jpg', contentType: 'image/jpeg' }] : [];
  return {
    method: 'POST', url: form.action,
    // ★ content-type は付けない（multipart の境界は中継役が決める）
    headers: { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', origin: ZENKOKU_ORIGIN, referer: ZENKOKU_NEWS_ADD_URL, cookie },
    multipart: { fields, files },
  };
}

// ── おすすめセラピスト ──
export type ZenkokuRecRow = { gid: string; name: string; hidden: boolean; checked: boolean };
export type ZenkokuRecPage = { rows: ZenkokuRecRow[]; remaining: number | null; formSeen: boolean };

export function parseZenkokuRecommendPage(html: string): ZenkokuRecPage {
  const src = String(html ?? '');
  const t = stripTags(src);
  const rm = /変更可能回数は残り\s*(\d{1,3})\s*回/.exec(t);
  const rows: ZenkokuRecRow[] = [];
  const re = /<tr\b([^>]*\bdata-girl-id=["'](\d{1,12})["'][^>]*)>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const trAttrs = m[1];
    const gid = m[2];
    const body = m[3];
    const cls = attr(' ' + trAttrs, 'class') ?? '';
    if (!/\bgirl-tr\b/.test(cls)) continue;
    const ads = /<input\b[^>]*name=["']ads\[\]["'][^>]*>/i.exec(body);
    const checked = !!ads && /\schecked\b/i.test(ads[0]);
    // ★ 名前は「非公開／公開・編集・削除」のセル（buttons-in-cell）のひとつ手前。非公開の方は「しずか 非公開中」と出る
    const cells = [...body.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((c) => ({ cls: attr(' ' + c[1], 'class') ?? '', text: stripTags(decodeEnt(c[2])) }));
    const bi = cells.findIndex((c) => /\bbuttons-in-cell\b/.test(c.cls));
    const nameCell = bi > 0 ? cells[bi - 1].text.replace(/\s*非公開中$/, '') : '';
    rows.push({ gid, name: nameCell.trim(), hidden: /\bgi-hide\b/.test(cls), checked });
  }
  return { rows, remaining: rm ? Number(rm[1]) : null, formSeen: /name=["']ads\[\]["']/.test(src) && /name=["']sorts["']/.test(src) };
}

/** 名前の比べ方（空白・全角半角の違いは見ない） */
export const normName = (s: string) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');

/**
 * ★ 次に入れる方。リストの nextIndex から順に、全国エステランキングに居て公開中の方を探す。
 *   今もうその方が入っていれば「入っていた」（送らない・次へ進める）。
 */
export function pickRecommend(items: ZenkokuRecItem[], nextIndex: number, page: ZenkokuRecPage):
  { kind: 'set'; row: ZenkokuRecRow; index: number; skipped: string[] } | { kind: 'already'; row: ZenkokuRecRow; index: number; skipped: string[] } | { kind: 'none'; skipped: string[] } {
  const n = items.length;
  const skipped: string[] = [];
  if (n === 0) return { kind: 'none', skipped };
  const start = ((Number.isInteger(nextIndex) ? nextIndex : 0) % n + n) % n;
  for (let k = 0; k < n; k++) {
    const index = (start + k) % n;
    const want = normName(items[index].name);
    const row = page.rows.find((r) => normName(r.name) === want);
    if (!row || row.hidden) { skipped.push(items[index].name); continue; }
    return row.checked ? { kind: 'already', row, index, skipped } : { kind: 'set', row, index, skipped };
  }
  return { kind: 'none', skipped };
}

/** ★★ おすすめの保存（今の並びをそのまま sorts に入れる＝並びは変えない） */
export function buildZenkokuRecommendSaveRequest(cookie: string, page: ZenkokuRecPage, gid: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま保存しない');
  if (!/^\d{1,12}$/.test(gid)) throw new Error('番号の形が違う');
  if (!page.formSeen || page.rows.length === 0) throw new Error('一覧が読めていないまま保存しない');
  if (!page.rows.some((r) => r.gid === gid)) throw new Error('一覧に居ない方は入れない');
  const sorts = page.rows.map((r) => r.gid).join(',');
  return {
    method: 'POST', url: ZENKOKU_GIRLS_URL,
    headers: headers({ 'content-type': 'application/x-www-form-urlencoded', origin: ZENKOKU_ORIGIN, referer: ZENKOKU_GIRLS_URL, cookie }),
    body: encodeURIComponent('ads[]') + '=' + encodeURIComponent(gid) + '&sorts=' + encodeURIComponent(sorts),
  };
}

export const ZENKOKU_OPT_OUTCOME: Record<string, string> = {
  limit: '今日の投稿回数（5回）を使い切っていました',
  no_remaining: '今月の変更回数が残っていませんでした',
  no_items: '中身が登録されていません',
  no_match: '全国エステランキングに登録（公開）されている方がリストにいませんでした',
};
