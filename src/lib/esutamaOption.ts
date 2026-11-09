// エステ魂【オプション】をコネックエフから押す（第1799便・2026-11-09・カッキーさんの決定）。★ 純粋関数だけ。
//
// ★ 運営が /admin で ON にした店だけ（conecf_esutama_options.admin_enabled）。店舗様はコネックエフで自動の ON/OFF と時間を決める。
// ★★★ 実測（2026-11-09 未明・オイルクエスト様の管理画面・許可を得て1回ずつ押した）: 設計メモ_2026-11-09_エステ魂オプションの自動押し_実測.md
//   集客ブースト = ご案内状況（/admin/go_now/）の「「◎今すぐご案内可」で表示」
//     POST /admin/go_now/post_shop_wait/ ← #ShopWaitSettingForm を丸ごと（出勤者のご案内状況は今の値のまま）＋ type=1 ＋ ctk
//     応答 {"0":"OK","1":"<h3>【◎ 今すぐご案内可】でご案内状況を表示しました。</h3>…"}。1回で1時間。1日24回（BOOSTER 契約で無制限）・朝6時に戻る
//   セラピストアピール = /admin/cast/appeal/ の1人ずつの「アピールする」
//     POST /admin_post/single_appeal_exec ← post_data=cast,cast_appeal,<エステ魂のセラピストID> ＋ ctk（集客アピールと同じ）
//     成功すると画面が読み直される（応答の形は見ていない）→ 読み直して、その子の最終アピールが新しくなったか／残りが減ったかで決める
//     ★ 誰を押すか（カッキーさん）: その日の出勤者のうち、最終アピールがいちばん古い子（一度も無い子が先）を、出勤時間内に
//   求人ワンクリックアピール = /admin/job/appeal/（求人情報・お仕事体験談）。★ 2026-11-09 07:42 に実測（求人情報を1回押した: 残り 10→9・求人一覧 130位→1位）
//     POST /admin_post/single_appeal_exec ← post_data=shop_job,job_appeal ／ shop_job_exp,job_appeal ＋ ctk（集客アピールと同じ形）。1日10回・朝6時に戻る
//     ★ 時刻で押す（ベンリーと同じ 10:04・20:06・22:00）。1回の周で2行とも（残りがある行だけ）押す

import { encodePayload } from './ekichikaWorkParse';
import { RELAY_USER_AGENT } from './relayUserAgent';
import { readEsutamaCsrf } from './esutamaParse';
import { parseEsutamaAppealTime } from './esutamaAppeal';

export type EsutamaOptKey = 'shop_boost' | 'cast_appeal' | 'job_appeal' | 'job_now';
export const ESUTAMA_OPT_KEYS: EsutamaOptKey[] = ['shop_boost', 'cast_appeal', 'job_appeal', 'job_now'];
export const ESUTAMA_OPT_LABEL: Record<EsutamaOptKey, string> = {
  shop_boost: '集客ブースト', cast_appeal: 'セラピストアピール', job_appeal: '求人ワンクリックアピール', job_now: '本日体験入店',
};
/** ★ 押す仕組みができているもの。★ job_appeal は実測してから */
export const ESUTAMA_OPT_READY: Record<EsutamaOptKey, boolean> = { shop_boost: true, cast_appeal: true, job_appeal: true, job_now: true };
/** ★ 求人ワンクリックアピールで押す行（求人情報 → お仕事体験談） */
export const ESUTAMA_JOB_APPEAL_ROWS = ['shop_job,job_appeal', 'shop_job_exp,job_appeal'] as const;
export const ESUTAMA_JOB_APPEAL_LABEL: Record<string, string> = { 'shop_job,job_appeal': '求人情報', 'shop_job_exp,job_appeal': 'お仕事体験談' };
/** ★ ベンリーと同じ時刻（10:04・20:06・22:00）。朝6時はじまりの分 */
export const ESUTAMA_JOB_APPEAL_TIMES = [604, 1206, 1320];

