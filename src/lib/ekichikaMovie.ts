// 駅ちか（駅ちか人気！風俗ランキング）の動画投稿（第1840便・2026-11-09・カッキーさん）。★ 純粋関数だけ。
//
// ★★ ベンリーと同じ使い方: 女の子の動画を決めた時刻に上げ直し、前の「同じ女の子・同じタイトル」の記事は消す（設計メモ_2026-11-09_駅ちか動画投稿.md）
// ★★★ 駅ちかの画面（11/9 18:1x・読むだけで確かめた）:
//   投稿  GET  /admin/movies/edit → フォーム（multipart）: display_flg（1=表示）・girls_id・movie_img_upload（動画）・title・body・fuel_csrf_token・maildiary_submit
//         女の子は <li id="<girls_id>" class="select_girls"><div class="girl-name">りな</div>…（画面のJSが girls_id に li の id を入れる）
//         POST /admin/movies/edit/
//   一覧  GET  /admin/movies/ → <li class="md_list_column_disp"> delete[]=<記事番号>・md_date_column・md_poster_column（女の子）・<span class="title">・<span class="body">
//   削除  POST /admin/movies/（page・shop_id・delete[]）＝「チェックを削除」
//   決まり: 1日5件まで・最大256MB・同じ女の子×同じタイトルを5分以内に出すと反映されない・3ヶ月で消える

import { RELAY_USER_AGENT } from './relayUserAgent';
import type { RelayMultipart } from './relayMultipart';

export const EKICHIKA_MOVIE_EDIT_URL = 'https://ranking-deli.jp/admin/movies/edit';
export const EKICHIKA_MOVIE_POST_URL = 'https://ranking-deli.jp/admin/movies/edit/';
export const EKICHIKA_MOVIE_LIST_URL = 'https://ranking-deli.jp/admin/movies/';
export const EKICHIKA_MOVIE_DAILY_MAX = 5;
export const EKICHIKA_MOVIE_TITLE_MAX = 50;
export const EKICHIKA_MOVIE_BODY_MAX = 1000;
// ★ 第1841便: 駅ちかの上限は256MBだが、Supabase の使いすぎ防止（Spend cap）を ON にしているため1ファイル50MBまで（カッキーさん）
export const EKICHIKA_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CONECF_VIDEO_BUCKET = 'conecf-videos';

/** 動画の置き場（conecf-videos の中）。★ <店>/<時刻>_<英数字>.mp4|mov だけ */
export function isConecfVideoPath(p: string): boolean {
  return /^\d{1,10}\/\d{10,15}_[A-Za-z0-9]{1,40}\.(mp4|mov)$/.test(String(p ?? ''));
}

export type EkichikaMovieRow = { min: number; girlName: string; videoId: number; title: string; body: string; deleteSame: boolean };

export function normalizeMovieSchedule(v: unknown): EkichikaMovieRow[] {
  const rows = (Array.isArray(v) ? v : []).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return {
      min: Number(o.min),
      girlName: String(o.girlName ?? '').trim().slice(0, 40),
      videoId: Number(o.videoId),
      title: String(o.title ?? '').trim().slice(0, EKICHIKA_MOVIE_TITLE_MAX),
      body: String(o.body ?? '').replace(/\r\n/g, '\n').slice(0, EKICHIKA_MOVIE_BODY_MAX),
      deleteSame: o.deleteSame !== false,
    };
  }).filter((r) => Number.isInteger(r.min) && r.min >= 360 && r.min < 1800);
  const seen = new Set<number>();
  return rows.sort((a, b) => a.min - b.min).filter((r) => (seen.has(r.min) ? false : (seen.add(r.min), true))).slice(0, EKICHIKA_MOVIE_DAILY_MAX);
}
export function movieRowProblem(r: EkichikaMovieRow): string | null {
  if (!r.girlName) return '女の子を選んでください';
  if (!Number.isInteger(r.videoId) || r.videoId <= 0) return '動画を選んでください';
  if (!r.title) return 'タイトルを入れてください';
  if (!r.body.trim()) return '本文を入れてください';
  return null;
}

