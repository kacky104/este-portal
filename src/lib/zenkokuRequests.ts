// 全国エステランキング（www.esthe-ranking.jp）へ投げる要求の組み立て（第1769便・2026-11-07・純粋関数）。
//
// ★ 中継の作りは駅ちか・エステ魂と同じ（[Vercel] 要求を組む → [VPS] 中身を理解せず投げる → [Vercel] 応答を読む）。
// ★★ 宛先の allowlist に www.esthe-ranking.jp を足してある（src/lib/relayJob.ts と scripts/relay.sh の両方。★ VPS へ relay.sh を置き直すのはカッキーさん）。
// ★★★ このファイルで相手を書き換えるのは buildZenkokuDaySaveRequest だけ。

import { RELAY_USER_AGENT } from './relayUserAgent';
import type { ZenkokuLoginForm } from './zenkokuParse';

/** ★ relayJob.ts は node:zlib を使うので取り込まない（ここは純粋関数） */
export type RelayRequest = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: string };

export const ZENKOKU_HOST = 'www.esthe-ranking.jp';
export const ZENKOKU_ORIGIN = 'https://' + ZENKOKU_HOST;
export const ZENKOKU_LOGIN_URL = ZENKOKU_ORIGIN + '/login/';
/** 管理画面のトップ（基本設定）。★ ログインできたかの手がかり */
export const ZENKOKU_SHOP_URL = ZENKOKU_ORIGIN + '/shop/';
/** セラピスト一覧（名前と girl id・公開/非公開）。★ 読むだけ */
export const ZENKOKU_GIRLS_URL = ZENKOKU_ORIGIN + '/shop/image/girl/upload/all/';

/** 出勤の1日の画面（GET）と保存先（POST）は同じ場所 */
export function zenkokuDayUrl(dateISO: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error('日付の形が違う: ' + dateISO);
  return ZENKOKU_ORIGIN + '/shop/schedule/' + dateISO + '/';
}

function baseHeaders(): Record<string, string> {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
  };
}

export function buildZenkokuLoginPageRequest(): RelayRequest {
  return { method: 'GET', url: ZENKOKU_LOGIN_URL, headers: baseHeaders(), body: '' };
}

/** ★ 認証情報が入る。★ 組むのは DB 側（app/lib/media/relayFlow.ts）だけ */
export function buildZenkokuLoginRequest(cred: { loginId: string; password: string }, form: ZenkokuLoginForm, cookie: string): RelayRequest {
  if (!cred.loginId || !cred.password) throw new Error('ログイン名かパスワードが空');
  const parts: Array<[string, string]> = [
    ['_method', 'POST'],
    ['_csrfToken', form.csrfToken],
    ['loginname', cred.loginId],
    ['password', cred.password],
    ['_Token[fields]', form.tokenFields],
    ['_Token[unlocked]', form.tokenUnlocked],
  ];
  return {
    method: 'POST',
    url: ZENKOKU_LOGIN_URL,
    headers: {
      ...baseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
      origin: ZENKOKU_ORIGIN,
      referer: ZENKOKU_LOGIN_URL,
      ...(cookie ? { cookie } : {}),
    },
    body: parts.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'),
  };
}

export function buildZenkokuGirlsRequest(cookie: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま一覧を読みに行かない');
  return { method: 'GET', url: ZENKOKU_GIRLS_URL, headers: { ...baseHeaders(), referer: ZENKOKU_SHOP_URL, cookie }, body: '' };
}

export function buildZenkokuDayReadRequest(cookie: string, dateISO: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま出勤を読みに行かない');
  return { method: 'GET', url: zenkokuDayUrl(dateISO), headers: { ...baseHeaders(), referer: ZENKOKU_SHOP_URL, cookie }, body: '' };
}

/** ★★★ 出勤の保存。★ このファイルで唯一、相手を書き換える要求 */
export function buildZenkokuDaySaveRequest(cookie: string, dateISO: string, body: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま保存しない');
  if (!body || !/(^|&)user_id=/.test(body)) throw new Error('保存の中身が薄い（user_id が無い）');
  const url = zenkokuDayUrl(dateISO);
  return {
    method: 'POST',
    url,
    headers: { ...baseHeaders(), 'content-type': 'application/x-www-form-urlencoded', origin: ZENKOKU_ORIGIN, referer: url, cookie },
    body,
  };
}
