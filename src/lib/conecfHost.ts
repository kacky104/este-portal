// コネックエフ（conecf.com）の振り分け（第395便・1a・2026-09-17・カッキーさん）。
// ★ 純粋関数だけ。★ proxy.ts と画面の両方から使う（★ 判断を1か所にする）。
//
// ★★ 形
//   https://conecf.com/            → /conecf          （rewrite・URL は変えない）
//   https://conecf.com/sites       → /conecf/sites
//   https://fukues.com/conecf/...  → https://conecf.com/...（308）
//     ★ 表向きコネックエフはフクエスのサイトではない。★ 入口を conecf.com の1つにする。
//   *.vercel.app / localhost の /conecf/... → そのまま（★ ドメイン接続前・プレビューでの確認用）
//
// ★ /_next /api /auth は rewrite しない（★ 認証のコールバックと Server Action を本体のまま動かす）。

/** コネックエフとして扱うホスト（www は normalizeConecfHost で落としてから比べる） */
export const CONECF_HOSTS: readonly string[] = ['conecf.com'];

/** アプリ内の置き場所 */
export const CONECF_PATH_PREFIX = '/conecf';

/** 正式なアドレス */
export const CONECF_ORIGIN = 'https://conecf.com';

/** rewrite しない道 */
export const CONECF_PASS_PREFIXES: readonly string[] = ['/_next', '/api', '/auth'];

/** フクエス本番のホスト。★ ここで /conecf を開かれたら conecf.com へ送る */
const FUKUES_PROD_HOSTS: readonly string[] = ['fukues.com'];

export function normalizeConecfHost(raw: string | null | undefined): string {
  const h = (raw ?? '').toLowerCase().split(':')[0].trim();
  return h.startsWith('www.') ? h.slice(4) : h;
}

export function isConecfHost(raw: string | null | undefined): boolean {
  const h = normalizeConecfHost(raw);
  return h !== '' && CONECF_HOSTS.includes(h);
}

function startsWithSeg(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

export type ConecfRoute =
  | { kind: 'none' }
  | { kind: 'rewrite'; pathname: string }
  | { kind: 'redirect'; url: string };

/**
 * ★ proxy が使う判定。
 * @param host  リクエストのホスト（x-forwarded-host or host）
 * @param path  pathname
 * @param search  "?a=1" のようなクエリ（無ければ空文字）
 */
export function decideConecfRoute(host: string | null | undefined, path: string, search = ''): ConecfRoute {
  const h = normalizeConecfHost(host);
  const p = path || '/';

  if (isConecfHost(h)) {
    if (CONECF_PASS_PREFIXES.some((x) => startsWithSeg(p, x))) return { kind: 'none' };
    // ★ すでに /conecf が付いていたら二重に付けない
    if (startsWithSeg(p, CONECF_PATH_PREFIX)) return { kind: 'rewrite', pathname: p };
    return { kind: 'rewrite', pathname: p === '/' ? CONECF_PATH_PREFIX : CONECF_PATH_PREFIX + p };
  }

  if (FUKUES_PROD_HOSTS.includes(h) && startsWithSeg(p, CONECF_PATH_PREFIX)) {
    const rest = p.slice(CONECF_PATH_PREFIX.length) || '/';
    return { kind: 'redirect', url: CONECF_ORIGIN + rest + (search || '') };
  }

  return { kind: 'none' };
}

/** 画面のリンクの頭。★ conecf.com なら ''、それ以外（プレビュー等）なら '/conecf' */
export function conecfBaseFor(host: string | null | undefined): string {
  return isConecfHost(host) ? '' : CONECF_PATH_PREFIX;
}

/** base と画面内のパス（'/' '/sites' …）からリンク先を作る */
export function conecfHref(base: string, path: string): string {
  const p = path.startsWith('/') ? path : '/' + path;
  if (base === '') return p;
  return p === '/' ? base : base + p;
}