const JST = 9 * 3600 * 1000;
/** 朝6時からの経過分（0〜1439） */
function elapsedSinceSix(now: Date): number {
  const j = new Date(now.getTime() + JST);
  const m = j.getUTCHours() * 60 + j.getUTCMinutes();
  return ((m - 360) % 1440 + 1440) % 1440;
}
export function movieMinLabel(m: number): string {
  return m >= 1440 ? `翌${Math.floor((m - 1440) / 60)}:${String(m % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** ★ いま送るか（いちばん近い過去の予定時刻を、まだ受け持っていなければ）。★ 90分より遅れた予定は送らない */
export function shouldPostEkichikaMovie(input: { now: Date; schedule: EkichikaMovieRow[]; lastDueAt: string | null }):
  { post: boolean; reason: string; dueAt: string | null; index: number } {
  if (input.schedule.length === 0) return { post: false, reason: 'no-schedule', dueAt: null, index: -1 };
  const elapsed = elapsedSinceSix(input.now);
  const b = 360 + elapsed;
  let index = -1;
  input.schedule.forEach((r, i) => { if (r.min <= b) index = i; });
  if (index < 0) return { post: false, reason: 'before-time', dueAt: null, index };
  const dayStartMs = input.now.getTime() - elapsed * 60000 - (input.now.getTime() % 60000);
  const dueMs = dayStartMs + (input.schedule[index].min - 360) * 60000;
  const dueAt = new Date(dueMs).toISOString();
  if (input.lastDueAt && Date.parse(input.lastDueAt) >= dueMs - 60000) return { post: false, reason: 'done', dueAt, index };
  if (input.now.getTime() - dueMs > 90 * 60000) return { post: false, reason: 'too-late', dueAt, index };
  return { post: true, reason: 'ok', dueAt, index };
}

// ── 画面を読む ──
const decodeEnt = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const stripTags = (s: string) => decodeEnt(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export const normMovieName = (s: string) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');

export type EkichikaMovieForm = { csrf: string; girls: Array<{ id: string; name: string }> };
export function parseEkichikaMovieForm(html: string): EkichikaMovieForm | null {
  const src = String(html ?? '');
  if (!/name=["']movie_img_upload["']/.test(src)) return null;
  const csrf = /name=["']fuel_csrf_token["'][^>]*value=["']([^"']+)["']|value=["']([^"']+)["'][^>]*name=["']fuel_csrf_token["']/.exec(src);
  const girls: Array<{ id: string; name: string }> = [];
  const re = /<li\b[^>]*\bid=["'](\d{1,12})["'][^>]*class=["'][^"']*\bselect_girls\b[^"']*["'][^>]*>([\s\S]*?)<\/li>|<li\b[^>]*class=["'][^"']*\bselect_girls\b[^"']*["'][^>]*\bid=["'](\d{1,12})["'][^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const id = m[1] ?? m[3];
    const inner = m[2] ?? m[4] ?? '';
    const name = stripTags(/<div\b[^>]*class=["'][^"']*\bgirl-name\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(inner)?.[1] ?? '');
    if (id && name) girls.push({ id, name });
  }
  return { csrf: csrf ? (csrf[1] ?? csrf[2]) : '', girls };
}

export type EkichikaMovieListRow = { id: string; date: string; poster: string; title: string; body: string };
export function parseEkichikaMovieList(html: string): { rows: EkichikaMovieListRow[]; shopId: string; formSeen: boolean } {
  const src = String(html ?? '');
  const shopId = /name=["']shop_id["'][^>]*value=["'](\d+)["']|value=["'](\d+)["'][^>]*name=["']shop_id["']/.exec(src);
  const rows: EkichikaMovieListRow[] = [];
  const re = /<li\b[^>]*class=["'][^"']*\bmd_list_column_disp\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const b = m[1];
    const id = /name=["']delete\[\]["'][^>]*value=["'](\d+)["']|value=["'](\d+)["'][^>]*name=["']delete\[\]["']/.exec(b);
    if (!id) continue;
    const col = (c: string) => stripTags(new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${c}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i').exec(b)?.[1] ?? '');
    rows.push({
      id: id[1] ?? id[2],
      date: col('md_date_column'),
      poster: col('md_poster_column'),
      title: stripTags(/<span\b[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/span>/i.exec(b)?.[1] ?? ''),
      body: stripTags(/<span\b[^>]*class=["']body["'][^>]*>([\s\S]*?)<\/span>/i.exec(b)?.[1] ?? ''),
    });
  }
  return { rows, shopId: shopId ? (shopId[1] ?? shopId[2]) : '', formSeen: /id=["']md_form["']/.test(src) };
}

/** 消す記事（同じ女の子・同じタイトル） */
export function sameMovieRows(rows: EkichikaMovieListRow[], girlName: string, title: string): EkichikaMovieListRow[] {
  const g = normMovieName(girlName), t = normMovieName(title);
  return rows.filter((r) => normMovieName(r.poster) === g && normMovieName(r.title) === t);
}

// ── 要求を組む ──
function headers(cookie: string, referer: string, extra: Record<string, string> = {}): Record<string, string> {
  return { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer, cookie, ...extra };
}
export function buildMovieGet(cookie: string, url: string, referer = 'https://ranking-deli.jp/admin'): { method: 'GET'; url: string; headers: Record<string, string>; body: '' } {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return { method: 'GET', url, headers: headers(cookie, referer), body: '' };
}
/** ★★ 削除（「チェックを削除」と同じ）。★ 消すのは渡した記事番号だけ */
export function buildMovieDelete(cookie: string, shopId: string, ids: string[]): { method: 'POST'; url: string; headers: Record<string, string>; body: string } {
  if (!cookie) throw new Error('Cookie が無いまま消さない');
  if (!/^\d{1,12}$/.test(shopId)) throw new Error('店舗番号が読めていない');
  const list = ids.filter((x) => /^\d{1,12}$/.test(x));
  if (list.length === 0) throw new Error('消す記事が無い');
  const body = ['page=1', 'shop_id=' + shopId, ...list.map((id) => encodeURIComponent('delete[]') + '=' + id)].join('&');
  return { method: 'POST', url: EKICHIKA_MOVIE_LIST_URL, headers: headers(cookie, EKICHIKA_MOVIE_LIST_URL, { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://ranking-deli.jp' }), body };
}
/** ★★★ 投稿（multipart・動画は署名付き URL から VPS が取る） */
export function buildMoviePost(cookie: string, form: EkichikaMovieForm, girlId: string, row: { title: string; body: string }, video: { url: string; contentType: string }):
  { method: 'POST'; url: string; headers: Record<string, string>; multipart: RelayMultipart } {
  if (!cookie) throw new Error('Cookie が無いまま投稿しない');
  if (!form.csrf) throw new Error('投稿の鍵（fuel_csrf_token）が読めていない');
  if (!/^\d{1,12}$/.test(girlId)) throw new Error('女の子の番号の形が違う');
  if (!row.title.trim() || !row.body.trim()) throw new Error('タイトルか本文が空');
  const ext = video.contentType === 'video/quicktime' ? 'mov' : 'mp4';
  return {
    method: 'POST', url: EKICHIKA_MOVIE_POST_URL,
    // ★ content-type は付けない（multipart の境界は中継役が決める）
    headers: { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', origin: 'https://ranking-deli.jp', referer: EKICHIKA_MOVIE_EDIT_URL, cookie },
    multipart: {
      fields: { display_flg: '1', girls_id: girlId, title: row.title, body: row.body, fuel_csrf_token: form.csrf, maildiary_submit: '' },
      files: [{ field: 'movie_img_upload', url: video.url, filename: 'movie.' + ext, contentType: video.contentType }],
    },
  };
}

export const EKICHIKA_MOVIE_OUTCOME: Record<string, string> = {
  no_girl: '駅ちかにその女の子がいませんでした',
  no_video: '動画が見つかりませんでした',
};
