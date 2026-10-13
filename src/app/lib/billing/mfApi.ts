// マネーフォワード クラウド会計 API（第1435便・2026-10-13・カッキーさん）。★ サーバー専用・読むだけ。
//   ・APIキー（Vercel の MF_API_KEY・オーナーが発行・利用可能サービス＝クラウド会計のみ）→ POST /auth/exchange で JWT（1時間）
//   ・会計 API は https://api-accounting.moneyforward.com/api/v3 。APIキー認証では office_code（事業者番号）が必須
//   ・事業者番号は MF_OFFICE_CODE（無ければ うさぎのひとやすみ合同会社 5486-7297）
//   ・★ このファイルからは GET しかしない（仕訳の登録・削除はしない）

const EXCHANGE_URL = 'https://api.biz.moneyforward.com/auth/exchange';
const API_BASE = 'https://api-accounting.moneyforward.com/api/v3';
const DEFAULT_OFFICE = '5486-7297';

let cached: { jwt: string; expiresAt: number } | null = null;

export function mfConfigured(): boolean {
  return !!process.env.MF_API_KEY?.trim();
}

async function getJwt(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.jwt;
  const key = process.env.MF_API_KEY?.trim();
  if (!key) throw new Error('MF_API_KEY が設定されていません（Vercel の環境変数）');
  const res = await fetch(EXCHANGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`APIキーの交換に失敗: HTTP ${res.status} ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('交換の応答に access_token がありません');
  cached = { jwt: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.jwt;
}

/** 会計 API を GET で読む。query の値は文字列・数値・配列 */
export async function mfGet(path: string, query: Record<string, string | number | string[] | undefined> = {}): Promise<unknown> {
  const office = (process.env.MF_OFFICE_CODE || DEFAULT_OFFICE).trim();
  const qs = new URLSearchParams({ office_code: office });
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
    else qs.set(k, String(v));
  }
  const res = await fetch(`${API_BASE}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${await getJwt()}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MF API: HTTP ${res.status} GET ${path} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** 応答の中の最初の配列を取り出す（{ connected_accounts: [...] } / { items: [...] } など形が分からなくても使える） */
export function firstArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  if (v && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) if (Array.isArray(x)) return x as Record<string, unknown>[];
  }
  return [];
}
