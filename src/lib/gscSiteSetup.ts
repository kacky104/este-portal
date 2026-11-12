// ── 公式HP（独自ドメイン）を Search Console に登録する（第1995便・2026-11-12・カッキーさん）────────────
//
// 流れ（どれもフクエスのサービスアカウント＝GSC_SERVICE_ACCOUNT_JSON で行う）
//   1) Site Verification API で「持ち主の確認」用の文字（META の token）をもらう
//   2) 公式HP のトップに <meta name="google-site-verification" content="token"> を出す（hp/[slug]/page.tsx）
//   3) Site Verification API で確認してもらう → サービスアカウントがそのサイトの持ち主になる
//   4) Search Console API でサイトを足す → 検索ワードが読めるようになる
// ★ Google Cloud で「Site Verification API」と「Google Search Console API」を有効にしておく（運営が1回だけ）。
// ★ サイトは URL プレフィックス（https://ドメイン/）。www の付け外しはドメインのとおり。

import { getGoogleAccessToken } from './gsc';

const SETUP_SCOPE = 'https://www.googleapis.com/auth/siteverification https://www.googleapis.com/auth/webmasters';

export function hpGscSiteUrl(domain: string): string {
  return `https://${domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')}/`;
}

async function call(url: string, init: { method: string; body?: unknown }): Promise<{ ok: true; json: unknown } | { ok: false; status: number; text: string }> {
  const token = await getGoogleAccessToken(SETUP_SCOPE);
  const res = await fetch(url, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) return { ok: false, status: res.status, text: (await res.text()).slice(0, 300) };
  const text = await res.text();
  return { ok: true, json: text ? JSON.parse(text) : {} };
}

/** 1) 確認用の文字。返ってくる token は <meta ... content="XXXX"> の形なので、content だけ取り出す */
export async function gscGetMetaToken(siteUrl: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const r = await call('https://www.googleapis.com/siteVerification/v1/token', {
    method: 'POST',
    body: { site: { type: 'SITE', identifier: siteUrl }, verificationMethod: 'META' },
  });
  if (!r.ok) return { ok: false, error: `確認用の文字をもらえませんでした（${r.status}）: ${r.text}` };
  const raw = String((r.json as { token?: string }).token ?? '');
  const m = /content="([^"]+)"/.exec(raw);
  const token = (m ? m[1] : raw).trim();
  if (!/^[\w-]{10,120}$/.test(token)) return { ok: false, error: '確認用の文字の形が想定と違います' };
  return { ok: true, token };
}

/** 3) 確認してもらう（トップに meta が出ていること） */
export async function gscVerify(siteUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await call('https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META', {
    method: 'POST',
    body: { site: { type: 'SITE', identifier: siteUrl } },
  });
  if (!r.ok) return { ok: false, error: `Google の確認が通りませんでした（${r.status}）: ${r.text}` };
  return { ok: true };
}

/** 4) Search Console にサイトを足す（もう足してあっても成功） */
export async function gscAddSite(siteUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await call(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`, { method: 'PUT' });
  if (!r.ok) return { ok: false, error: `Search Console に足せませんでした（${r.status}）: ${r.text}` };
  return { ok: true };
}
