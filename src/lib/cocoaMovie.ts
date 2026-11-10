// ココア（風俗求人ココア・cocoa-job.jp）の店長ブログの「動画の記事」（第1917便・2026-11-10・カッキーさん）。★ 純粋関数だけ。
//
// ★★ やり方（11/10 21:19 にココア（A）で1回試して確かめた）:
//   ① 駅ちかの管理画面トップ（/admin）にある「風俗求人ココアの管理画面へ移動する」のフォーム（email・password が隠し項目）で
//      POST https://cocoa-job.jp/entry/login/ → ココアの管理画面（URL に lid が付く・Cookie も要る）
//   ② GET /entry/blog/?lid=… の一覧で、いちばん新しい動画の記事（type_flg=2）を探す
//   ③ POST /entry/blog/copy/?lid=…（copy=複製・id・display_flg・type_flg=2）→ 中身の入った投稿画面（★ これだけでは増えない・残り回数も減らない）
//   ④ その画面のフォームをそのまま POST /entry/blog/copy/?lid=…（entry=ブログを投稿する）→「ブログを投稿しました。」★ 1件増える・残りが1回減る
//      ★ 動画は post_val_movie（<記事番号>/<ファイル名>）で前の記事のものを指す。★ 動画ファイルは送らない
//   ⑤ 一覧で新しい記事を確かめ、同じタイトルの古い動画の記事を消す（ベンリーと同じ）: POST /entry/blog/?lid=…（delete=削除・id・movie）
// ★ lid は鍵と同じ扱い（記録・画面に出さない）。★ ココアのログインID・パスワードは要求の中だけ（文脈・記録に残さない）

import { RELAY_USER_AGENT } from './relayUserAgent';

export const COCOA_ORIGIN = 'https://cocoa-job.jp';
export const COCOA_LOGIN_URL = COCOA_ORIGIN + '/entry/login/';
export const COCOA_MOVIE_ROWS_MAX = 6;
/** 一度に消す古い記事の上限（取り違えても被害を小さく） */
export const COCOA_MOVIE_DELETE_MAX = 3;

export type CocoaMovieRow = { min: number };

export function normalizeCocoaMovieSchedule(v: unknown): CocoaMovieRow[] {
  const rows = (Array.isArray(v) ? v : []).map((x) => ({ min: Number((x && typeof x === 'object' ? (x as Record<string, unknown>).min : NaN)) }))
    .filter((r) => Number.isInteger(r.min) && r.min >= 360 && r.min < 1800);
  const seen = new Set<number>();
  return rows.sort((a, b) => a.min - b.min).filter((r) => (seen.has(r.min) ? false : (seen.add(r.min), true))).slice(0, COCOA_MOVIE_ROWS_MAX);
}

