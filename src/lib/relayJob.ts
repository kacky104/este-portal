// 他媒体への中継ジョブ（第38便・論点② C-2「引き取り型」）。
//
// ★★★ このファイルはサーバー専用（`node:zlib` と mediaCredentials を使う）。
//
// ★★★ 形（設計メモ §18-3）
//   [Vercel] 認証情報を復号 → 「このリクエストを投げて」というジョブを1件積む
//      ↓ VPSが CRON_SECRET で引き取る（外向き・ポートを開けない）
//   [VPS]    ★ 宛先を allowlist で検査 → 駅ちかへ投げる → 結果を返す（外向き）
//      ↓
//   [Vercel] 結果をパース（ekichikaWorkParse）→ 次のジョブを積む
//
//   ★ VPSは中身を理解しない。だからVPS側のコードは変更頻度がほぼゼロになり、
//     第36便の「版管理されないコード」問題が構造的に起きない。
//
// ★★★ 気をつけること3つ
//   1. **ジョブの中身には秘密が載る。** ログインのbodyにはパスワード、以降のリクエストには
//      セッションCookieが入る。**平文でDBに置かない。** ここで暗号化してから保存する
//   2. **「任意のリクエストを転送する口」を作ることになる。** allowlist を
//      **フクエス側とVPS側の両方**に置く（片方だけに頼らない）
//   3. **終わったジョブの中身は消す。** 秘密が残り続ける場所を作らない（purge）

import zlib from 'node:zlib';
import { encryptWithAad, decryptWithAad } from './mediaCredentials';

/** ★ 転送を許すホスト。ここに無いものは投げない。VPS側にも同じ表を置くこと。 */
export const RELAY_ALLOWED_HOSTS: readonly string[] = ['ranking-deli.jp'];

/**
 * ★ 送ってよいリクエストヘッダー。ここに無いものは落とす。
 *   中継を汎用の攻撃道具にしないための線引き。
 */
export const RELAY_ALLOWED_REQUEST_HEADERS: readonly string[] = [
  'cookie',
  'content-type',
  'user-agent',
  'accept',
  'accept-language',
  'referer',
  'origin',
];

/** ★ 持ち帰るレスポンスヘッダー。セッションの持ち回りと、リダイレクト・WAF判定に要るものだけ。 */
export const RELAY_KEPT_RESPONSE_HEADERS: readonly string[] = [
  'set-cookie',
  'location',
  'content-type',
  'server',
];

/** 送信ボディの上限。出勤の更新は約20KB（37人ぶん）。 */
export const MAX_REQUEST_BODY_BYTES = 1_000_000;

/** 受信ボディの上限。出勤ページは実測 2.3MB（第38便）。 */
export const MAX_RESPONSE_BODY_BYTES = 8_000_000;

export type RelayRequest = {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  /** application/x-www-form-urlencoded の文字列。GET のときは空 */
  body: string;
};

export type RelayResponse = {
  status: number;
  headers: Record<string, string | string[]>;
  /** gzip して base64 にしたもの。unpackBody で戻す */
  bodyPacked: string;
};

// ────────────────────────────── allowlist ──────────────────────────────

/**
 * ★★★ 宛先の検査。ここを緩めると、VPSが任意の宛先へ投げる道具になる。
 * 弾くもの: https 以外 / 許可外ホスト / ポート指定 / ユーザー情報つきURL。
 */
export function assertAllowedUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URLとして読めない: ' + String(url).slice(0, 120));
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('https 以外は中継しない: ' + parsed.protocol);
  }
  if (parsed.username || parsed.password) {
    // ★ https://user:pass@host/ の形。ログに秘密が出るし、宛先も誤認しやすい
    throw new Error('ユーザー情報つきURLは中継しない');
  }
  if (parsed.port) {
    throw new Error('ポート指定つきURLは中継しない: ' + parsed.port);
  }
  if (!RELAY_ALLOWED_HOSTS.includes(parsed.hostname)) {
    // ★ 前方一致・後方一致で判定しない（evil-ranking-deli.jp / ranking-deli.jp.evil.com が通る）
    throw new Error('許可していない宛先: ' + parsed.hostname);
  }
  return parsed;
}

// ────────────────────────────── ヘッダー ──────────────────────────────

/** 送ってよいヘッダーだけ残す。名前は小文字に揃える。 */
export function filterRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    const name = k.toLowerCase();
    if (!RELAY_ALLOWED_REQUEST_HEADERS.includes(name)) continue;
    if (typeof v !== 'string') continue;
    if (/[\r\n]/.test(v)) {
      // ★ ヘッダーインジェクション。改行が入った時点で捨てる
      throw new Error('ヘッダーの値に改行が入っている: ' + name);
    }
    out[name] = v;
  }
  return out;
}