export const ESUTAMA_GO_NOW_URL = 'https://estama.jp/admin/go_now/';
export const ESUTAMA_GO_NOW_POST_URL = 'https://estama.jp/admin/go_now/post_shop_wait/';
export const ESUTAMA_CAST_APPEAL_URL = 'https://estama.jp/admin/cast/appeal/';
export const ESUTAMA_SINGLE_APPEAL_URL = 'https://estama.jp/admin_post/single_appeal_exec';

export function esutamaOptPageUrl(key: EsutamaOptKey): string {
  return key === 'shop_boost' ? ESUTAMA_GO_NOW_URL : key === 'cast_appeal' ? ESUTAMA_CAST_APPEAL_URL : key === 'job_now' ? ESUTAMA_JOB_NOW_URL : 'https://estama.jp/admin/job/appeal/';
}

// ── 時刻（エステ魂の1日は朝6時に替わる） ──
const JST = 9 * 3600 * 1000;
/** 朝6時を1日のはじめにした分（6:00 = 360 … 翌5:59 = 1799）。★ 0〜5時台は 1440 を足す */
export function businessMinOf(now: Date): number {
  const j = new Date(now.getTime() + JST);
  const m = j.getUTCHours() * 60 + j.getUTCMinutes();
  return m < 360 ? m + 1440 : m;
}
/** いちばん近い過去の朝6時（回数が戻る時刻） */
export function lastResetAt(now: Date): Date {
  const j = new Date(now.getTime() + JST);
  let ms = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), 6, 0, 0) - JST;
  if (ms > now.getTime()) ms -= 24 * 3600 * 1000;
  return new Date(ms);
}

// ── 押すかの判断 ──
export type EsutamaOptSetting = { startMin: number; endMin: number; intervalMin: number; timesMin?: number[] };
export type EsutamaOptState = { lastAt: string | null; remaining: number | null; readAt: string | null };
export const ESUTAMA_OPT_DEFAULT: Record<EsutamaOptKey, EsutamaOptSetting> = {
  // ★ ベンリー: 59分おき・一日中
  shop_boost: { startMin: 360, endMin: 1800, intervalMin: 60 },
  // ★ ベンリー: 7時間おき・ランダム（出勤中）。コネックエフは残りがあれば出勤中の子を押す（読みに行くのは1時間に1回まで）
  cast_appeal: { startMin: 600, endMin: 1740, intervalMin: 60 },
  // ★ ベンリー: 10:04・20:06・22:00（実測してから）
  job_appeal: { startMin: 600, endMin: 1380, intervalMin: 360, timesMin: [604, 1206, 1320] },
  // ★ 第1823便: 本日体験入店は「掲載中」かを1時間に1回見に行き、止まっていたら（毎日0時に止まる）「掲載開始」を押す
  job_now: { startMin: 360, endMin: 1800, intervalMin: 60 },
};
export function isValidEsutamaOptSetting(s: EsutamaOptSetting): boolean {
  return [s.startMin, s.endMin, s.intervalMin].every((v) => Number.isInteger(v))
    && s.startMin >= 360 && s.endMin <= 1800 && s.startMin < s.endMin
    && s.intervalMin >= 30 && s.intervalMin <= 1440;
}

