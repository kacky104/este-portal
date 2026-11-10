// バニラ（qzin.jp・風俗求人）の店長ブログ（第1903便・2026-11-10・カッキーさん）。★ 純粋関数だけ。通信も DB も触らない。
//
// ★★ ベンリーの「バニラ(店長ブログ)」をコネックエフへ移す。ベンリーは前の記事を消して新しく出す形（11/10 は一覧に最新の1本だけ）。
//
// ★★★ 相手の作り（2026-11-10 オイルクエスト様の管理画面で確かめた・投稿も削除もしていない）:
//   ログイン      POST https://qzin.jp/entry/（urlencoded）username・password・button=ログイン
//                 → 管理画面のトップ top.html?entry_sid=…&entry_time=…&login=login
//                 ★ ログインの状態は URL の entry_sid・entry_time が持つ（Cookie が無くても読めた）。以後のページはすべてこの2つを付けて開く
//   新規投稿      GET  /entry/shop_manager_blog.html?entry_sid&entry_time
//                 フォーム（multipart）: status（0=下書き・1=公開）・reservation（空=すぐ公開）・title（150字）・image（ファイル・300×300・500KB）・body（タグ込み10万字）・confirm=確認する
//   確認画面      同じ場所へ POST → 「以下の内容でよろしければ、「投稿する」を押して下さい」
//                 隠し値: status・title・tmp_img（画像を付けたとき）・body・vanilla_token（128字）
//                 「投稿する」（type=button name=complete）を押すと、ページの JS（shopmanager.js）が <input type=hidden name=complete> を足して F1 を送る
//   一覧          GET  /entry/shop_manager_bloglist.html?entry_sid&entry_time（作成日時の降順・10件）
//                 <tr class="blog_content"> <span class="title">題名</span> … <span class="create">公開済み<br>2026/11/10 17:08:39</span> … blog_id=167968019 … c_delete167968019
//   削除          一覧の F1（multipart）に vanilla_token・conditions・ascdesc・limit と delete=<blog_id> を入れて送る（ページの JS と同じ）。★ 記事の画像も消える
//   ★ 90日で消える（バニラの決まり）

import { RELAY_USER_AGENT } from './relayUserAgent';
import type { RelayMultipart } from './relayMultipart';
import { zenkokuBusinessMin, zenkokuLastReset, zenkokuMinLabel } from './zenkokuOption';

export type RelayRequest = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: string };

export const VANILLA_HOST = 'qzin.jp';
export const VANILLA_ORIGIN = 'https://' + VANILLA_HOST;
export const VANILLA_LOGIN_URL = VANILLA_ORIGIN + '/entry/';
const PATH = { top: '/entry/top.html', blog: '/entry/shop_manager_blog.html', list: '/entry/shop_manager_bloglist.html' } as const;

/** ★ 1店に持てる記事の数 */
export const VANILLA_BLOG_ITEMS_MAX = 10;
/** ★ 時刻の数（ベンリーは90分おき＝1日16回。24まで） */
export const VANILLA_BLOG_TIMES_MAX = 24;
export const VANILLA_BLOG_TITLE_MAX = 150;
/**
 * ★ 本文の上限。バニラはタグ込み10万字まで受けるが、中継（relayMultipart）の1項目は4000字まで。
 *   ★ 確認画面から投稿へは本文を隠し値でそのまま送り返すので、こちらの上限に合わせる
 */
export const VANILLA_BLOG_BODY_MAX = 3800;

export type VanillaSession = { sid: string; time: string };
export type VanillaBlogItem = { title: string; body: string; image: string | null };

// ── 画像の置き場 ──
/** salon-images の <店>/vanilla_blog_<名前>.jpg だけ（/api/relay/file はこの形だけ読める） */
export function isVanillaBlogImagePath(p: string): boolean {
  return /^\d{1,10}\/vanilla_blog_[A-Za-z0-9_\-]{1,80}\.jpg$/.test(String(p ?? '')) && !String(p).includes('..');
}

export function normalizeVanillaBlogItems(v: unknown): VanillaBlogItem[] {
  return (Array.isArray(v) ? v : []).slice(0, VANILLA_BLOG_ITEMS_MAX).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const image = typeof o.image === 'string' && isVanillaBlogImagePath(o.image) ? o.image : null;
    return {
      title: String(o.title ?? '').replace(/\r\n?/g, '\n').replace(/\n/g, ' ').slice(0, VANILLA_BLOG_TITLE_MAX),
      body: String(o.body ?? '').replace(/\r\n?/g, '\n').slice(0, VANILLA_BLOG_BODY_MAX),
      image,
    };
  });
}
export function vanillaBlogItemProblem(it: VanillaBlogItem): string | null {
  if (!it.title.trim()) return 'タイトルが空です';
  if (!it.body.trim()) return '本文が空です';
  if ([...it.title].length > VANILLA_BLOG_TITLE_MAX) return `タイトルは${VANILLA_BLOG_TITLE_MAX}文字までです`;
  if (vanillaBlogBodyHtml(it.body).length > VANILLA_BLOG_BODY_MAX + 1000) return '本文が長すぎます';
  return null;
}