const JST = 9 * 3600 * 1000;
function elapsedSinceSix(now: Date): number {
  const j = new Date(now.getTime() + JST);
  return ((j.getUTCHours() * 60 + j.getUTCMinutes() - 360) % 1440 + 1440) % 1440;
}
export function cocoaMovieMinLabel(m: number): string {
  return m >= 1440 ? `翌${Math.floor((m - 1440) / 60)}:${String(m % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
/** ★ いま出すか（いちばん近い過去の予定時刻を、まだ受け持っていなければ）。★ 90分より遅れた予定は出さない */
export function shouldPostCocoaMovie(input: { now: Date; schedule: CocoaMovieRow[]; lastDueAt: string | null }): { post: boolean; reason: string; dueAt: string | null } {
  if (input.schedule.length === 0) return { post: false, reason: 'no-schedule', dueAt: null };
  const elapsed = elapsedSinceSix(input.now);
  let row: CocoaMovieRow | null = null;
  for (const r of input.schedule) if (r.min <= 360 + elapsed) row = r;
  if (!row) return { post: false, reason: 'before-time', dueAt: null };
  const dueMs = input.now.getTime() - elapsed * 60000 - (input.now.getTime() % 60000) + (row.min - 360) * 60000;
  const dueAt = new Date(dueMs).toISOString();
  if (input.lastDueAt && Date.parse(input.lastDueAt) >= dueMs - 60000) return { post: false, reason: 'done', dueAt };
  if (input.now.getTime() - dueMs > 90 * 60000) return { post: false, reason: 'too-late', dueAt };
  return { post: true, reason: 'ok', dueAt };
}

// ── 画面を読む（★ ブラウザの DOM が無いので、タグを順に拾う） ──
const unesc = (s: string) => String(s ?? '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag: string, name: string): string | null => {
  const m = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag);
  return m ? unesc(m[1] ?? m[2] ?? m[3] ?? '') : null;
};
export type HtmlForm = { action: string; method: string; html: string; fields: Array<[string, string]> };
/** フォームを拾う。fields はブラウザが送るもの（hidden・text・チェックの付いた radio/checkbox・textarea・選ばれた option）。★ submit ボタンは入れない */
export function parseForms(html: string): HtmlForm[] {
  const s = String(html ?? '');
  const out: HtmlForm[] = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const open = '<form' + m[1] + '>';
    const inner = m[2];
    const fields: Array<[string, string]> = [];
    const tre = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>|<(input|select)\b([^>]*)>/gi;
    let t: RegExpExecArray | null;
    while ((t = tre.exec(inner)) !== null) {
      if (t[1] !== undefined) {
        const name = attr('<textarea' + t[1] + '>', 'name');
        if (name) fields.push([name, unesc(t[2] ?? '')]);
        continue;
      }
      const kind = t[3].toLowerCase();
      const tag = '<' + kind + t[4] + '>';
      const name = attr(tag, 'name');
      if (!name) continue;
      if (kind === 'select') {
        const end = inner.indexOf('</select>', t.index);
        const body = inner.slice(t.index, end < 0 ? undefined : end);
        const opts = [...body.matchAll(/<option\b([^>]*)>([^<]*)/gi)];
        const sel = opts.find((o) => /\sselected\b/i.test(o[1])) ?? opts[0];
        if (sel) fields.push([name, attr('<o' + sel[1] + '>', 'value') ?? unesc(sel[2]).trim()]);
        continue;
      }
      const type = (attr(tag, 'type') ?? 'text').toLowerCase();
      if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
      if ((type === 'radio' || type === 'checkbox') && !/\schecked\b/i.test(tag)) continue;
      fields.push([name, attr(tag, 'value') ?? (type === 'checkbox' ? 'on' : '')]);
    }
    out.push({ action: attr(open, 'action') ?? '', method: (attr(open, 'method') ?? 'get').toLowerCase(), html: inner, fields });
  }
  return out;
}
const get = (f: HtmlForm, n: string) => f.fields.find(([k]) => k === n)?.[1] ?? null;

/** 駅ちかの管理画面トップから、ココアへ入るフォーム（email・password）。★ 値は返すだけ（どこにも書かない） */
export function parseCocoaEntryForm(html: string): { email: string; password: string } | null {
  for (const f of parseForms(html)) {
    if (!/cocoa-job\.jp\/entry\/login/i.test(f.action)) continue;
    const email = get(f, 'email'), password = get(f, 'password');
    if (email && password) return { email, password };
  }
  return null;
}
/** ログインのあとの行き先（Location か本文のリンク）から lid を取る */
export function extractCocoaLid(location: string, body: string): string | null {
  const m = /[?&]lid=([A-Za-z0-9%_\-.~]+)/.exec(String(location ?? '')) ?? /cocoa-job\.jp\/entry\/[a-z/]*\?lid=([A-Za-z0-9%_\-.~]+)/.exec(String(body ?? ''));
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}
export function looksLikeCocoaLoggedOut(html: string): boolean {
  const s = String(html ?? '');
  // ★ ココアの画面には駅ちかへのログインフォーム（/admin/login/・password）が常に入っているので、パスワード欄では判定しない
  return !/店長ブログ一覧/.test(s);
}

/** ★ title はタイトルと本文の頭がつながった文字（一覧の見た目どおり）。照らし合わせは「タイトル＋空白」で始まるか */
export type CocoaBlogRow = { id: string; at: string; title: string; isMovie: boolean; displayFlg: string; typeFlg: string; movie: string | null };
/** 店長ブログの一覧（新しい順）。★ 1行に「編集」「複製」「削除」のフォームがある */
export function parseCocoaBlogList(html: string): CocoaBlogRow[] {
  const s = String(html ?? '');
  const out: CocoaBlogRow[] = [];
  for (const tr of s.split(/<tr\b/i).slice(1)) {
    const body = tr.split(/<\/tr>/i)[0];
    const forms = parseForms('<x' + body);
    const copy = forms.find((f) => /blog\/copy/.test(f.action) && get(f, 'id'));
    if (!copy) continue;
    const del = forms.find((f) => f.fields.some(([k]) => k === 'delete') || /name=["']delete["']/.test(f.html));
    const id = get(copy, 'id')!;
    const cells = body.split(/<td\b/i).slice(1).map((c) => c.replace(/^[^>]*>/, '').split(/<\/td>/i)[0]);
    const text = (c: string | undefined) => unesc(String(c ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    out.push({
      id, at: text(cells[1]), title: text(cells[3]),
      isMovie: get(copy, 'type_flg') === '2', displayFlg: get(copy, 'display_flg') ?? '0', typeFlg: get(copy, 'type_flg') ?? '1',
      movie: del ? get(del, 'movie') : null,
    });
  }
  return out;
}
/** 投稿画面（複製）のフォーム。★ entry（ブログを投稿する）で送る */
export function parseCocoaCopyForm(html: string): { fields: Array<[string, string]>; title: string; movie: string } | null {
  const f = parseForms(html).find((x) => /blog\/copy/.test(x.action) && x.fields.some(([k]) => k === 'post_val_movie'));
  if (!f) return null;
  const movie = get(f, 'post_val_movie') ?? '';
  if (!movie || get(f, 'type_flg') !== '2') return null;
  return { fields: f.fields, title: get(f, 'title') ?? '', movie };
}
export function cocoaPosted(html: string): boolean { return /ブログを投稿しました/.test(String(html ?? '')); }
/** 「投稿・編集合わせて残り N回」 */
export function parseCocoaRemaining(html: string): number | null {
  const m = /残り\s*(\d+)\s*回/.exec(String(html ?? '').replace(/<[^>]*>/g, ' '));
  return m ? Number(m[1]) : null;
}

/** ★ 消す古い記事: 新しい記事が確かめられたときだけ。同じタイトル・動画・新しい記事以外・movie が分かるもの。★ 上限つき */
export function cocoaMovieDeleteTargets(rows: CocoaBlogRow[], newId: string, title: string): CocoaBlogRow[] {
  if (!newId || !rows.some((r) => r.id === newId)) return [];
  const t = title.trim();
  return rows.filter((r) => r.isMovie && r.id !== newId && (r.title === t || r.title.startsWith(t + ' ')) && !!r.movie && Number(r.id) < Number(newId)).slice(0, COCOA_MOVIE_DELETE_MAX);
}

// ── 要求を組む ──
function headers(cookie: string, referer: string, extra: Record<string, string> = {}): Record<string, string> {
  return { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer, ...(cookie ? { cookie } : {}), ...extra };
}
const enc = (parts: Array<[string, string]>) => parts.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
const q = (lid: string) => '?lid=' + encodeURIComponent(lid);
type Req = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: string };

export function buildCocoaLogin(form: { email: string; password: string }): Req {
  return {
    method: 'POST', url: COCOA_LOGIN_URL,
    headers: headers('', 'https://ranking-deli.jp/admin', { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://ranking-deli.jp' }),
    body: enc([['email', form.email], ['password', form.password], ['submit', '風俗求人ココアの管理画面へ移動する']]),
  };
}
export function buildCocoaList(cookie: string, lid: string): Req {
  return { method: 'GET', url: COCOA_ORIGIN + '/entry/blog/' + q(lid), headers: headers(cookie, COCOA_ORIGIN + '/entry/top/' + q(lid)), body: '' };
}
/** 複製の画面を開く（★ これだけでは記事は増えない） */
export function buildCocoaCopyOpen(cookie: string, lid: string, row: CocoaBlogRow): Req {
  if (!row.isMovie) throw new Error('動画の記事ではないので複製しない');
  return {
    method: 'POST', url: COCOA_ORIGIN + '/entry/blog/copy/' + q(lid),
    headers: headers(cookie, COCOA_ORIGIN + '/entry/blog/' + q(lid), { 'content-type': 'application/x-www-form-urlencoded', origin: COCOA_ORIGIN }),
    body: enc([['copy', '複製'], ['id', row.id], ['display_flg', row.displayFlg], ['type_flg', '2']]),
  };
}
/** ★★ 投稿（記事が1件増える） */
export function buildCocoaCopySubmit(cookie: string, lid: string, form: { fields: Array<[string, string]> }): Req {
  const parts: Array<[string, string]> = [...form.fields.filter(([k]) => k !== 'entry'), ['entry', 'ブログを投稿する']];
  return {
    method: 'POST', url: COCOA_ORIGIN + '/entry/blog/copy/' + q(lid),
    headers: headers(cookie, COCOA_ORIGIN + '/entry/blog/copy/' + q(lid), { 'content-type': 'application/x-www-form-urlencoded', origin: COCOA_ORIGIN }),
    body: enc(parts),
  };
}
/** ★★★ 古い記事を1件消す（取り返しがつかない）。★ 動画の記事（movie が分かるもの）だけ */
export function buildCocoaDelete(cookie: string, lid: string, row: CocoaBlogRow): Req {
  if (!row.isMovie || !row.movie || !row.movie.startsWith(row.id + '/')) throw new Error('消す記事の形が合わないので消さない');
  return {
    method: 'POST', url: COCOA_ORIGIN + '/entry/blog/' + q(lid),
    headers: headers(cookie, COCOA_ORIGIN + '/entry/blog/' + q(lid), { 'content-type': 'application/x-www-form-urlencoded', origin: COCOA_ORIGIN }),
    body: enc([['delete', '削除'], ['id', row.id], ['movie', row.movie]]),
  };
}