export function shouldPressEsutamaOpt(args: {
  key: EsutamaOptKey; setting: EsutamaOptSetting; state: EsutamaOptState; now: Date; force?: boolean;
}): { press: boolean; reason: string } {
  const { key, setting, state, now } = args;
  if (!ESUTAMA_OPT_READY[key]) return { press: false, reason: 'not_ready' };
  if (args.force === true) return { press: true, reason: 'force' };
  const b = businessMinOf(now);
  if (key === 'job_appeal') {
    // ★ 時刻で押す: いちばん近い過去の予定時刻（今日の）より前にしか押せていなければ押す
    const times = (setting.timesMin && setting.timesMin.length > 0 ? setting.timesMin : ESUTAMA_JOB_APPEAL_TIMES).filter((t) => t >= 360 && t < 1800).sort((x, y) => x - y);
    const due = times.filter((t) => t <= b).pop();
    if (due === undefined) return { press: false, reason: 'before_first_time' };
    const dueAt = lastResetAt(now).getTime() + (due - 360) * 60000;
    if (state.lastAt && Date.parse(state.lastAt) >= dueAt - 60000) return { press: false, reason: 'done_for_time' };
    if (state.readAt && Date.parse(state.readAt) >= dueAt && now.getTime() - Date.parse(state.readAt) < 30 * 60000) return { press: false, reason: 'recent_read' };
    if (state.remaining === 0 && state.readAt && Date.parse(state.readAt) >= lastResetAt(now).getTime()) return { press: false, reason: 'no_quota' };
    return { press: true, reason: 'ok' };
  }
  if (b < setting.startMin || b >= setting.endMin) return { press: false, reason: 'outside_hours' };
  const reset = lastResetAt(now).getTime();
  if (state.remaining === 0 && state.readAt && Date.parse(state.readAt) >= reset) return { press: false, reason: 'no_quota' };
  const gapMs = (iso: string | null) => (iso ? now.getTime() - Date.parse(iso) : Infinity);
  // ★ 周は5分ごと。間隔ちょうどに押せるよう3分の遊び
  if (gapMs(state.lastAt) < (setting.intervalMin - 3) * 60000) return { press: false, reason: 'interval' };
  // ★ 押せなかった回（出勤中の子がいない等）も読みすぎない
  if (gapMs(state.readAt) < Math.min(setting.intervalMin, 60) * 60000 - 3 * 60000 && (key === 'cast_appeal' || key === 'job_now')) return { press: false, reason: 'recent_read' };
  return { press: true, reason: 'ok' };
}

// ── 画面を読む ──
const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? '') : null;
}
const decodeEnt = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** 「本日の残り回数N回」 */
export function readTodayRemaining(html: string): number | null {
  const t = stripTags(String(html ?? ''));
  const m = /本日の残り回数\s*(\d{1,3})\s*回/.exec(t);
  return m ? Number(m[1]) : null;
}

export type GoNowPage = { remaining: number | null; ctk: string | null; fields: Array<[string, string]>; problems: string[] };

/** ご案内状況の画面（#ShopWaitSettingForm の中身・残り回数・ctk） */
export function parseGoNowPage(html: string): GoNowPage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const fm = /<form\b[^>]*\bid=["']ShopWaitSettingForm["'][^>]*>([\s\S]*?)<\/form>/i.exec(src);
  const fields: Array<[string, string]> = [];
  if (!fm) problems.push('ご案内状況のフォームが見つからない');
  else {
    const body = fm[1];
    // ★ 画面の並び順のまま（serializeArray と同じ）。select・textarea は閉じタグまでを1つとして読む
    const re = /<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = re.exec(body)) !== null) {
      const tag = m[0];
      const name = attr(tag, 'name');
      if (!name || seen.has(name)) continue; // ★ 画面の parseJson と同じく、同じ名前は最初の1つ
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
        const tv = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/i.exec(tag)?.[1] ?? '';
        fields.push([name, decodeEnt(tv)]);
      }
      seen.add(name);
    }
    if (!fields.some(([k]) => k === 'check_go_now_edit')) problems.push('check_go_now_edit が無い');
  }
  const lm = /class=["'][^"']*\bjs-go_now_limit_last\b[^"']*["'][^>]*>\s*(-?\d{1,3})\s*</i.exec(src);
  const remaining = lm ? Math.max(0, Number(lm[1])) : readTodayRemaining(src);
  if (remaining === null) problems.push('残り回数が見つからない');
  const ctk = readEsutamaCsrf(src);
  if (!ctk) problems.push('ctk（#csrf_footer）が見つからない');
  return { remaining, ctk, fields, problems };
}

