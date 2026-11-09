// 駅ちか（駅ちか人気！風俗ランキング）のプラチナムマガジン（第1844便・2026-11-09・カッキーさん）。★ 純粋関数だけ。
//
// ★★ ベンリーと同じ使い方: 決めた時刻に、同じタイトル・本文（HTML）のマガジンを投稿する（オイルクエスト様は毎日 12:20・22:20）
// ★★★ 駅ちかの画面（11/9 19:3x・枠1 博多で読むだけで確かめた）:
//   新規 GET  /admin/platinummagazine/create/ → フォーム POST /admin/platinummagazine/store（urlencoded）
//        published_at_year・published_at_month・published_at_day・published_at_hour・published_at_minute（★ 分は 00/10/…/50 の6つ・2桁。年月日時は 2026/1/1/0 のように0なし）・title（50文字）・body（HTML・20000文字）
//        ★ CSRF のトークンは無かった
//   一覧 GET  /admin/platinummagazine/ → 行「2026年11月09日 12:20:00 ☆マガジン限定割引☆ 投稿済み 1167 編集」
//   ★ 受け取るのは駅ちかの会員（マイショップ登録者）。宛先は駅ちかが決める（コネックエフは持たない）

import { RELAY_USER_AGENT } from './relayUserAgent';

export const EKICHIKA_MAGAZINE_CREATE_URL = 'https://ranking-deli.jp/admin/platinummagazine/create/';
export const EKICHIKA_MAGAZINE_STORE_URL = 'https://ranking-deli.jp/admin/platinummagazine/store';
export const EKICHIKA_MAGAZINE_LIST_URL = 'https://ranking-deli.jp/admin/platinummagazine/';
export const EKICHIKA_MAGAZINE_TITLE_MAX = 50;
export const EKICHIKA_MAGAZINE_BODY_MAX = 20000;
export const EKICHIKA_MAGAZINE_ROWS_MAX = 6;

export type EkichikaMagazineRow = { min: number; title: string; body: string };

export function normalizeMagazineSchedule(v: unknown): EkichikaMagazineRow[] {
  const rows = (Array.isArray(v) ? v : []).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return { min: Number(o.min), title: String(o.title ?? '').trim().slice(0, EKICHIKA_MAGAZINE_TITLE_MAX), body: String(o.body ?? '').slice(0, EKICHIKA_MAGAZINE_BODY_MAX) };
  }).filter((r) => Number.isInteger(r.min) && r.min >= 360 && r.min < 1800);
  const seen = new Set<number>();
  return rows.sort((a, b) => a.min - b.min).filter((r) => (seen.has(r.min) ? false : (seen.add(r.min), true))).slice(0, EKICHIKA_MAGAZINE_ROWS_MAX);
}
export function magazineRowProblem(r: EkichikaMagazineRow): string | null {
  if (!r.title) return 'タイトルを入れてください';
  if (!r.body.trim()) return '本文を入れてください';
  return null;
}