/**
 * ★ バニラへ送る本文。バニラの店長ブログは本文を HTML として表示する（エディタは CKEditor）。
 *   ★ 入力した改行を <br> にする（ココア店長ブログ cocoaMailBody と同じ考え方）。行末にもう <br> や </p> があれば足さない。
 *   ★ ほかの文字には触らない（タグを打てばタグとして出る）。
 */
export function vanillaBlogBodyHtml(body: string): string {
  const plain = String(body ?? '').replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
  if (plain === '') return '';
  const lines = plain.split('\n');
  const hasBreak = (line: string) => /<br\s*\/?>\s*$/i.test(line) || /<\/(p|div|li|ul|ol|h[1-6]|blockquote|table|tr)>\s*$/i.test(line);
  return lines.map((line, i) => (i === lines.length - 1 || hasBreak(line) ? line : line + '<br>')).join('\n');
}

// ── 時刻（朝6時はじまりの分。全国エステランキングと同じ物差し）──
export const vanillaMinLabel = zenkokuMinLabel;

export function sanitizeVanillaTimes(v: unknown): number[] {
  const list = (Array.isArray(v) ? v : []).map(Number).filter((t) => Number.isInteger(t) && t >= 360 && t < 1800);
  return [...new Set(list)].sort((a, b) => a - b).slice(0, VANILLA_BLOG_TIMES_MAX);
}

/**
 * ★ いま投稿するか。いちばん近い過去の予定時刻（今日の・朝6時はじまり）を出し、その時刻より後にまだ出せていなければ出す。
 *   ★ 始めた時刻（readAt）がその予定時刻より後なら、30分は始め直さない（二重に出さない）
 *   ★ 90分より遅れた予定はあきらめる（次の時刻を待つ）
 */
export function shouldRunVanillaBlog(args: {
  timesMin: number[]; now: Date; state: { lastAt: string | null; readAt: string | null };
}): { run: boolean; reason: string; dueAt: string | null } {
  const times = sanitizeVanillaTimes(args.timesMin);
  if (times.length === 0) return { run: false, reason: 'no_times', dueAt: null };
  const b = zenkokuBusinessMin(args.now);
  let t = -1;
  for (const x of times) if (x <= b) t = x;
  if (t < 0) return { run: false, reason: 'before_first_time', dueAt: null };
  const dueMs = zenkokuLastReset(args.now).getTime() + (t - 360) * 60000;
  const dueAt = new Date(dueMs).toISOString();
  const { lastAt, readAt } = args.state;
  if (lastAt && Date.parse(lastAt) >= dueMs - 60000) return { run: false, reason: 'done_for_time', dueAt };
  if (readAt && Date.parse(readAt) >= dueMs - 60000 && args.now.getTime() - Date.parse(readAt) < 30 * 60000) return { run: false, reason: 'recent_read', dueAt };
  if (args.now.getTime() - dueMs > 90 * 60000) return { run: false, reason: 'too_late', dueAt };
  return { run: true, reason: 'ok', dueAt };
}

/** 次に出す記事（next_item から順に、中身のそろった記事）。★ 無ければ null */
export function pickVanillaBlogItem(items: VanillaBlogItem[], nextItem: number): { item: VanillaBlogItem; index: number } | null {
  const n = items.length;
  if (n === 0) return null;
  const start = ((Number.isInteger(nextItem) ? nextItem : 0) % n + n) % n;
  for (let k = 0; k < n; k++) {
    const index = (start + k) % n;
    if (!vanillaBlogItemProblem(items[index])) return { item: items[index], index };
  }
  return null;
}