/** 持ち帰るヘッダーだけ残す。set-cookie は複数来るので配列のまま扱う。 */
export function filterResponseHeaders(
  headers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    const name = k.toLowerCase();
    if (RELAY_KEPT_RESPONSE_HEADERS.includes(name)) out[name] = v;
  }
  return out;
}

// ────────────────────────────── ボディ ──────────────────────────────

/** 本文を gzip して base64 にする。出勤ページは 2.3MB あるので、そのままは運ばない。 */
export function packBody(body: string): string {
  const raw = Buffer.from(body, 'utf8');
  if (raw.byteLength > MAX_RESPONSE_BODY_BYTES) {
    throw new Error('本文が大きすぎる: ' + raw.byteLength + ' バイト（上限 ' + MAX_RESPONSE_BODY_BYTES + '）');
  }
  return zlib.gzipSync(raw).toString('base64');
}

export function unpackBody(packed: string): string {
  const buf = zlib.gunzipSync(Buffer.from(packed, 'base64'));
  if (buf.byteLength > MAX_RESPONSE_BODY_BYTES) {
    // ★ 展開してから膨らむ形（zip爆弾）を止める
    throw new Error('展開後の本文が大きすぎる: ' + buf.byteLength + ' バイト');
  }
  return buf.toString('utf8');
}

// ────────────────────────────── ジョブの組み立て ──────────────────────────────

/** 暗号文をそのジョブに縛るための AAD。★ 別ジョブの中身を貼り替えても復号できない。 */
export function relayAad(jobId: string, part: 'request' | 'response' | 'context'): string {
  if (!jobId) throw new Error('jobId が空');
  return 'relay|' + jobId + '|' + part;
}

/**
 * 中継してよい形に整えて返す。★ ここを通っていないものは積まない。
 */
export function buildRelayRequest(input: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): RelayRequest {
  const method = String(input.method ?? '').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    throw new Error('GET と POST しか中継しない: ' + method);
  }
  assertAllowedUrl(input.url);

  const body = input.body ?? '';
  if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw new Error('送信ボディが大きすぎる: ' + Buffer.byteLength(body, 'utf8') + ' バイト');
  }
  if (method === 'GET' && body.length > 0) {
    throw new Error('GET にボディを付けない');
  }
  return { method, url: input.url, headers: filterRequestHeaders(input.headers ?? {}), body };
}

/** DBに入れる形（暗号化済み文字列）にする。 */
export function sealRequest(req: RelayRequest, jobId: string): string {
  return encryptWithAad(JSON.stringify(req), relayAad(jobId, 'request'));
}

export function openRequest(sealed: string, jobId: string): RelayRequest {
  const req = JSON.parse(decryptWithAad(sealed, relayAad(jobId, 'request'))) as RelayRequest;
  // ★ 復号できても、もう一度 allowlist を通す。
  //   DBが書き換えられた場合に、暗号化されているという理由だけで信用しないため。
  assertAllowedUrl(req.url);
  return req;
}

export function sealResponse(res: RelayResponse, jobId: string): string {
  return encryptWithAad(JSON.stringify(res), relayAad(jobId, 'response'));
}

export function openResponse(sealed: string, jobId: string): RelayResponse {
  return JSON.parse(decryptWithAad(sealed, relayAad(jobId, 'response'))) as RelayResponse;
}

/**
 * フローの持ち回り状態（src/lib/relayFlow.ts の RelayFlowContext）を封じる／開ける。
 * ★★ 中身にセッション Cookie が入る＝【秘密】。request_enc と同じ扱いにする。
 * ★ ここは形を知らないまま運ぶだけ（<T> のまま）。中身の意味は relayFlow が持つ。
 */
export function sealContext(context: unknown, jobId: string): string {
  return encryptWithAad(JSON.stringify(context), relayAad(jobId, 'context'));
}

export function openContext<T>(sealed: string, jobId: string): T {
  return JSON.parse(decryptWithAad(sealed, relayAad(jobId, 'context'))) as T;
}

// ────────────────────────────── Cookie の持ち回り ──────────────────────────────

/**
 * レスポンスの set-cookie を、次のリクエストに付ける Cookie ヘッダーへ畳む。
 * ★ セッションを持つのはフクエス側。VPSは Cookie を保存しない（＝中身を理解しない）。
 * ★ 属性（Path/Expires/HttpOnly…）は捨てて name=value だけ持つ。
 *   相手は1サイト1セッションなので、これで足りる。
 */
export function mergeCookies(current: string, setCookie: string | string[] | undefined): string {
  const jar = new Map<string, string>();
  for (const pair of (current || '').split(';')) {
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const incoming = setCookie === undefined ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const line of incoming) {
    const first = String(line).split(';')[0] ?? '';
    const i = first.indexOf('=');
    if (i <= 0) continue;
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    if (!name) continue;
    // ★ 空の値は「消してよい」の合図なので取り除く（残すと期限切れのセッションを使い続ける）
    if (value === '') jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
}