const JST = 9 * 3600 * 1000;
function elapsedSinceSix(now: Date): number {
  const j = new Date(now.getTime() + JST);
  const m = j.getUTCHours() * 60 + j.getUTCMinutes();
  return ((m - 360) % 1440 + 1440) % 1440;
}
export function magazineMinLabel(m: number): string {
  return m >= 1440 ? `翌${Math.floor((m - 1440) / 60)}:${String(m % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** ★ いま送るか（いちばん近い過去の予定時刻を、まだ受け持っていなければ）。★ 90分より遅れた予定は送らない */
export function shouldPostEkichikaMagazine(input: { now: Date; schedule: EkichikaMagazineRow[]; lastDueAt: string | null }):
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

/** ★ 投稿日時（日本時間）。★ 駅ちかの分は10分刻みなので、今の時刻を10分単位に切り上げる（ベンリーも 22:13 に送って 22:20 になっていた） */
export function magazinePublishAt(now: Date): { y: number; mo: number; d: number; h: number; mi: number; label: string } {
  // ★ 10分単位に切り上げ（ちょうど xx:x0:00 ならそのまま）
  const ms = Math.ceil((now.getTime() + JST) / 600000) * 600000;
  const u = new Date(ms);
  const r = { y: u.getUTCFullYear(), mo: u.getUTCMonth() + 1, d: u.getUTCDate(), h: u.getUTCHours(), mi: u.getUTCMinutes() };
  return { ...r, label: `${r.y}年${String(r.mo).padStart(2, '0')}月${String(r.d).padStart(2, '0')}日 ${String(r.h).padStart(2, '0')}:${String(r.mi).padStart(2, '0')}` };
}

// ── 画面を読む ──
export function looksLikeMagazineForm(html: string): boolean {
  const s = String(html ?? '');
  return /platinummagazine\/store/.test(s) && /name=["']title["']/.test(s) && /name=["']body["']/.test(s);
}
/** ★ フォームの隠し項目（今は無いが、駅ちかが鍵を足したときにそのまま送れるように） */
export function parseMagazineHidden(html: string): Array<[string, string]> {
  const s = String(html ?? '');
  const i = s.search(/platinummagazine\/store/);
  const form = i < 0 ? '' : s.slice(i, s.indexOf('</form>', i) < 0 ? undefined : s.indexOf('</form>', i));
  const out: Array<[string, string]> = [];
  for (const m of form.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/type=["']?hidden/i.test(tag)) continue;
    const n = /name=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!n) continue;
    const v = /value=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    out.push([n, v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')]);
  }
  return out;
}
/** 一覧の行（投稿日時 'YYYY年MM月DD日 HH:MM'・タイトル） */
export function parseMagazineList(html: string): Array<{ at: string; title: string }> {
  const t = String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const out: Array<{ at: string; title: string }> = [];
  const re = /(\d{4}年\d{2}月\d{2}日)\s+(\d{2}:\d{2}):\d{2}\s+(.+?)\s+(投稿済み|予約中|配信済み|下書き)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) out.push({ at: m[1] + ' ' + m[2], title: m[3].trim() });
  return out;
}

// ── 要求を組む ──
function headers(cookie: string, referer: string, extra: Record<string, string> = {}): Record<string, string> {
  return { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer, cookie, ...extra };
}
export function buildMagazineGet(cookie: string, url: string, referer = 'https://ranking-deli.jp/admin'): { method: 'GET'; url: string; headers: Record<string, string>; body: '' } {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return { method: 'GET', url, headers: headers(cookie, referer), body: '' };
}
/** ★★ 投稿（相手を書き換える唯一の要求） */
export function buildMagazineStore(cookie: string, at: ReturnType<typeof magazinePublishAt>, row: { title: string; body: string }, hidden: Array<[string, string]> = []): { method: 'POST'; url: string; headers: Record<string, string>; body: string } {
  if (!cookie) throw new Error('Cookie が無いまま投稿しない');
  const p = magazineRowProblem({ min: 360, ...row });
  if (p) throw new Error(p);
  const own = new Set(['published_at_year', 'published_at_month', 'published_at_day', 'published_at_hour', 'published_at_minute', 'title', 'body']);
  const parts: Array<[string, string]> = [
    ...hidden.filter(([k]) => !own.has(k)),
    ['published_at_year', String(at.y)], ['published_at_month', String(at.mo)], ['published_at_day', String(at.d)],
    ['published_at_hour', String(at.h)], ['published_at_minute', String(at.mi).padStart(2, '0')],
    ['title', row.title], ['body', row.body],
  ];
  return {
    method: 'POST', url: EKICHIKA_MAGAZINE_STORE_URL,
    headers: headers(cookie, EKICHIKA_MAGAZINE_CREATE_URL, { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://ranking-deli.jp' }),
    body: parts.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'),
  };
}
