// ── Google Search Console API のクライアント（第1532便・2026-10-17・カッキーさん）────────────
//
// 何をするか
//   サービスアカウントの鍵（環境変数 GSC_SERVICE_ACCOUNT_JSON）で Google にログインし、
//   サーチコンソールの「検索パフォーマンス」（クエリ別・ページ別のクリック・表示回数・CTR・順位）を取る。
//
// 使い方
//   const rows = await gscQuery({ startDate: '2026-10-01', endDate: '2026-10-07', dimensions: ['query'] });
//
// ★ ライブラリは足していない。JWT の署名は Node 標準の crypto（RS256）で作る。
// ★ 鍵（JSON）は【パスワードと同じ】。Vercel の環境変数にだけ置く。ログにも出さない。
// ★ API は無料（Google の上限は 1 日あたり数万回。週 1 回なら気にしなくてよい）。
// ★ データは画面より 2〜3 日遅れる（Google 側の仕様）。endDate は「今日 − 3 日」より前にする。
// ★ サービスアカウントはサーチコンソールで「制限付き」ユーザーとして追加しておく（読むだけ）。

import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_SITE = 'sc-domain:fukues.com';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function loadServiceAccount(): ServiceAccount {
  const raw = (process.env.GSC_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_JSON が未設定');
  // 生の JSON か、base64 にしたもののどちらでも受ける（Vercel で貼りやすい方で）
  const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(text) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error('GSC_SERVICE_ACCOUNT_JSON に client_email / private_key が無い');
  return sa;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 取ったアクセストークンは 1 時間使える。同じ実行の中では使い回す。
let cached: { token: string; exp: number } | null = null;

export async function getGscAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const sa = loadServiceAccount();
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri ?? TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(sa.token_uri ?? TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) throw new Error(`Google のトークン取得に失敗: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cached.token;
}

export type GscDimension = 'query' | 'page' | 'country' | 'device' | 'date' | 'searchAppearance';
export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export async function gscQuery(params: {
  startDate: string;
  endDate: string;
  dimensions: GscDimension[];
  rowLimit?: number;
  /** 例: [{ dimension: 'page', operator: 'contains', expression: '/column/' }] */
  filters?: Array<{ dimension: GscDimension; operator: 'equals' | 'contains' | 'notContains' | 'notEquals'; expression: string }>;
  /** 'web'（既定）/ 'image' / 'video' / 'news' / 'discover' / 'googleNews' */
  type?: string;
  siteUrl?: string;
}): Promise<GscRow[]> {
  const token = await getGscAccessToken();
  const site = encodeURIComponent(params.siteUrl ?? process.env.GSC_SITE_URL ?? DEFAULT_SITE);
  const body: Record<string, unknown> = {
    startDate: params.startDate,
    endDate: params.endDate,
    dimensions: params.dimensions,
    rowLimit: params.rowLimit ?? 1000,
    type: params.type ?? 'web',
  };
  if (params.filters?.length) body.dimensionFilterGroups = [{ filters: params.filters }];

  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Search Console API に失敗: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { rows?: GscRow[] };
  return json.rows ?? [];
}

/** 'YYYY-MM-DD'（JST）。days 日前。 */
export function jstDateMinus(days: number, from = new Date()): string {
  const t = new Date(from.getTime() + 9 * 60 * 60 * 1000);
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}