/** 集客ブーストの応答（JSON の "0" が "OK"） */
export function goNowBoostAccepted(body: string): boolean {
  try {
    const j = JSON.parse(String(body ?? '')) as Record<string, unknown>;
    return j['0'] === 'OK';
  } catch {
    return /^\s*\{\s*"0"\s*:\s*"OK"/.test(String(body ?? ''));
  }
}

export type CastAppealRow = { castId: string; name: string; startMin: number | null; endMin: number | null; lastAt: string | null };
export type CastAppealPage = { remaining: number | null; ctk: string | null; rows: CastAppealRow[]; problems: string[] };

/** 'HH:MM' → 分（29:00 = 1740 のような翌日表記もそのまま） */
function hm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** セラピストアピールの画面。★ ボタン（残りがあるときだけ出る）のある行だけ */
export function parseCastAppealPage(html: string, now: Date): CastAppealPage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const rows: CastAppealRow[] = [];
  const re = /<a\b[^>]*\bdata-row=["']cast,cast_appeal,(\d{1,12})["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = src.lastIndexOf('<tr', m.index);
    const end = src.indexOf('</tr>', m.index);
    if (start < 0 || end < 0) continue;
    const t = stripTags(src.slice(start, end));
    const time = /(\d{1,2}:\d{2})\s*[～~〜-]\s*(\d{1,2}:\d{2})/.exec(t);
    const name = t.split(/\s/)[0] ?? '';
    const last = /最終アピール\s*([0-9/: ]+)/.exec(t)?.[1] ?? '';
    rows.push({
      castId: m[1], name,
      startMin: time ? hm(time[1]) : null, endMin: time ? hm(time[2]) : null,
      lastAt: parseEsutamaAppealTime(last, now),
    });
  }
  const remaining = readTodayRemaining(src);
  if (remaining === null) problems.push('残り回数が見つからない');
  const ctk = readEsutamaCsrf(src);
  if (!ctk) problems.push('ctk（#csrf_footer）が見つからない');
  return { remaining, ctk, rows, problems };
}

/** ★ 誰を押すか: 出勤時間内の子のうち、最終アピールがいちばん古い子（一度も無い子が先・同じなら画面の上から） */
export function pickCastToAppeal(rows: CastAppealRow[], now: Date): CastAppealRow | null {
  const b = businessMinOf(now);
  const inShift = rows.filter((r) => r.startMin !== null && r.endMin !== null && r.startMin <= b && b < r.endMin);
  if (inShift.length === 0) return null;
  const t = (r: CastAppealRow) => (r.lastAt ? Date.parse(r.lastAt) : -Infinity);
  return inShift.reduce((a, r) => (t(r) < t(a) ? r : a));
}

// ── 送る ──
type Req = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string };
const baseHeaders = (cookie: string) => ({
  'user-agent': RELAY_USER_AGENT,
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
  cookie,
});