// ── 要求 ──
function baseHeaders(): Record<string, string> {
  return { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8' };
}
function q(s: VanillaSession): string {
  if (!/^[A-Za-z0-9%._\-~+=]{1,400}$/.test(s.sid) || !/^[A-Za-z0-9%._\-~+=]{1,400}$/.test(s.time)) throw new Error('ログインの印（entry_sid・entry_time）の形が違う');
  return '?entry_sid=' + s.sid + '&entry_time=' + s.time;
}
export function vanillaUrl(page: keyof typeof PATH, s: VanillaSession): string {
  return VANILLA_ORIGIN + PATH[page] + q(s);
}

/** ★ 認証情報が入る。★ 組むのは DB 側（app/lib/media/relayFlow.ts の firstStep）だけ */
export function buildVanillaLoginRequest(cred: { loginId: string; password: string }): RelayRequest {
  if (!cred.loginId || !cred.password) throw new Error('ログインIDかパスワードが空');
  const body = [['username', cred.loginId], ['password', cred.password], ['button', 'ログイン']]
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return {
    method: 'POST', url: VANILLA_LOGIN_URL,
    headers: { ...baseHeaders(), 'content-type': 'application/x-www-form-urlencoded', origin: VANILLA_ORIGIN, referer: VANILLA_LOGIN_URL },
    body,
  };
}

export function buildVanillaGetRequest(page: keyof typeof PATH, s: VanillaSession, cookie: string, referer?: string): RelayRequest {
  return { method: 'GET', url: vanillaUrl(page, s), headers: { ...baseHeaders(), referer: referer ?? vanillaUrl('top', s), ...(cookie ? { cookie } : {}) }, body: '' };
}

type MultipartRequest = { method: 'POST'; url: string; headers: Record<string, string>; multipart: RelayMultipart };
function multipartHeaders(cookie: string, referer: string): Record<string, string> {
  // ★ content-type は付けない（multipart の境界は中継役が決める）。expect は空（curl の 100-continue を付けさせない）
  return { ...baseHeaders(), origin: VANILLA_ORIGIN, referer, expect: '', ...(cookie ? { cookie } : {}) };
}

/** ★ 確認画面へ（まだ載らない）。status=1（公開）・予約なし（すぐ公開） */
export function buildVanillaBlogConfirmRequest(s: VanillaSession, cookie: string, item: VanillaBlogItem, imageUrl: string | null): MultipartRequest {
  const p = vanillaBlogItemProblem(item);
  if (p) throw new Error(p);
  const fields: Record<string, string> = {
    status: '1', reservation: '', title: item.title.trim(), body: vanillaBlogBodyHtml(item.body), confirm: '確認する',
  };
  const files = imageUrl ? [{ field: 'image', url: imageUrl, filename: 'blog.jpg', contentType: 'image/jpeg' }] : [];
  return { method: 'POST', url: vanillaUrl('blog', s), headers: multipartHeaders(cookie, vanillaUrl('blog', s)), multipart: { fields, files } };
}

/** ★★ 投稿する（ここで載る）。確認画面の隠し値をそのまま送り返し、complete を足す（ページの JS と同じ） */
export function buildVanillaBlogPostRequest(s: VanillaSession, cookie: string, hidden: Record<string, string>): MultipartRequest {
  if (!hidden.vanilla_token) throw new Error('確認画面の vanilla_token が無いまま投稿しない');
  if (!hidden.title || !hidden.body) throw new Error('確認画面にタイトルか本文が無いまま投稿しない');
  return { method: 'POST', url: vanillaUrl('blog', s), headers: multipartHeaders(cookie, vanillaUrl('blog', s)), multipart: { fields: { ...hidden, complete: '' }, files: [] } };
}

/** ★★★ 1本消す（取り返しがつかない・記事の画像も消える） */
export function buildVanillaBlogDeleteRequest(s: VanillaSession, cookie: string, token: string, blogId: string): MultipartRequest {
  if (!/^\d{1,12}$/.test(blogId)) throw new Error('記事の番号の形が違う');
  if (!token) throw new Error('一覧の vanilla_token が無いまま消さない');
  return {
    method: 'POST', url: vanillaUrl('list', s), headers: multipartHeaders(cookie, vanillaUrl('list', s)),
    multipart: { fields: { conditions: 'all', ascdesc: 'DESC1', limit: '10', vanilla_token: token, delete: blogId }, files: [] },
  };
}

// ── 画面を読む ──
const decodeEnt = (s: string) => s
  .replace(/&#(\d{1,7});/g, (_, d: string) => { const n = Number(d); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; })
  .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => { const n = parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; })
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? decodeEnt(m[2] ?? m[3] ?? m[4] ?? '') : null;
}
const stripTags = (s: string) => decodeEnt(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** ログイン画面か（ユーザー名とパスワードの欄がある） */
export function looksLikeVanillaLoginPage(html: string): boolean {
  const src = String(html ?? '');
  return /name=["']?username["'\s>]/i.test(src) && /type=["']?password["'\s>]/i.test(src);
}

/** 応答の Location か本文から、ログインの印（entry_sid・entry_time）を拾う。★ 値は URL に入っていた形のまま */
export function readVanillaSession(location: string, body: string): VanillaSession | null {
  for (const src of [String(location ?? ''), String(body ?? '').replace(/&amp;/g, '&')]) {
    const sid = /[?&]entry_sid=([A-Za-z0-9%._\-~+=]{1,400})/.exec(src)?.[1];
    const time = /[?&]entry_time=([A-Za-z0-9%._\-~+=]{1,400})/.exec(src)?.[1];
    if (sid && time) return { sid, time };
  }
  return null;
}

/** 管理画面のトップか（ログアウトの道があり、ログイン画面ではない） */
export function looksLikeVanillaTop(html: string): boolean {
  const src = String(html ?? '');
  return /\/entry\/logout/.test(src) && !looksLikeVanillaLoginPage(src);
}

/** 新規投稿のフォームが読めたか（タイトル・本文・確認するの3つ） */
export function looksLikeVanillaBlogForm(html: string): boolean {
  const src = String(html ?? '');
  return /name=["']title["']/i.test(src) && /name=["']body["']/i.test(src) && /name=["']confirm["']/i.test(src);
}

/** 画面の赤字（入力の不備など）を1行に。★ 店舗様に見せる */
export function vanillaErrorText(html: string): string {
  const src = String(html ?? '');
  const m = /<(?:p|div|span|li|font)\b[^>]*(?:class=["'][^"']*(?:error|err|alert|caution)[^"']*["']|color=["']?(?:red|#f00|#ff0000))[^>]*>([\s\S]{1,400}?)<\/(?:p|div|span|li|font)>/i.exec(src);
  return m ? stripTags(m[1]).slice(0, 100) : '';
}

/**
 * 確認画面（「投稿する」がある）の隠し値。★ 無ければ null（入力が断られて同じ画面に戻ったなど）
 *   ★ F1 の中の hidden をすべてそのまま送り返す（status・title・tmp_img・body・vanilla_token）
 */
export function parseVanillaBlogConfirm(html: string): Record<string, string> | null {
  const src = String(html ?? '');
  if (!/name=["']complete["']/i.test(src)) return null;
  const form = /<form\b[^>]*>([\s\S]*?name=["']complete["'][\s\S]*?)<\/form>/i.exec(src)?.[1] ?? src;
  const hidden: Record<string, string> = {};
  for (const im of form.matchAll(/<input\b[^>]*>/gi)) {
    const t = im[0];
    if ((attr(t, 'type') ?? '').toLowerCase() !== 'hidden') continue;
    const name = attr(t, 'name');
    if (!name || !/^[A-Za-z0-9_\-\[\]]{1,64}$/.test(name)) continue;
    hidden[name] = attr(t, 'value') ?? '';
  }
  if (!hidden.vanilla_token) return null;
  return hidden;
}

export type VanillaBlogRow = { id: string; title: string; state: string; created: string };
/** 一覧（作成日時の降順）。created は 'YYYY/MM/DD HH:MM:SS'（日本時間） */
export function parseVanillaBlogList(html: string): { rows: VanillaBlogRow[]; token: string | null; seen: boolean } {
  const src = String(html ?? '');
  const rows: VanillaBlogRow[] = [];
  for (const m of src.matchAll(/<tr\b[^>]*class=["'][^"']*\bblog_content\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    const body = m[1];
    const id = /c_delete(\d{1,12})/.exec(body)?.[1] ?? /blog_id=(\d{1,12})/.exec(body)?.[1];
    if (!id) continue;
    const title = stripTags(/<span\b[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1] ?? '');
    const create = stripTags(/<span\b[^>]*class=["']create["'][^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1] ?? '');
    const dm = /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/.exec(create);
    rows.push({ id, title, state: create.replace(dm?.[1] ?? '', '').trim(), created: dm?.[1] ?? '' });
  }
  let token: string | null = null;
  for (const im of src.matchAll(/<input\b[^>]*>/gi)) {
    if (attr(im[0], 'name') === 'vanilla_token') { token = attr(im[0], 'value'); break; }
  }
  return { rows, token, seen: /blog_list|店長ブログ一覧/.test(src) && !looksLikeVanillaLoginPage(src) };
}

/** 'YYYY/MM/DD HH:MM:SS'（日本時間）が今から何分前か */
export function vanillaMinutesAgo(created: string, now = new Date()): number {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(created);
  if (!m) return Infinity;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) - 9 * 3600 * 1000;
  return (now.getTime() - ms) / 60000;
}

const normTitle = (s: string) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');
/** 今出した記事を一覧から見つける（題名が同じで、15分以内に作られた・いちばん新しいもの） */
export function findPostedVanillaBlog(rows: VanillaBlogRow[], title: string, before: string[], now = new Date()): VanillaBlogRow | null {
  const want = normTitle(title);
  return rows.find((r) => normTitle(r.title) === want && !before.includes(r.id) && vanillaMinutesAgo(r.created, now) < 15)
    ?? rows.find((r) => normTitle(r.title) === want && vanillaMinutesAgo(r.created, now) < 15)
    ?? null;
}

export const VANILLA_BLOG_OUTCOME_LABEL: Record<string, string> = {
  no_items: '記事が登録されていません',
};
