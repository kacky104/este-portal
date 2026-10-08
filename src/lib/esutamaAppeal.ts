// エステ魂の「集客ワンクリックアピール」（店舗情報）をコネックエフから押す（第1314便・2026-10-08・カッキーさんの決定）。★ 純粋関数だけ。
//
// ★★★ エステ魂のボタンが送っているもの（2026-10-08 にラビリンス様の管理画面で実測・許可を得て1回押した: 残り 8 → 7）:
//   画面: https://estama.jp/admin/guest/appeal/ の表。行は「店舗情報」「クーポン情報」「お店体験談」の3つ。★ 押すのは【店舗情報だけ】（カッキーさんの決定）
//   ボタン: <a class="send-easy_post2 btn btn-primary" data-post="single_appeal_exec" data-row="shop,guest_appeal">アピールする</a>
//   my_post.js の .send-easy_post2:
//     $.ajax({ url: '/admin_post/' + data-post, type: 'post', dataType: 'json', data: { post_data: data-row, ctk: CSRF_TOKEN_VALUE } })
//     ★ ctk は画面の #csrf_footer と同じ値（実測で一致）。★ confirm() は無い。reCAPTCHA も使っていない
//   行の中: <strong class="big tg_num">残り回数</strong> ／ <p class="l-appeal_last_update">最終アピール 10/08 16:01</p>
//   ★ 画面の説明は「1日1回（プラチナプランは3回）」だが、ラビリンス様は1日10回押せる（カッキーさんの確認）。毎朝6時に戻る。
//
// ★★ 成否は【押した応答では決めない】。もう一度この画面を読み、残り回数が減ったか・最終アピールが新しくなったかで決める
//    （応答の形を実測していない。エステ魂の非表示・新規登録と同じ作法＝読み直して確かめる）。
// ★ 自動で押すかの判断は駅ちかと同じ shouldBumpNow（lib/ekichikaBump.ts）を使う。設定と状態も同じ列（salon_import_sources.bump_*・provider='esutama'）。

import { encodePayload } from './ekichikaWorkParse';
import { RELAY_USER_AGENT } from './relayUserAgent';
import { readEsutamaCsrf } from './esutamaParse';

export const ESUTAMA_APPEAL_PAGE_URL = 'https://estama.jp/admin/guest/appeal/';
export const ESUTAMA_APPEAL_POST_URL = 'https://estama.jp/admin_post/single_appeal_exec';
/** ★ 店舗情報の行だけ。★ クーポン（shop_coupon）・体験談（shop_exp）は押さない */
export const ESUTAMA_APPEAL_ROW = 'shop,guest_appeal';

export type EsutamaAppealPage = {
  remaining: number | null;
  /** 最終アピール（ISO）。★ 画面は年が無い（'10/08 16:01'）ので、読んだ時刻から年を決める */
  lastAt: string | null;
  ctk: string | null;
  problems: string[];
};

/** '10/08 16:01'（日本時間・年なし）→ ISO。★ 読んだ時刻より1日以上先になる日付は前の年とみなす（年またぎ） */
export function parseEsutamaAppealTime(text: string, now: Date): string | null {
  const m = /(\d{1,2})\s*\/\s*(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(String(text ?? ''));
  if (!m) return null;
  const [mo, d, h, mi] = [m[1], m[2], m[3], m[4]].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const jstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  let y = jstNow.getUTCFullYear();
  let ms = Date.UTC(y, mo - 1, d, h - 9, mi, 0);
  if (ms > now.getTime() + 24 * 3600 * 1000) { y -= 1; ms = Date.UTC(y, mo - 1, d, h - 9, mi, 0); }
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** 店舗情報の行（data-row="shop,guest_appeal" のボタンを含む <tr>）を切り出す。無ければ null */
export function esutamaAppealRowHtml(html: string): string | null {
  const src = String(html ?? '');
  const btn = /<a\b[^>]*\bdata-row=["']shop,guest_appeal["'][^>]*>/i.exec(src);
  if (!btn) return null;
  const start = src.lastIndexOf('<tr', btn.index);
  const end = src.indexOf('</tr>', btn.index);
  if (start < 0 || end < 0) return null;
  return src.slice(start, end + 5);
}

/** アピールの画面を読む */
export function parseEsutamaAppealPage(html: string, now: Date): EsutamaAppealPage {
  const problems: string[] = [];
  const row = esutamaAppealRowHtml(html);
  if (!row) problems.push('店舗情報のアピールの行が見つからない');
  let remaining: number | null = null;
  let lastAt: string | null = null;
  if (row) {
    const numText = /<strong\b[^>]*class=["'][^"']*\btg_num\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i.exec(row)?.[1]?.replace(/<[^>]*>/g, '').trim() ?? null;
    if (numText === null) problems.push('残り回数が見つからない');
    else if (!/^\d{1,3}$/.test(numText)) problems.push('残り回数が数字でない');
    else remaining = Number(numText);
    const lastText = /<p\b[^>]*class=["'][^"']*\bl-appeal_last_update\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(row)?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
    // ★ 一度も押していない店は日付が無いことがある（＝null。問題にはしない）
    lastAt = parseEsutamaAppealTime(lastText, now);
    if (!lastAt && /\d{1,2}\/\d{1,2}/.test(lastText)) problems.push('最終アピールの日時が読めない');
  }
  const ctk = readEsutamaCsrf(String(html ?? ''));
  if (!ctk) problems.push('ctk（#csrf_footer）が見つからない');
  return { remaining, lastAt, ctk, problems };
}

/** 押すのに足りる材料がそろっているか（残り回数と ctk） */
export function esutamaAppealUsable(p: EsutamaAppealPage): boolean {
  return p.remaining !== null && p.ctk !== null;
}

/** 押せたか。★ 残り回数が減った、または最終アピールが前より新しくなった */
export function esutamaAppealPressed(before: { remaining: number | null; lastAt: string | null }, after: EsutamaAppealPage): boolean {
  if (before.remaining !== null && after.remaining !== null && after.remaining < before.remaining) return true;
  if (after.lastAt && (!before.lastAt || Date.parse(after.lastAt) > Date.parse(before.lastAt))) return true;
  return false;
}

type Req = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string };

/** アピールの画面を読む GET。★ 読むだけ */
export function buildEsutamaAppealPageRequest(cookie: string): Req {
  if (!cookie) throw new Error('Cookie が無いままアピールの画面を読みに行かない');
  return {
    method: 'GET',
    url: ESUTAMA_APPEAL_PAGE_URL,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      referer: 'https://estama.jp/admin/',
      cookie,
    },
  };
}

/** ★★ 店舗情報をアピールする POST（相手の回数が1つ減る）。★ 画面の $.ajax と同じ形 */
export function buildEsutamaAppealPostRequest(cookie: string, ctk: string): Req {
  if (!cookie) throw new Error('Cookie が無いままアピールしない');
  if (!/^[A-Za-z0-9]{16,64}$/.test(ctk)) throw new Error('ctk の形が違うままアピールしない');
  return {
    method: 'POST',
    url: ESUTAMA_APPEAL_POST_URL,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      referer: ESUTAMA_APPEAL_PAGE_URL,
      origin: 'https://estama.jp',
      cookie,
    },
    body: encodePayload([['post_data', ESUTAMA_APPEAL_ROW], ['ctk', ctk]]),
  };
}