export function buildEsutamaOptPageRequest(cookie: string, key: EsutamaOptKey): Req {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return {
    method: 'GET', url: esutamaOptPageUrl(key),
    headers: { ...baseHeaders(cookie), accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', referer: 'https://estama.jp/admin/' },
  };
}

function postHeaders(cookie: string, referer: string) {
  return {
    ...baseHeaders(cookie),
    accept: 'application/json, text/javascript, */*; q=0.01',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest',
    referer, origin: 'https://estama.jp',
  };
}

/** ★★ 集客ブースト（「◎今すぐご案内可」で表示）。★ 相手の回数が1つ減る */
export function buildGoNowBoostRequest(cookie: string, ctk: string, fields: Array<[string, string]>): Req {
  if (!cookie) throw new Error('Cookie が無いまま押さない');
  if (!/^[A-Za-z0-9]{16,64}$/.test(ctk)) throw new Error('ctk の形が違うまま押さない');
  if (!fields.some(([k]) => k === 'check_go_now_edit')) throw new Error('ご案内状況のフォームが無いまま押さない');
  const body = fields.filter(([k]) => k !== 'type' && k !== 'ctk' && k !== 'save_only');
  return { method: 'POST', url: ESUTAMA_GO_NOW_POST_URL, headers: postHeaders(cookie, ESUTAMA_GO_NOW_URL), body: encodePayload([...body, ['type', '1'], ['ctk', ctk]]) };
}

/** ★★ 求人ワンクリックアピール（1行）。★ 相手のその行の回数が1つ減る */
export function buildJobAppealRequest(cookie: string, ctk: string, rowKey: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま押さない');
  if (!/^[A-Za-z0-9]{16,64}$/.test(ctk)) throw new Error('ctk の形が違うまま押さない');
  if (!(ESUTAMA_JOB_APPEAL_ROWS as readonly string[]).includes(rowKey)) throw new Error('知らない行は押さない');
  return {
    method: 'POST', url: ESUTAMA_SINGLE_APPEAL_URL, headers: postHeaders(cookie, 'https://estama.jp/admin/job/appeal/'),
    body: encodePayload([['post_data', rowKey], ['ctk', ctk]]),
  };
}

/** ★★ セラピストアピール（1人）。★ 相手の回数が1つ減る */
export function buildCastAppealRequest(cookie: string, ctk: string, castId: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま押さない');
  if (!/^[A-Za-z0-9]{16,64}$/.test(ctk)) throw new Error('ctk の形が違うまま押さない');
  if (!/^\d{1,12}$/.test(castId)) throw new Error('セラピストの番号の形が違うまま押さない');
  return {
    method: 'POST', url: ESUTAMA_SINGLE_APPEAL_URL, headers: postHeaders(cookie, ESUTAMA_CAST_APPEAL_URL),
    body: encodePayload([['post_data', `cast,cast_appeal,${castId}`], ['ctk', ctk]]),
  };
}

// ── 本日体験入店（第1823便・2026-11-09 実測・読んだだけ）──────────────────────────
//   GET /admin/job_now/ … 「自動掲載終了時間 11月10日 00時00分（掲載中）」。掲載中は【掲載停止】ボタン
//     <a class="send-easy_post2" data-post="job_now" data-row="stop">掲載停止</a>
//   ★ 翌日0時に自動で止まる。止まっていると【掲載開始】ボタンが出る（その data-row は画面から読む。決め打ちにしない）
//   押す: .send-easy_post2 → POST /admin_post/job_now ← post_data=<data-row> ＋ ctk
export const ESUTAMA_JOB_NOW_URL = 'https://estama.jp/admin/job_now/';
export const ESUTAMA_JOB_NOW_POST_URL = 'https://estama.jp/admin_post/job_now';

export function parseJobNowPage(html: string): { listed: boolean; startRow: string | null; ctk: string | null; problems: string[] } {
  const src = String(html ?? '');
  const problems: string[] = [];
  if (!/本日体験入店/.test(src)) problems.push('本日体験入店の画面ではない');
  const t = stripTags(src);
  const listed = /（掲載中）|\(掲載中\)/.test(t);
  let startRow: string | null = null;
  const re = /<(a|button)\b[^>]*\bdata-post=["']job_now["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (/掲載開始/.test(stripTags(m[2]))) { startRow = attr(m[0], 'data-row'); break; }
  }
  const ctk = readEsutamaCsrf(src);
  if (!ctk) problems.push('ctk（#csrf_footer）が見つからない');
  if (!listed && !startRow) problems.push('掲載中でも【掲載開始】ボタンも無い');
  return { listed, startRow, ctk, problems };
}

/** ★★ 【掲載開始】を押す */
export function buildJobNowStartRequest(cookie: string, ctk: string, row: string): Req {
  if (!cookie) throw new Error('Cookie が無いまま押さない');
  if (!/^[A-Za-z0-9]{16,64}$/.test(ctk)) throw new Error('ctk の形が違うまま押さない');
  if (!/^[A-Za-z0-9_,\-]{1,40}$/.test(row) || /stop/i.test(row)) throw new Error('【掲載開始】の値の形が違うまま押さない');
  return { method: 'POST', url: ESUTAMA_JOB_NOW_POST_URL, headers: postHeaders(cookie, ESUTAMA_JOB_NOW_URL), body: encodePayload([['post_data', row], ['ctk', ctk]]) };
}
